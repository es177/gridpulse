"""Refresh api/data/snapshot.json, the last-good data a cold instance starts from.

Sources that fail keep their previous snapshot entry, so a partial run never
removes data. Run before deploying: python3 scripts/refresh_snapshot.py
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'api'))

from sources import SOURCES  # noqa: E402
from store import SNAPSHOT, Store  # noqa: E402


async def main() -> int:
    store = Store(SOURCES)
    names = list(SOURCES)
    await asyncio.gather(*(store.get(name, wait=60, force=True) for name in names))
    failed = 0
    for name in names:
        entry = store.entries[name]
        observed = (entry.data or {}).get('observed_at') or '-'
        print(f'{name:14} {"FAIL " + entry.error if entry.error else "ok":28} observed {observed}')
        failed += bool(entry.error)
    SNAPSHOT.write_text(json.dumps(store.snapshot(), ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'wrote {SNAPSHOT.relative_to(SNAPSHOT.parents[2])} ({SNAPSHOT.stat().st_size // 1024} KB)')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
