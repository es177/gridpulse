"""EIA electricity data: hourly grid (EIA-930), US48 fuel mix, monthly retail prices.

The documented v2 API is the primary path. Its shared DEMO_KEY allows about ten
requests an hour, so each fetcher makes one v2 request and, when v2 fails, falls
back to keyless EIA endpoints: the Grid Monitor's 930-api for hourly data and
Electric Power Monthly table 5.6.A for prices.

EIA-930 timing: demand (D) arrives about an hour after the hour; net generation
(NG), interchange (TI) and fuel mix are published about a day behind. Hours are
UTC, identical in both APIs.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone

import httpx

try:
    from .common import HEADERS, add_mix, number, text, utc_iso
except ImportError:  # imported as a top-level module in tests and scripts
    from common import HEADERS, add_mix, number, text, utc_iso

V2 = 'https://api.eia.gov/v2/electricity/'
API930 = 'https://www.eia.gov/electricity/930-api/'
GRID_URL = 'https://www.eia.gov/electricity/gridmonitor/'
PRICES_URL = 'https://www.eia.gov/electricity/data/browser/'
PRICE_TABLE = 'https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a'

# v2 answers in ~1-2 s or fails fast on rate limits; the 930-api takes ~10-12 s.
V2_TIMEOUT = 8.0
FALLBACK_TIMEOUT = 15.0

GRID_HOURS = 72
FUEL_HOURS = 96
FORECAST_HOURS = 24
PRICE_MONTHS = 23  # 52 geographies x 4 sectors x 24 months stays under v2's 5000-row cap

REGIONS = (('US48', 'Lower 48'), ('PJM', 'PJM'), ('MISO', 'MISO'), ('ERCO', 'ERCOT'),
           ('CISO', 'CAISO'), ('SWPP', 'SPP'), ('NYIS', 'NYISO'), ('ISNE', 'ISO-NE'))
MIN_REGIONS = 6
SERIES = {'D': 'd', 'DF': 'df', 'NG': 'ng', 'TI': 'ti'}

FUEL_CODES = {'NUC': 'nuclear', 'NG': 'gas', 'COL': 'coal', 'OIL': 'oil', 'WAT': 'hydro',
              'WND': 'wind', 'WNB': 'wind', 'SUN': 'solar', 'SNB': 'solar', 'GEO': 'geothermal',
              'BAT': 'storage', 'PS': 'storage', 'OES': 'storage', 'UES': 'storage',
              'OTH': 'other', 'UNK': 'other'}
# Completeness is judged on the primary codes; hybrid SNB/WNB rows do not stand in for SUN/WND.
ESSENTIAL_CODES = {'NUC', 'NG', 'COL', 'WND', 'SUN', 'WAT'}

STATES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'DC': 'District of Columbia',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois',
    'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana',
    'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
    'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon',
    'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota',
    'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia',
    'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
    'US': 'U.S. Total',
}
SECTORS = {'RES': 'res', 'COM': 'com', 'IND': 'ind', 'ALL': 'all'}
MIN_STATES = 48


def api_key() -> str:
    return os.getenv('EIA_API_KEY') or 'DEMO_KEY'


def reason(error: Exception) -> str:
    """Short failure description that never echoes request URLs (they carry the API key)."""
    if isinstance(error, httpx.HTTPStatusError):
        return f'HTTP {error.response.status_code}'
    if isinstance(error, ValueError):
        return str(error)
    return type(error).__name__


def v2_hour(period) -> str | None:
    try:
        return utc_iso(datetime.strptime(period, '%Y-%m-%dT%H').replace(tzinfo=timezone.utc))
    except (TypeError, ValueError):
        return None


def hour_930(stamp) -> str | None:
    try:
        return utc_iso(datetime.strptime(stamp, '%m/%d/%Y %H:%M:%S').replace(tzinfo=timezone.utc))
    except (TypeError, ValueError):
        return None


def hours_between(first: str, last: str):
    hour = datetime.fromisoformat(first)
    end = datetime.fromisoformat(last)
    while hour <= end:
        yield utc_iso(hour)
        hour += timedelta(hours=1)


def v2_rows(payload) -> list:
    if not isinstance(payload, dict) or payload.get('error'):
        raise ValueError('EIA v2 rejected the request')
    rows = (payload.get('response') or {}).get('data')
    if not rows:
        raise ValueError('EIA v2 returned no observations')
    return rows


def series_930(payload) -> list:
    try:
        series = payload[0]['data']
    except (KeyError, IndexError, TypeError):
        raise ValueError('EIA 930-api returned an unexpected payload') from None
    if not series:
        raise ValueError('EIA 930-api returned no series')
    if any(s.get('TIME_ZONE') != 'UTC' for s in series):
        raise ValueError('EIA 930-api series not in UTC')
    return series


# Hourly grid ------------------------------------------------------------------

def build_grid(points, via: str) -> dict:
    """points: (respondent, type, utc_hour, MW). Returns contiguous hourly series per region."""
    names = dict(REGIONS)
    by_region: dict = {}
    for respondent, kind, hour, value in points:
        if respondent not in names or kind not in SERIES or hour is None or value is None:
            continue
        if kind == 'D' and value <= 0:
            continue
        by_region.setdefault(respondent, {}).setdefault(hour, {})[SERIES[kind]] = value
    regions = []
    for code, name in REGIONS:
        hours = by_region.get(code, {})
        reported = [h for h, v in hours.items() if 'd' in v]
        if not reported:
            continue
        latest = max(reported)
        horizon = utc_iso(datetime.fromisoformat(latest) + timedelta(hours=FORECAST_HOURS))
        # US48 forecasts for hours not yet reported are partial sums of the BAs that
        # have submitted so far; only single-BA forecasts are shown ahead of actuals.
        last = latest if code == 'US48' else min(max(hours), horizon)
        series = [{'t': h, **{k: hours.get(h, {}).get(k) for k in ('d', 'df', 'ng', 'ti')}}
                  for h in hours_between(min(hours), last)]
        balance = [h for h, v in hours.items() if 'ng' in v]
        regions.append({
            'id': code, 'name': name, 'series': series,
            'latest': next(p for p in series if p['t'] == latest),
            'latest_balance': ({'t': max(balance), 'ng': hours[max(balance)]['ng'],
                                'ti': hours[max(balance)].get('ti')} if balance else None),
        })
    if not regions or regions[0]['id'] != 'US48':
        raise ValueError('EIA returned no US48 demand')
    if len(regions) < MIN_REGIONS:
        raise ValueError(f'EIA returned only {len(regions)} of {len(REGIONS)} regions')
    return {'observed_at': regions[0]['latest']['t'], 'regions': regions, 'via': via,
            'source_url': GRID_URL}


def parse_v2_grid(payload) -> dict:
    return build_grid(((r.get('respondent'), r.get('type'), v2_hour(r.get('period')),
                        number(r.get('value'))) for r in v2_rows(payload)), 'eia-v2')


def parse_930_grid(payload) -> dict:
    points = []
    for s in series_930(payload):
        values = s.get('VALUES') or {}
        for stamp, value in zip(values.get('DATES') or [], values.get('DATA') or []):
            points.append((s.get('RESPONDENT_ID'), s.get('TYPE_ID'), hour_930(stamp), number(value)))
    return build_grid(points, 'eia-930-api')


# US48 fuel mix ------------------------------------------------------------------

def build_fuel(points, via: str) -> dict:
    """points: (utc_hour, EIA fuel code, MW). Keeps only hours reporting every major fuel."""
    mixes: dict = {}
    present: dict = {}
    for hour, code, value in points:
        if hour is None or value is None or not code:
            continue
        add_mix(mixes.setdefault(hour, {}), FUEL_CODES.get(code, 'other'), value)
        present.setdefault(hour, set()).add(code)
    complete = sorted(h for h in mixes if ESSENTIAL_CODES <= present[h])
    if not complete:
        raise ValueError('EIA returned no complete US48 fuel mix')
    return {'observed_at': complete[-1], 'series': [{'t': h, 'mix': mixes[h]} for h in complete],
            'via': via, 'source_url': GRID_URL}


def parse_v2_fuel(payload) -> dict:
    return build_fuel(((v2_hour(r.get('period')), r.get('fueltype'), number(r.get('value')))
                       for r in v2_rows(payload) if r.get('respondent') == 'US48'), 'eia-v2')


def parse_930_fuel(payload) -> dict:
    points = []
    for s in series_930(payload):
        if s.get('RESPONDENT_ID') != 'US48' or s.get('TYPE_ID') != 'NG':
            continue
        values = s.get('VALUES') or {}
        for stamp, value in zip(values.get('DATES') or [], values.get('DATA') or []):
            points.append((hour_930(stamp), s.get('FUEL_TYPE_ID'), number(value)))
    return build_fuel(points, 'eia-930-api')


# Retail prices ------------------------------------------------------------------

def year_before(period: str) -> str:
    return f'{int(period[:4]) - 1}{period[4:]}'


def build_prices(points, via: str, min_states: int = MIN_STATES) -> dict:
    """points: (state code, sector, 'YYYY-MM', cents/kWh). Uses one common reporting month."""
    values = {}
    for state, sector, period, cents in points:
        if state not in STATES or sector not in SECTORS or not period or cents is None:
            continue
        if 0 < cents < 100:
            values[(state, SECTORS[sector], period)] = cents
    periods = sorted({p for _, _, p in values}, reverse=True)
    # A series counts as expected if it reported at any time in the latest year, so a
    # long-discontinued series cannot block every month.
    recent = set(periods[:12])
    expected = {(s, k) for s, k, p in values if p in recent}
    period = next((p for p in periods
                   if all((s, k, p) in values for s, k in expected)), None)
    if period is None:
        raise ValueError('EIA prices have no month reported by every state')
    prior = year_before(period)

    def row(state):
        result = {'state': state, 'name': STATES[state]}
        for sector in SECTORS.values():
            current, previous = values.get((state, sector, period)), values.get((state, sector, prior))
            result[sector] = current
            result[f'{sector}_yoy'] = (round((current / previous - 1) * 100, 2)
                                       if current is not None and previous else None)
        return result

    states = sorted({s for s, _ in expected if s != 'US'}, key=STATES.get)
    if 'US' not in {s for s, _ in expected} or len(states) < min_states:
        raise ValueError(f'EIA prices cover only {len(states)} states')
    us_history = [{'period': p, **{k: values.get(('US', k, p)) for k in SECTORS.values()}}
                  for p in sorted(periods) if any(('US', k, p) in values for k in SECTORS.values())]
    return {'observed_at': f'{period}-01T00:00:00+00:00', 'period': period,
            'rows': [row(s) for s in states], 'us': row('US'), 'us_history': us_history,
            'unit': 'cents/kWh', 'via': via, 'source_url': PRICES_URL}


def parse_v2_prices(payload, min_states: int = MIN_STATES) -> dict:
    rows = v2_rows(payload)
    if any(r.get('price-units') not in (None, 'cents per kilowatt-hour') for r in rows):
        raise ValueError('EIA prices changed units')
    return build_prices(((r.get('stateid'), r.get('sectorid'), r.get('period'), number(r.get('price')))
                         for r in rows), 'eia-v2', min_states)


TABLE_COLUMNS = (('RES', 1), ('COM', 3), ('IND', 5), ('ALL', 9))


def parse_price_table(markup: str, min_states: int = MIN_STATES) -> dict:
    """Electric Power Monthly table 5.6.A: every state, current month and a year earlier."""
    labels = [text(h) for h in re.findall(r'<th\b[^>]*>(.*?)</th>', markup, re.S | re.I)]
    if labels[:6] != ['', 'Residential', 'Commercial', 'Industrial', 'Transportation', 'All Sectors']:
        raise ValueError('EIA table 5.6.A column schema changed')
    dates = labels[7:17]
    if len(dates) != 10 or len(set(dates[::2])) != 1 or len(set(dates[1::2])) != 1:
        raise ValueError('EIA table 5.6.A periods inconsistent')
    try:
        current, previous = (datetime.strptime(d, '%B %Y').strftime('%Y-%m') for d in dates[:2])
    except ValueError:
        raise ValueError('EIA table 5.6.A periods unreadable') from None
    if previous != year_before(current):
        raise ValueError('EIA table 5.6.A does not compare the same month')
    codes = {name: code for code, name in STATES.items()}
    points = []
    for tr in re.findall(r'<tr\b[^>]*>(.*?)</tr>', markup, re.S | re.I):
        cells = [text(c) for c in re.findall(r'<td\b[^>]*>(.*?)</td>', tr, re.S | re.I)]
        if len(cells) != 11 or cells[0] not in codes:
            continue
        for sector, index in TABLE_COLUMNS:
            for offset, period in enumerate((current, previous)):
                points.append((codes[cells[0]], sector, period, number(cells[index + offset])))
    return build_prices(points, 'eia-epm-table', min_states)


# Fetchers -----------------------------------------------------------------------

def _start(hours: int) -> datetime:
    return datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) - timedelta(hours=hours)


async def _v2(client, route: str, params: dict):
    response = await client.get(V2 + route, params={'api_key': api_key(), **params},
                                headers=HEADERS, timeout=V2_TIMEOUT)
    response.raise_for_status()
    return response.json()


async def _api930(client, route: str, params: dict, hours: int):
    start = _start(hours)
    window = {'start': start.strftime('%m%d%Y %H:%M:%S'),
              'end': (start + timedelta(hours=hours + FORECAST_HOURS + 2)).strftime('%m%d%Y %H:%M:%S'),
              'frequency': 'hourly', 'timezone': 'UTC', 'limit': 10000, 'offset': 0}
    response = await client.get(API930 + route, params={**params, **window},
                                headers=HEADERS, timeout=FALLBACK_TIMEOUT)
    response.raise_for_status()
    return response.json()


async def _with_fallback(label: str, primary, fallback):
    try:
        return await primary()
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as first:
        try:
            return await fallback()
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as second:
            raise ValueError(f'EIA {label} unavailable: v2 {reason(first)}; fallback {reason(second)}') from None


async def fetch_grid(client) -> dict:
    codes = [code for code, _ in REGIONS]

    async def primary():
        return parse_v2_grid(await _v2(client, 'rto/region-data/data/', {
            'frequency': 'hourly', 'data[0]': 'value', 'facets[respondent][]': codes,
            'facets[type][]': list(SERIES), 'start': _start(GRID_HOURS).strftime('%Y-%m-%dT%H'),
            'sort[0][column]': 'period', 'sort[0][direction]': 'desc', 'length': 5000}))

    async def fallback():
        params = {f'type[{i}]': t for i, t in enumerate(SERIES)}
        params.update({f'respondent[{i}]': c for i, c in enumerate(codes)})
        return parse_930_grid(await _api930(client, 'region_data/series_data', params, GRID_HOURS))

    return await _with_fallback('grid', primary, fallback)


async def fetch_fuel(client) -> dict:
    async def primary():
        return parse_v2_fuel(await _v2(client, 'rto/fuel-type-data/data/', {
            'frequency': 'hourly', 'data[0]': 'value', 'facets[respondent][]': 'US48',
            'start': _start(FUEL_HOURS).strftime('%Y-%m-%dT%H'),
            'sort[0][column]': 'period', 'sort[0][direction]': 'desc', 'length': 5000}))

    async def fallback():
        return parse_930_fuel(await _api930(client, 'region_data_by_fuel_type/series_data',
                                            {'respondent[0]': 'US48'}, FUEL_HOURS))

    return await _with_fallback('fuel mix', primary, fallback)


async def fetch_prices(client) -> dict:
    async def primary():
        start = datetime.now(timezone.utc).replace(day=1) - timedelta(days=PRICE_MONTHS * 31)
        return parse_v2_prices(await _v2(client, 'retail-sales/data/', {
            'frequency': 'monthly', 'data[0]': 'price', 'facets[stateid][]': list(STATES),
            'facets[sectorid][]': list(SECTORS), 'start': start.strftime('%Y-%m'),
            'sort[0][column]': 'period', 'sort[0][direction]': 'desc', 'length': 5000}))

    async def fallback():
        response = await client.get(PRICE_TABLE, headers=HEADERS, timeout=FALLBACK_TIMEOUT)
        response.raise_for_status()
        return parse_price_table(response.text)

    return await _with_fallback('prices', primary, fallback)
