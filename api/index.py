"""GridPulse API: live public energy data, cached per source.

Every route waits only for the sources it needs, returns partial data instead of
failing, and tells the CDN how long to cache. The CDN keeps serving the last good
response while it revalidates, or if the function errors.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, Query  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from sources import ISO_KEYS, SOURCES  # noqa: E402
from sources.iso import META as ISO_META  # noqa: E402
from sources.nrc import join_units  # noqa: E402
from store import Store  # noqa: E402

REACTORS = json.loads((Path(__file__).parent / 'data' / 'reactors.json').read_text())
VERSION = (os.getenv('VERCEL_GIT_COMMIT_SHA') or 'dev')[:7]

store = Store(SOURCES)
log = logging.getLogger('gridpulse')
app = FastAPI(title='GridPulse', docs_url=None, redoc_url=None, openapi_url=None)


def respond(payload: dict, names, cdn_seconds: int, stale_seconds: int) -> JSONResponse:
    payload['sources'] = {name: store.meta(name) for name in names}
    return JSONResponse(payload, headers={
        'Cache-Control': 'no-cache',
        'Vercel-CDN-Cache-Control':
            f'max-age={cdn_seconds}, stale-while-revalidate={stale_seconds}, stale-if-error=604800',
    })


@app.get('/api/grid')
async def grid():
    names = ['eia_grid', 'eia_fuel']
    entries = await store.get_many(names)
    return respond({'demand': entries['eia_grid'].data, 'fuel': entries['eia_fuel'].data},
                   names, 300, 3600)


@app.get('/api/live')
async def live():
    entries = await store.get_many(ISO_KEYS)
    isos = []
    for name in ISO_KEYS:
        key = name[4:]
        data = entries[name].data
        isos.append({**data, 'key': key} if data else
                    {'key': key, 'iso': ISO_META[key]['label'], 'name': ISO_META[key]['name']})
    return respond({'isos': isos}, ISO_KEYS, 60, 600)


def fleet_summary(units: list) -> dict:
    known = [u['today'] for u in units if u.get('today') is not None]
    counts = {state: sum(u['status'] == state for u in units)
              for state in ('full', 'reduced', 'offline', 'unknown')}
    rated = [u for u in units if u.get('mwe') and u.get('today') is not None]
    return {'units': len(units), **counts,
            'mean_power': round(sum(known) / len(known), 1) if known else None,
            'changed': sum(1 for u in units if u.get('change')),
            # Estimate only: reported percent power times nameplate MWe.
            'online_mw': round(sum(u['mwe'] * u['today'] / 100 for u in rated)) if rated else None,
            'capacity_mw': round(sum(u['mwe'] for u in rated)) if rated else None}


@app.get('/api/reactors')
async def reactors(days: int = Query(365, ge=7, le=400)):
    names = ['nrc_status', 'nrc_directory']
    entries = await store.get_many(names)
    status = entries['nrc_status'].data
    try:
        units = join_units(status, entries['nrc_directory'].data, REACTORS) if status else []
    except Exception:  # a parsing bug must not take the page down; status shows the gap
        log.exception('join_units failed')
        units = []
    payload = {
        'report_date': status.get('report_date') if status else None,
        'dates': status['dates'][-days:] if status else [],
        'units': [{**u, 'power': u['power'][-days:]} for u in units],
        'fleet': fleet_summary(units),
    }
    return respond(payload, names, 900, 86400)


@app.get('/api/feed')
async def feed():
    names = ['feeds', 'nrc_events']
    entries = await store.get_many(names)
    items = [*(entries['feeds'].data or {}).get('items', []),
             *(entries['nrc_events'].data or {}).get('items', [])]
    items.sort(key=lambda item: item.get('published') or '', reverse=True)
    return respond({'items': items, 'failed': (entries['feeds'].data or {}).get('failed', [])},
                   names, 300, 3600)


@app.get('/api/prices')
async def prices():
    entry = await store.get('eia_prices')
    return respond({'prices': entry.data}, ['eia_prices'], 3600, 86400)


@app.get('/api/global')
async def world():
    entry = await store.get('wna')
    return respond({'world': entry.data}, ['wna'], 6 * 3600, 7 * 86400)


@app.get('/api/status')
async def status():
    """State of every source. Starts any due refresh in the background without waiting."""
    await store.get_many(list(SOURCES), wait=0)
    return respond({'version': VERSION}, list(SOURCES), 30, 300)
