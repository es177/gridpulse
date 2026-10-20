"""Keyless real-time fuel mix and load published by US grid operators (ISOs/RTOs).

Each fetch_<iso> returns the latest interval plus the current operating day at
15-minute resolution. Parsers are pure and raise ValueError on empty, garbled or
implausible data so the caller keeps its last good value. Missing values stay
missing. PJM is absent: its real-time data requires a registered API key.
"""
from __future__ import annotations

import asyncio
import bisect
import csv
import functools
import io
from datetime import date, datetime, time, timedelta, timezone

from zoneinfo import ZoneInfo

try:
    from .common import add_mix, number, utc_iso
except ImportError:
    from common import add_mix, number, utc_iso

UTC = timezone.utc
EST = timezone(timedelta(hours=-5))  # MISO publishes Eastern Standard Time all year.
FUTURE_SLACK = timedelta(minutes=15)
STEP = timedelta(minutes=15)

META = {
    'caiso': {'label': 'CAISO', 'name': 'California ISO', 'url': 'https://www.caiso.com/todays-outlook', 'cadence': '5-minute'},
    'ercot': {'label': 'ERCOT', 'name': 'Electric Reliability Council of Texas', 'url': 'https://www.ercot.com/gridmktinfo/dashboards', 'cadence': '5-minute'},
    'spp': {'label': 'SPP', 'name': 'Southwest Power Pool', 'url': 'https://portal.spp.org/pages/generation-mix', 'cadence': '5-minute'},
    'miso': {'label': 'MISO', 'name': 'Midcontinent ISO', 'url': 'https://www.misoenergy.org/markets-and-operations/real-time--market-data/markets-displays/', 'cadence': '5-minute'},
    'nyiso': {'label': 'NYISO', 'name': 'New York ISO', 'url': 'https://www.nyiso.com/real-time-dashboard', 'cadence': '5-minute'},
    'isone': {'label': 'ISO-NE', 'name': 'ISO New England', 'url': 'https://www.iso-ne.com/isoexpress/', 'cadence': '~5-minute'},
}
_ZONES = {'caiso': 'America/Los_Angeles', 'ercot': 'America/Chicago', 'spp': 'America/Chicago',
          'miso': 'America/Chicago', 'nyiso': 'America/New_York', 'isone': 'America/New_York'}
_DAY_TZ = {'miso': EST}  # operating-day boundary when it differs from the display zone

CAISO_FUEL = 'https://www.caiso.com/outlook/current/fuelsource.csv'
CAISO_DEMAND = 'https://www.caiso.com/outlook/current/demand.csv'
ERCOT_FUEL = 'https://www.ercot.com/api/1/services/read/dashboards/fuel-mix.json'
ERCOT_DEMAND = 'https://www.ercot.com/api/1/services/read/dashboards/supply-demand.json'
ERCOT_PRICES = 'https://www.ercot.com/api/1/services/read/dashboards/system-wide-prices.json'
SPP_MIX = 'https://portal.spp.org/chart-api/gen-mix/asChart'
SPP_LOAD = 'https://portal.spp.org/chart-api/load-forecast/asChart'
MISO_MIX = 'https://public-api.misoenergy.org/api/FuelMix'
MISO_LOAD = 'https://public-api.misoenergy.org/api/RealTimeTotalLoad'
NYISO_MIX = 'https://mis.nyiso.com/public/csv/rtfuelmix/{day}rtfuelmix.csv'
NYISO_LOAD = 'https://mis.nyiso.com/public/csv/pal/{day}pal.csv'
ISONE_WS = 'https://www.iso-ne.com/ws/wsclient'

# Source category -> canonical fuel key. Unknown categories fall into 'other' so
# generation is never dropped; known aggregate columns are excluded explicitly.
CAISO_MAP = {'Solar': 'solar', 'Wind': 'wind', 'Geothermal': 'geothermal', 'Biomass': 'biomass',
             'Biogas': 'biomass', 'Small hydro': 'hydro', 'Coal': 'coal', 'Nuclear': 'nuclear',
             'Natural Gas': 'gas', 'Large Hydro': 'hydro', 'Batteries': 'storage', 'Imports': 'imports',
             'Other': 'other'}
ERCOT_MAP = {'Coal and Lignite': 'coal', 'Hydro': 'hydro', 'Nuclear': 'nuclear', 'Other': 'other',
             'Power Storage': 'storage', 'Solar': 'solar', 'Wind': 'wind', 'Natural Gas': 'gas'}
ERCOT_SKIP = {'Power Storage Charging', 'Power Storage Discharging'}  # components of Power Storage
SPP_MAP = {'Coal': 'coal', 'Diesel Fuel Oil': 'oil', 'Hydro': 'hydro', 'Natural Gas': 'gas',
           'Nuclear': 'nuclear', 'Solar': 'solar', 'Waste Disposal Services': 'biomass', 'Wind': 'wind',
           'Waste Heat': 'other', 'Energy Storage': 'storage', 'Other': 'other'}
MISO_MAP = {'Coal': 'coal', 'Natural Gas': 'gas', 'Nuclear': 'nuclear', 'Wind': 'wind', 'Solar': 'solar',
            'Battery Storage': 'storage', 'Hydro': 'hydro', 'Other': 'other', 'Imports': 'imports'}
# NYISO "Dual Fuel" units burn gas or oil and run mostly on gas; "Other Fossil Fuels" is oil and kerosene.
NYISO_MAP = {'Dual Fuel': 'gas', 'Natural Gas': 'gas', 'Nuclear': 'nuclear', 'Other Fossil Fuels': 'oil',
             'Other Renewables': 'other', 'Wind': 'wind', 'Hydro': 'hydro'}
ISONE_MAP = {'Wind': 'wind', 'Solar': 'solar', 'Wood': 'biomass', 'LandfillGas': 'biomass', 'Refuse': 'biomass',
             'Batteries': 'storage', 'NaturalGas': 'gas', 'Nuclear': 'nuclear', 'NetImports': 'imports',
             'Hydro': 'hydro', 'Coal': 'coal', 'Oil': 'oil', 'Other': 'other'}
ISONE_SKIP = {'BeginDate', 'BeginDateMs', 'Renewables'}  # Renewables is the sum of other columns


def _strict(parse):
    """Report any malformed payload as ValueError so callers keep their last good value."""
    @functools.wraps(parse)
    def wrapper(*args, **kwargs):
        try:
            return parse(*args, **kwargs)
        except (KeyError, TypeError, AttributeError, IndexError) as exc:
            raise ValueError(f'{parse.__name__}: unexpected payload shape ({type(exc).__name__})') from exc
    return wrapper


def _now(now: datetime | None) -> datetime:
    return (now or datetime.now(UTC)).astimezone(UTC)


def _fuel(mapping: dict, category: str) -> str:
    return mapping.get(category.strip(), 'other')


def _at(points: list, mark: datetime):
    """Value in effect at mark: the latest point at or before it, within one step."""
    i = bisect.bisect_right([p[0] for p in points], mark) - 1
    if i >= 0 and mark - points[i][0] < STEP:
        return points[i][1]
    return None


def _build(key: str, loads: list, mixes: list, now: datetime | None = None, price: dict | None = None,
           source_url: str = '', interval: int = 5) -> dict:
    """Assemble the shared payload from (utc datetime, value) pairs and validate it."""
    now = _now(now)
    label = META[key]['label']
    loads = [(t, v) for t, v in loads if v is not None]
    positive = sorted((t, v) for t, v in loads if v > 0)
    if loads and not positive:
        raise ValueError(f'{label}: implausible load')
    loads = positive  # a single zero or negative interval is a reporting glitch, not load
    mixes = sorted(((t, m) for t, m in mixes if m), key=lambda p: p[0])
    if not mixes:
        raise ValueError(f'{label}: no fuel mix observations')
    latest_mix = mixes[-1][1]
    if sum(latest_mix.values()) <= 0:
        raise ValueError(f'{label}: implausible fuel mix total')
    latest = max(mixes[-1][0], loads[-1][0] if loads else mixes[-1][0])
    if latest > now + FUTURE_SLACK:
        raise ValueError(f'{label}: observation timestamps are in the future')

    tz = _DAY_TZ.get(key) or ZoneInfo(_ZONES[key])
    day_start = datetime.combine(latest.astimezone(tz).date(), time(), tz).astimezone(UTC)
    mark = day_start + (-(day_start - datetime(1970, 1, 1, tzinfo=UTC)) % STEP)
    series = []
    while mark <= latest:
        load, mix = _at(loads, mark), _at(mixes, mark)
        if load is not None or mix is not None:
            series.append({'t': utc_iso(mark), 'load_mw': _round(load),
                           'mix': {k: _round(v) for k, v in (mix or {}).items()}})
        mark += STEP
    # Series points sit on quarter-hour marks and hold the latest value at or before each mark.
    # Load and mix often arrive one interval apart (MISO's load trails its mix by 5 minutes), so
    # each latest value carries its own time; observed_at is the newer of the two.
    return {
        'iso': label, 'name': META[key]['name'], 'tz': _ZONES[key],
        'observed_at': utc_iso(latest), 'interval_minutes': interval,
        'load_mw': _round(loads[-1][1]) if loads else None,
        'load_at': utc_iso(loads[-1][0]) if loads else None,
        'mix': {k: _round(v) for k, v in latest_mix.items()},
        'mix_at': utc_iso(mixes[-1][0]),
        'series': series, 'price': price, 'source_url': source_url,
    }


def _round(value):
    return None if value is None else round(value, 1)


def _rows(text: str) -> list:
    body = (text or '').lstrip('\ufeff').strip()
    rows = [r for r in csv.reader(io.StringIO(body)) if r and any(c.strip() for c in r)]
    if len(rows) < 2:
        raise ValueError('CSV has no data rows')
    return rows


# --- CAISO: bare HH:MM local times for one operating day ---------------------------------

def _caiso_times(times: list, has_data: list, now: datetime) -> list:
    """Resolve bare local HH:MM strings to UTC, handling midnight rollover and DST."""
    tz = ZoneInfo(_ZONES['caiso'])
    keys, day, fold, prev = [], 0, 0, None
    for value in times:
        hh, mm = (int(x) for x in value.strip().split(':'))
        minutes = hh * 60 + mm
        if prev is not None and minutes < prev:
            if prev - minutes > 120:
                day, fold = day + 1, 0       # wrapped past midnight
            else:
                fold = 1                     # repeated hour when clocks fall back
        prev = minutes
        keys.append((day, hh, mm, fold))

    def resolve(base: date) -> list:
        out = []
        for day_offset, hh, mm, fold_flag in keys:
            d = base + timedelta(days=day_offset)
            out.append(datetime(d.year, d.month, d.day, hh, mm, tzinfo=tz, fold=fold_flag).astimezone(UTC))
        return out

    base = now.astimezone(tz).date()
    resolved = resolve(base)
    observed = [t for t, ok in zip(resolved, has_data) if ok]
    # Just after local midnight the "current" files can still hold yesterday.
    if observed and max(observed) > now + FUTURE_SLACK:
        resolved = resolve(base - timedelta(days=1))
    return resolved


@_strict
def parse_caiso(fuel_csv: str, demand_csv: str | None = None, now: datetime | None = None) -> dict:
    now = _now(now)
    rows = _rows(fuel_csv)
    header = [h.strip() for h in rows[0]]
    if header[0] != 'Time' or not {'Solar', 'Wind', 'Natural Gas', 'Nuclear'} <= set(header):
        raise ValueError('CAISO fuel source schema changed')
    times = _caiso_times([r[0] for r in rows[1:]], [any(c.strip() for c in r[1:]) for r in rows[1:]], now)
    mixes = []
    for t, row in zip(times, rows[1:]):
        mix = {}
        for name, cell in zip(header[1:], row[1:]):
            add_mix(mix, _fuel(CAISO_MAP, name), number(cell))
        mixes.append((t, mix))
    loads = []
    if demand_csv:
        drows = _rows(demand_csv)
        dheader = [h.strip() for h in drows[0]]
        if 'Current demand' not in dheader:
            raise ValueError('CAISO demand schema changed')
        col = dheader.index('Current demand')
        filled = [len(r) > col and number(r[col]) is not None for r in drows[1:]]
        dtimes = _caiso_times([r[0] for r in drows[1:]], filled, now)
        loads = [(t, number(r[col]) if len(r) > col else None) for t, r in zip(dtimes, drows[1:])]
        loads = [(t, v) for t, v in loads if v is not None and t <= now + FUTURE_SLACK]
    return _build('caiso', loads, mixes, now, source_url=CAISO_FUEL)


async def fetch_caiso(client) -> dict:
    fuel, demand = await asyncio.gather(_text(client, CAISO_FUEL), _text(client, CAISO_DEMAND),
                                        return_exceptions=True)
    if isinstance(fuel, Exception):
        raise fuel
    return parse_caiso(fuel, None if isinstance(demand, Exception) else demand)


# --- ERCOT: dashboard JSON with explicit UTC offsets --------------------------------------

def _ercot_time(value: str) -> datetime:
    return datetime.strptime(value.strip(), '%Y-%m-%d %H:%M:%S%z').astimezone(UTC)


@_strict
def parse_ercot_price(payload: dict) -> dict:
    rows = [r for r in (payload or {}).get('rtSppData') or [] if number(r.get('hbHubAvg')) is not None]
    if not rows:
        raise ValueError('ERCOT real-time prices missing')
    row = max(rows, key=lambda r: _ercot_time(r['timestamp']))
    return {'usd_mwh': number(row['hbHubAvg']), 'label': 'ERCOT hub average, real-time 15-min settlement point price',
            'observed_at': utc_iso(_ercot_time(row['timestamp']))}


@_strict
def parse_ercot(fuel: dict, demand: dict | None = None, prices: dict | None = None,
                now: datetime | None = None) -> dict:
    days = (fuel or {}).get('data')
    if not isinstance(days, dict) or not days:
        raise ValueError('ERCOT fuel mix payload missing data')
    mixes = []
    for intervals in days.values():
        for stamp, fuels in intervals.items():
            mix = {}
            for name, entry in fuels.items():
                if name not in ERCOT_SKIP:
                    add_mix(mix, _fuel(ERCOT_MAP, name), number((entry or {}).get('gen')))
            mixes.append((_ercot_time(stamp), mix))
    loads = []
    for row in (demand or {}).get('data') or []:
        if row.get('forecast') == 0:  # forecast=1 rows are projections, not observations
            loads.append((_ercot_time(row['timestamp']), number(row.get('demand'))))
    price = None
    if prices:
        try:
            price = parse_ercot_price(prices)
        except (KeyError, ValueError):
            price = None
    return _build('ercot', loads, mixes, now, price=price, source_url=ERCOT_FUEL)


async def fetch_ercot(client) -> dict:
    fuel, demand, prices = await asyncio.gather(_json(client, ERCOT_FUEL), _json(client, ERCOT_DEMAND),
                                                _json(client, ERCOT_PRICES), return_exceptions=True)
    if isinstance(fuel, Exception):
        raise fuel
    return parse_ercot(fuel, None if isinstance(demand, Exception) else demand,
                       None if isinstance(prices, Exception) else prices)


# --- SPP: chart API with UTC labels (mix covers the last ~2 hours) ------------------------

def _spp_series(payload: dict) -> tuple:
    response = (payload or {}).get('response') or {}
    labels = response.get('labels') or []
    datasets = response.get('datasets') or []
    if not labels or not datasets:
        raise ValueError('SPP chart payload missing data')
    times = [datetime.fromisoformat(s.replace('Z', '+00:00')).astimezone(UTC) for s in labels]
    return times, datasets


@_strict
def parse_spp(mix: dict, load: dict | None = None, now: datetime | None = None) -> dict:
    times, datasets = _spp_series(mix)
    mixes = []
    for i, t in enumerate(times):
        point = {}
        for ds in datasets:
            values = ds.get('data') or []
            add_mix(point, _fuel(SPP_MAP, ds.get('label', '')), number(values[i]) if i < len(values) else None)
        mixes.append((t, point))
    loads = []
    if load:
        ltimes, lsets = _spp_series(load)
        actual = next((ds for ds in lsets if ds.get('label') == 'Actual Load'), None)
        if actual is None:
            raise ValueError('SPP actual load series missing')
        loads = [(t, number(v)) for t, v in zip(ltimes, actual.get('data') or [])]
    return _build('spp', loads, mixes, now, source_url=SPP_MIX)


async def fetch_spp(client) -> dict:
    mix, load = await asyncio.gather(_json(client, SPP_MIX), _json(client, SPP_LOAD), return_exceptions=True)
    if isinstance(mix, Exception):
        raise mix
    return parse_spp(mix, None if isinstance(load, Exception) else load)


# --- MISO: public API, Eastern Standard Time all year; fuel mix is the latest interval only

@_strict
def parse_miso(mix: dict, load: dict | None = None, now: datetime | None = None) -> dict:
    fuels = (((mix or {}).get('Fuel') or {}).get('Type')) or []
    if not fuels:
        raise ValueError('MISO fuel mix missing')
    stamp = datetime.strptime(fuels[0]['INTERVALEST'].strip(), '%Y-%m-%d %I:%M:%S %p').replace(tzinfo=EST)
    point = {}
    for row in fuels:
        add_mix(point, _fuel(MISO_MAP, row.get('CATEGORY', '')), number(row.get('ACT')))
    loads = []
    info = (load or {}).get('LoadInfo') or {}
    if info:
        day = datetime.strptime(info['RefId'].split(' - ')[0].strip(), '%d-%b-%Y').date()
        for entry in info.get('FiveMinTotalLoad') or []:
            hh, mm = (int(x) for x in entry['Load']['Time'].split(':'))
            t = datetime(day.year, day.month, day.day, tzinfo=EST) + timedelta(hours=hh, minutes=mm)
            loads.append((t.astimezone(UTC), number(entry['Load'].get('Value'))))
    return _build('miso', loads, [(stamp.astimezone(UTC), point)], now, source_url=MISO_MIX)


async def fetch_miso(client) -> dict:
    mix, load = await asyncio.gather(_json(client, MISO_MIX), _json(client, MISO_LOAD), return_exceptions=True)
    if isinstance(mix, Exception):
        raise mix
    return parse_miso(mix, None if isinstance(load, Exception) else load)


# --- NYISO: daily CSV files with an explicit EDT/EST column --------------------------------

_NY_OFFSETS = {'EDT': timezone(timedelta(hours=-4)), 'EST': timezone(timedelta(hours=-5))}


def _nyiso_time(stamp: str, zone: str) -> datetime:
    offset = _NY_OFFSETS.get(zone.strip())
    if offset is None:
        raise ValueError(f'NYISO unknown time zone {zone!r}')
    return datetime.strptime(stamp.strip(), '%m/%d/%Y %H:%M:%S').replace(tzinfo=offset).astimezone(UTC)


def _complete(groups: dict) -> list:
    """Keep only timestamps that report every category seen in the file."""
    if not groups:
        return []
    width = max(len(v) for v in groups.values())
    return [(t, v) for t, v in sorted(groups.items()) if len(v) == width]


@_strict
def parse_nyiso(mix_csv: str, load_csv: str | None = None, now: datetime | None = None) -> dict:
    rows = _rows(mix_csv)
    if [h.strip() for h in rows[0][:4]] != ['Time Stamp', 'Time Zone', 'Fuel Category', 'Gen MW']:
        raise ValueError('NYISO fuel mix schema changed')
    groups = {}
    for stamp, zone, category, value in (r[:4] for r in rows[1:] if len(r) >= 4):
        mw = number(value)
        if mw is not None:
            groups.setdefault(_nyiso_time(stamp, zone), {})[category.strip()] = mw
    mixes = []
    for t, categories in _complete(groups):
        point = {}
        for category, mw in categories.items():
            add_mix(point, _fuel(NYISO_MAP, category), mw)
        mixes.append((t, point))
    loads = []
    if load_csv:
        lrows = _rows(load_csv)
        if [h.strip() for h in lrows[0][:5]] != ['Time Stamp', 'Time Zone', 'Name', 'PTID', 'Load']:
            raise ValueError('NYISO load schema changed')
        zones = {}
        for stamp, zone, name, _, value in (r[:5] for r in lrows[1:] if len(r) >= 5):
            mw = number(value)
            if mw is not None:
                zones.setdefault(_nyiso_time(stamp, zone), {})[name.strip()] = mw
        loads = [(t, sum(v.values())) for t, v in _complete(zones)]
    return _build('nyiso', loads, mixes, now, source_url=NYISO_MIX.format(day='YYYYMMDD'))


async def fetch_nyiso(client) -> dict:
    today = datetime.now(UTC).astimezone(ZoneInfo(_ZONES['nyiso'])).date()
    for day in (today, today - timedelta(days=1)):
        stamp = day.strftime('%Y%m%d')
        mix, load = await asyncio.gather(_text(client, NYISO_MIX.format(day=stamp)),
                                         _text(client, NYISO_LOAD.format(day=stamp)), return_exceptions=True)
        if isinstance(mix, Exception):
            if day == today and getattr(getattr(mix, 'response', None), 'status_code', None) == 404:
                continue  # today's file appears a few minutes after local midnight
            raise mix
        result = parse_nyiso(mix, None if isinstance(load, Exception) else load)
        result['source_url'] = NYISO_MIX.format(day=stamp)
        return result
    raise ValueError('NYISO fuel mix unavailable')  # pragma: no cover


# --- ISO-NE: ISO Express chart service (form POST, no account required) ---------------------

@_strict
def parse_isone(mix: list, load: list | None = None, now: datetime | None = None) -> dict:
    points = ((mix or [{}])[0].get('data')) or []
    if not isinstance(points, list) or not points:
        raise ValueError('ISO-NE fuel mix missing')
    # The newest interval is filled in progressively. Drop trailing points that lack a
    # column their predecessor reported (e.g. NetImports) so a half-written point is
    # never shown as the latest mix.
    points = sorted(points, key=lambda p: p['BeginDateMs'])
    for _ in range(3):
        if len(points) > 1 and not (points[-2].keys() - ISONE_SKIP) <= points[-1].keys():
            points = points[:-1]
    mixes = []
    for p in points:
        point = {}
        for name, value in p.items():
            if name not in ISONE_SKIP:
                add_mix(point, _fuel(ISONE_MAP, name), number(value))
        mixes.append((datetime.fromtimestamp(p['BeginDateMs'] / 1000, UTC), point))
    loads = []
    data = ((load or [{}])[0].get('data')) or {}
    # LoadMw is grid-metered system load (includes pumped-storage pumping, excludes behind-the-meter solar).
    for row in data.get('actual') or []:
        loads.append((datetime.fromisoformat(row['BeginDate']).astimezone(UTC), number(row.get('LoadMw'))))
    return _build('isone', loads, mixes, now, source_url=ISONE_WS)


def _isone_form(day: date, request_type: str) -> dict:
    stamp = day.strftime('%m/%d/%Y')
    return {'_nstmp_startDate': stamp, '_nstmp_endDate': stamp, '_nstmp_twodays': 'false',
            '_nstmp_chartTitle': 'GridPulse', '_nstmp_requestType': request_type,
            '_nstmp_fuelType': 'all', '_nstmp_height': '250'}


async def fetch_isone(client) -> dict:
    today = datetime.now(UTC).astimezone(ZoneInfo(_ZONES['isone'])).date()
    for day in (today, today - timedelta(days=1)):
        mix, load = await asyncio.gather(_post_json(client, ISONE_WS, _isone_form(day, 'genfuelmix')),
                                         _post_json(client, ISONE_WS, _isone_form(day, 'systemload')),
                                         return_exceptions=True)
        if isinstance(mix, Exception):
            raise mix
        if day == today and not ((mix or [{}])[0].get('data')):
            continue  # no intervals yet just after local midnight
        return parse_isone(mix, None if isinstance(load, Exception) else load)
    raise ValueError('ISO-NE fuel mix unavailable')  # pragma: no cover


# --- HTTP helpers (the caller owns the client) ---------------------------------------------

async def _text(client, url: str) -> str:
    response = await client.get(url)
    response.raise_for_status()
    return response.text


async def _json(client, url: str):
    response = await client.get(url)
    response.raise_for_status()
    return response.json()


async def _post_json(client, url: str, form: dict):
    response = await client.post(url, data=form, headers={'X-Requested-With': 'XMLHttpRequest'})
    response.raise_for_status()
    return response.json()


ISOS = {'caiso': fetch_caiso, 'ercot': fetch_ercot, 'spp': fetch_spp, 'miso': fetch_miso,
        'nyiso': fetch_nyiso, 'isone': fetch_isone}
