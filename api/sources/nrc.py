"""NRC: daily power reactor status (365 days), reactor directory, event notification reports."""
from __future__ import annotations

import asyncio
import csv
import io
import re
from datetime import date, datetime, timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python < 3.9
    from backports.zoneinfo import ZoneInfo  # type: ignore

import httpx

try:
    from .common import HEADERS, number, text, utc_iso
except ImportError:
    from common import HEADERS, number, text, utc_iso

BASE = 'https://www.nrc.gov'
STATUS_URL = (BASE + '/documents-reports/document-collections/events-reports-associated-with/'
              'power-reactor-status-reports/PowerReactorStatusForLast365Days.txt')
DIRECTORY_URL = BASE + '/facilities-safety/operating-reactors/list-power-reactor-units'
EVENTS_URL = BASE + '/documents-reports/document-collections/events-reports-associated-with/event-notification-reports'

# NRC's bot filter only admits user agents carrying a known HTTP client token.
NRC_HEADERS = {**HEADERS, 'User-Agent': f'GridPulse/2.0 python-httpx/{httpx.__version__}'}
EASTERN = ZoneInfo('America/New_York')
EVENT_PAGES = 6  # newest daily reports to read; events repeat across days as they update


# ── Daily power status ────────────────────────────────────────────────────────

def _power(value: str) -> int | None:
    result = number(value)
    if result is None or not 0 <= result <= 100:
        return None
    return int(round(result))


def parse_status(raw: str) -> dict:
    """Pipe-delimited ReportDt|Unit|Power for the last 365 days, in any row order."""
    days: dict[date, dict[str, int | None]] = {}
    for row in csv.reader(io.StringIO(raw), delimiter='|'):
        if len(row) != 3 or row[0] == 'ReportDt':
            continue
        try:
            day = datetime.strptime(row[0].split()[0], '%m/%d/%Y').date()
        except (ValueError, IndexError):
            continue
        name = row[1].strip()
        if name:
            days.setdefault(day, {})[name] = _power(row[2])
    if not days:
        raise ValueError('NRC status file has no valid rows')
    dates = sorted(days)
    latest = days[dates[-1]]
    if sum(v is not None for v in latest.values()) < 80:
        raise ValueError('Incomplete NRC daily fleet report')
    units = [{'name': name, 'power': [days[d].get(name) for d in dates]} for name in sorted(latest)]
    return {
        'observed_at': dates[-1].isoformat() + 'T00:00:00+00:00',
        'report_date': dates[-1].isoformat(),
        'dates': [d.isoformat() for d in dates],
        'units': units,
        'source_url': STATUS_URL,
    }


async def fetch_status(client) -> dict:
    response = await client.get(STATUS_URL, headers=NRC_HEADERS)
    response.raise_for_status()
    return parse_status(response.text)


# ── Reactor directory ─────────────────────────────────────────────────────────

def parse_directory(markup: str) -> dict:
    units = []
    for row in re.findall(r'<tr\b.*?</tr>', markup, re.S | re.I):
        cells = re.findall(r'<td\b[^>]*>(.*?)</td>', row, re.S | re.I)
        if len(cells) < 5:
            continue
        link = re.search(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', cells[0], re.S | re.I)
        # Part 50 licenses use 050xxxxx; Part 52 combined licenses (Vogtle 3/4) use 052xxxxx.
        docket = re.search(r'\b05[02]\d{5}\b', text(cells[0]))
        location = text(cells[3])
        state = re.search(r'\b([A-Z]{2})$', location)
        if not link or not docket or not state:
            continue
        href = link[1]
        units.append({
            'name': text(link[2]),
            'docket': docket[0],
            'state': state[1],
            'type': text(cells[2]),
            'operator': text(cells[4]),
            'location': location,
            'url': BASE + href if href.startswith('/') else href,
        })
    if len(units) < 90:
        raise ValueError('Incomplete NRC reactor directory')
    return {'observed_at': None, 'units': units, 'source_url': DIRECTORY_URL}


async def fetch_directory(client) -> dict:
    response = await client.get(DIRECTORY_URL, headers=NRC_HEADERS)
    response.raise_for_status()
    return parse_directory(response.text)


# ── Event notification reports ────────────────────────────────────────────────

def parse_event_index(markup: str) -> list[str]:
    """Daily report URLs from a year index, newest first."""
    paths = re.findall(r'href="([^"]*/event-notification-reports/\d{4}/(\d{8})en)"', markup)
    unique = {day: (BASE + path if path.startswith('/') else path) for path, day in paths}
    return [unique[day] for day in sorted(unique, reverse=True)]


def _field(block: str, label: str) -> str | None:
    # A value ends at the next line break, label or closing cell.
    match = re.search(r'<b>\s*' + re.escape(label) + r':?\s*</b>(.*?)(?:<br|<b>|</div>)', block, re.S | re.I)
    value = text(match[1]) if match else ''
    return value or None


def _day(value: str | None) -> str | None:
    try:
        return datetime.strptime(value or '', '%m/%d/%Y').date().isoformat()
    except ValueError:
        return None


def _eastern(day: str | None, clock: str | None) -> str | None:
    if not day:
        return None
    try:
        moment = datetime.strptime(f'{day} {(clock or "00:00").split()[0]}', '%m/%d/%Y %H:%M')
    except ValueError:
        return None
    return utc_iso(moment.replace(tzinfo=EASTERN))


def _units(block: str) -> list[dict]:
    """Power Reactor Unit Info table: unit, scram code, initial and current power."""
    table = re.search(r'<caption>\s*Power Reactor Unit Info.*?<tbody>(.*?)</tbody>', block, re.S | re.I)
    rows = []
    for row in re.findall(r'<tr\b.*?</tr>', table[1] if table else '', re.S | re.I):
        cells = [text(c) for c in re.findall(r'<td\b[^>]*>(.*?)</td>', row, re.S | re.I)]
        if len(cells) >= 7:
            rows.append({'unit': cells[0], 'scram': cells[1], 'initial': _power(cells[3]),
                         'initial_mode': cells[4], 'current': _power(cells[5]), 'current_mode': cells[6]})
    return rows


# Narrative headlines repeat the category, e.g. "AGREEMENT STATE REPORT - STUCK SHUTTER".
HEADLINE_PREFIX = re.compile(r'^(?:NON-)?(?:AGREEMENT STATE|PART 21)(?:\s+REPORT)?\s*[-–:]\s*')


def parse_events(markup: str, page_url: str) -> list[dict]:
    """Events from one daily report page. Built from structured fields only: the free-text
    narrative names and contact details of individuals, so it is not republished."""
    items = []
    for chunk in re.split(r'<div class="grid border" id="en', markup)[1:]:
        number_match = re.match(r'(\d+)"', chunk)
        if not number_match:
            continue
        en = number_match[1]
        end = chunk.find('<br /><br />')
        block = chunk if end < 0 else chunk[:end]
        category = text((re.search(r'<div class="th">(.*?)</div>', block, re.S) or [None, ''])[1])
        # Reactor and fuel-cycle events name a Facility; materials events name a Licensee.
        facility = _field(block, 'Facility') or _field(block, 'Licensee') or _field(block, 'Rep Org')
        state = _field(block, 'State')
        published = _eastern(_field(block, 'Notification Date'), _field(block, 'Notification Time'))
        updated = _day(_field(block, 'Last Update Date'))
        emergency = _field(block, 'Emergency Class')
        cfr = re.search(r'10 CFR Section:\s*<br>(.*?)</div>', block, re.S | re.I)
        cfr_text = text(cfr[1]) if cfr else ''
        cfr_desc = cfr_text.split(' - ', 1)[-1].strip() if cfr_text else ''
        narrative = re.search(r'<b>Event Text</b>\s*<div class="border">(.*?)<br', block, re.S | re.I)
        headline = text(narrative[1]) if narrative else ''
        headline = headline if headline and len(headline) <= 90 and headline.upper() == headline else ''
        headline = HEADLINE_PREFIX.sub('', headline)
        description = (headline or cfr_desc or category).capitalize()
        units = _units(block)
        unit_label = ''
        if units:
            unit_label = ' ' + '/'.join(u['unit'] for u in units if u['unit'])
        parts = [category, cfr_desc, emergency]
        for u in units:
            if u['initial'] is not None and u['current'] is not None:
                scram = '' if u['scram'] in ('', 'N') else f', scram {u["scram"]}'
                parts.append(f'Unit {u["unit"]}: {u["initial"]}% → {u["current"]}% ({u["current_mode"]}{scram})')
        if not published or not facility:
            continue
        tags = ['nrc-event']
        if any(u['scram'] not in ('', 'N') for u in units):
            tags.append('scram')
        if emergency and emergency.lower() != 'non emergency':
            tags.append('emergency')
        items.append({
            'id': f'EN-{en}',
            'title': f'{facility}{unit_label} — {description}',
            'url': f'{page_url}#en{en}',
            'published': published,
            'updated': updated,
            'source': 'NRC Event Reports',
            'summary': ' · '.join(dict.fromkeys(p for p in parts if p))[:280],
            'tags': tags,
            'category': category or None,
            'facility': facility,
            'state': state,
        })
    return items


def merge_events(pages: list[list[dict]]) -> list[dict]:
    """Pages newest first; an event's newest appearance wins. Sorted by notification time."""
    merged: dict[str, dict] = {}
    for page in pages:
        for item in page:
            merged.setdefault(item['id'], item)
    return sorted(merged.values(), key=lambda i: (i['published'], i['id']), reverse=True)[:50]


async def fetch_events(client) -> dict:
    year = datetime.now(timezone.utc).year
    links: list[str] = []
    for y in (year, year - 1):  # early January: the new year's index may be empty
        response = await client.get(f'{EVENTS_URL}/{y}', headers=NRC_HEADERS)
        if response.status_code == 404:
            continue
        response.raise_for_status()
        links += parse_event_index(response.text)
        if len(links) >= EVENT_PAGES:
            break
    links = links[:EVENT_PAGES]
    if not links:
        raise ValueError('No NRC event report pages listed')

    async def page(url):
        response = await client.get(url, headers=NRC_HEADERS)
        response.raise_for_status()
        return parse_events(response.text, url)

    results = await asyncio.gather(*(page(u) for u in links), return_exceptions=True)
    pages = [r for r in results if not isinstance(r, Exception)]
    if not pages:
        raise ValueError('All NRC event report pages failed')
    items = merge_events(pages)
    if not items:
        raise ValueError('NRC event reports contained no events')
    return {
        'observed_at': max(i['published'] for i in items),
        'items': items,
        'pages': links,
        'source_url': EVENTS_URL,
    }


# ── Join status + directory + reference ───────────────────────────────────────

# Status-report names that differ from the directory after normalization.
ALIASES = {'harris1': 'shearonharris1', 'riverbendstation1': 'riverbend1'}


def normalized(name: str) -> str:
    key = re.sub(r'\bst\.?\s', 'saint ', (name or '').lower())
    key = re.sub(r'[^a-z0-9]', '', key)
    return ALIASES.get(key, key)


def classify(power: int | None) -> str:
    if power is None:
        return 'unknown'
    if power >= 95:
        return 'full'
    return 'reduced' if power > 0 else 'offline'


def join_units(status: dict, directory: dict, reference: dict) -> list[dict]:
    """One row per unit in the latest status report, enriched by docket."""
    dates = status.get('dates') or []
    by_name = {normalized(u['name']): u for u in (directory or {}).get('units', [])}
    by_docket = {u['docket']: u for u in (reference or {}).get('units', [])}
    rows = []
    for unit in status.get('units', []):
        power = unit['power']
        info = by_name.get(normalized(unit['name']), {})
        ref = by_docket.get(info.get('docket'), {})
        today = power[-1] if power else None
        prev = power[-2] if len(power) > 1 else None
        state = classify(today)
        start = len(power) - 1
        while start > 0 and classify(power[start - 1]) == state:
            start -= 1
        recent = [p for p in power[-30:] if p is not None]
        rows.append({
            'name': unit['name'],
            'docket': info.get('docket'),
            'state': info.get('state'),
            'type': info.get('type'),
            'operator': info.get('operator'),
            'url': info.get('url'),
            'lat': ref.get('lat'),
            'lng': ref.get('lng'),
            'mwt': ref.get('mwt'),
            'mwe': ref.get('mwe'),
            'power': power,
            'today': today,
            'prev': prev,
            'change': today - prev if today is not None and prev is not None else None,
            'status': state,
            'since': dates[start] if dates and power else None,
            'avg30': round(sum(recent) / len(recent), 1) if recent else None,
        })
    return rows
