"""Per-source cache. Refresh on demand, keep the last good value, never block for long.

Each source refreshes independently, so one slow or failing upstream never delays
another. A failed refresh keeps the previous data and records a short error. On a
cold start the bundled snapshot provides last-good data until the first refresh.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

from sources.common import HEADERS, Source, now_iso

SNAPSHOT = Path(__file__).parent / 'data' / 'snapshot.json'
# How long a request waits for a due refresh before answering with what it has.
# With last-good data in hand, answer fast; on a true cold start, wait longer.
WAIT_WARM = 2.5
WAIT_COLD = 12.0
RETRY = 120         # seconds before retrying a source whose last attempt failed
log = logging.getLogger('gridpulse')


@dataclass
class Entry:
    data: Optional[dict] = None
    fetched_at: Optional[str] = None     # last successful refresh (UTC ISO)
    checked_at: Optional[str] = None     # last attempt (UTC ISO)
    error: Optional[str] = None
    next_due: float = float('-inf')      # monotonic time of the next allowed attempt
    task: Optional[asyncio.Task] = None


class Store:
    def __init__(self, sources: dict, snapshot: Path = SNAPSHOT):
        self.sources = sources
        self.entries = {name: Entry() for name in sources}
        try:
            saved = json.loads(snapshot.read_text()) if snapshot.exists() else {}
        except (OSError, ValueError):
            saved = {}
        for name, entry in self.entries.items():
            if isinstance(saved.get(name), dict) and saved[name].get('data'):
                entry.data = saved[name]['data']
                entry.fetched_at = saved[name].get('fetched_at')

    async def _refresh(self, source: Source) -> None:
        entry = self.entries[source.name]
        try:
            async with httpx.AsyncClient(headers=HEADERS, timeout=source.timeout,
                                         follow_redirects=True) as client:
                data = await asyncio.wait_for(source.fetch(client), source.timeout)
            if not isinstance(data, dict):
                raise ValueError('fetch returned no payload')
            if source.carry:
                data = source.carry(data, entry.data)
            entry.data, entry.fetched_at, entry.error = data, now_iso(), None
            entry.next_due = time.monotonic() + source.ttl
        except Exception as exc:  # any upstream failure keeps the last good data
            # Never echo upstream bodies or URLs (they can carry API keys).
            entry.error = 'timeout' if isinstance(exc, asyncio.TimeoutError) else type(exc).__name__
            if isinstance(exc, httpx.HTTPStatusError):
                entry.error = f'HTTP {exc.response.status_code}'
            elif isinstance(exc, ValueError) and len(str(exc)) < 120 and 'api_key' not in str(exc):
                entry.error = f'invalid data: {exc}'
            entry.next_due = time.monotonic() + min(RETRY, source.ttl)
            log.warning('refresh %s failed: %s', source.name, entry.error)
        finally:
            entry.checked_at = now_iso()
            if entry.task is asyncio.current_task():
                entry.task = None  # a task abandoned on another loop must not clear its successor

    async def get(self, name: str, wait: Optional[float] = None, force: bool = False) -> Entry:
        """Return the entry, refreshing first if due, without waiting past the budget."""
        source, entry = self.sources[name], self.entries[name]
        if entry.task is not None and entry.task.get_loop() is not asyncio.get_running_loop():
            entry.task = None  # left behind by a runtime that uses a new loop per request
        if (force or time.monotonic() >= entry.next_due) and entry.task is None:
            entry.task = asyncio.ensure_future(self._refresh(source))
        if wait is None:
            wait = WAIT_WARM if entry.data is not None else WAIT_COLD
        if entry.task is not None and wait > 0:
            try:
                await asyncio.wait_for(asyncio.shield(entry.task), wait)
            except asyncio.TimeoutError:
                pass  # serve last good; the refresh keeps running
        return entry

    async def get_many(self, names, wait: Optional[float] = None) -> dict:
        entries = await asyncio.gather(*(self.get(n, wait) for n in names))
        return dict(zip(names, entries))

    def meta(self, name: str) -> dict:
        """Facts only. Clients derive ok/stale from timestamps with their own clock,
        so a CDN-cached response never carries a frozen status."""
        source, entry = self.sources[name], self.entries[name]
        return {
            'label': source.label,
            'url': source.url,
            'cadence': source.cadence,
            'resolution': source.resolution,
            'stale_after': source.stale_after,
            'observed_at': (entry.data or {}).get('observed_at'),
            'fetched_at': entry.fetched_at,
            'checked_at': entry.checked_at,
            'error': entry.error,
            'has_data': entry.data is not None,
        }

    def snapshot(self) -> dict:
        return {name: {'data': e.data, 'fetched_at': e.fetched_at}
                for name, e in self.entries.items() if e.data is not None}
