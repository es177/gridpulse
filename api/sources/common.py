"""Helpers shared by every source module. Parsers stay pure; fetchers raise on bad data."""
from __future__ import annotations

import html
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional

# NRC's bot filter rejects browser-like user agents that lack browser headers.
# A plain, honest client identifier is accepted by every source we use.
HEADERS = {'User-Agent': 'GridPulse/2.0 (public energy data dashboard)', 'Accept': '*/*'}

# Canonical fuel keys used across EIA and ISO feeds. Storage is positive when
# discharging and negative when charging. Imports are net imports into the area.
FUELS = ('nuclear', 'gas', 'coal', 'oil', 'hydro', 'wind', 'solar', 'geothermal',
         'biomass', 'storage', 'imports', 'other')


def utc_iso(dt: datetime) -> str:
    """ISO 8601 in UTC with explicit offset, second precision."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def now_iso() -> str:
    return utc_iso(datetime.now(timezone.utc))


def number(value) -> float | None:
    """Finite float or None. Accepts strings with thousands separators."""
    if value is None:
        return None
    try:
        result = float(str(value).replace(',', '').strip())
    except ValueError:
        return None
    return result if math.isfinite(result) else None


def text(markup: str | None) -> str:
    """Strip tags and entities, collapse whitespace."""
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', markup or ''))).strip()


def add_mix(mix: dict, fuel: str, value: float | None) -> None:
    """Accumulate MW into a canonical fuel bucket, ignoring missing values."""
    if value is None:
        return
    if fuel not in FUELS:
        raise ValueError(f'Unknown fuel key {fuel!r}')
    mix[fuel] = mix.get(fuel, 0.0) + value


@dataclass(frozen=True)
class Source:
    name: str
    fetch: Callable[..., Awaitable[dict]]  # async (httpx.AsyncClient) -> payload
    ttl: int                 # seconds between successful upstream refreshes
    stale_after: int         # seconds after observed_at (or fetched_at) before data is stale
    label: str
    url: str
    cadence: str
    timeout: float = 20.0    # hard cap on one refresh
    resolution: str = 'time' # precision of observed_at: 'time', 'day' or 'month'
    carry: Optional[Callable[[dict, Optional[dict]], dict]] = None  # (new, previous) -> merged
