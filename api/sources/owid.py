"""Our World in Data energy dataset: yearly electricity by source per country.

OWID builds it from Ember (electricity, 2000 onward) and the Energy Institute Statistical
Review of World Energy, under CC BY. The GitHub CSV is one ~2.5 MB gzip download with a stable,
documented codebook, and it leaves gaps blank where the grapher charts fill zeros.
"""
from __future__ import annotations

import csv
import io
from collections import Counter

try:
    from .common import HEADERS, number
    from .wna import ISO3
except ImportError:
    from common import HEADERS, number
    from wna import ISO3

URL = 'https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv'
PAGE = 'https://ourworldindata.org/electricity-mix'
FIRST_YEAR = 2000
MIN_COUNTRIES = 25

# Output key -> (dataset column, decimals). Generation is TWh, share %, carbon gCO2/kWh,
# per_capita kWh per person.
FIELDS = {
    'gen': ('electricity_generation', 2),
    'nuclear': ('nuclear_electricity', 2),
    'coal': ('coal_electricity', 2),
    'gas': ('gas_electricity', 2),
    'hydro': ('hydro_electricity', 2),
    'wind': ('wind_electricity', 2),
    'solar': ('solar_electricity', 2),
    'share': ('nuclear_share_elec', 1),
    'carbon': ('carbon_intensity_elec', 1),
    'per_capita': ('per_capita_electricity', 0),
}
# other = oil + bioenergy + other renewables. other_renewable_electricity already includes
# bioenergy; its two parts are the fallback when only they are published.
OIL, OTHER_RENEWABLES = 'oil_electricity', 'other_renewable_electricity'
OTHER_PARTS = ('biofuel_electricity', 'other_renewable_exc_biofuel_electricity')
REQUIRED = {'country', 'year', 'iso_code', OIL, OTHER_RENEWABLES, *OTHER_PARTS,
            *(column for column, _ in FIELDS.values())}


def _round(value: float, decimals: int):
    return round(value) if decimals == 0 else round(value, decimals)


def _other(row: dict) -> float | None:
    """Sum of the parts that are published; None when none are (a gap, not a zero)."""
    renewables = number(row.get(OTHER_RENEWABLES))
    if renewables is None:
        parts = [v for v in (number(row.get(c)) for c in OTHER_PARTS) if v is not None]
        renewables = sum(parts) if parts else None
    parts = [v for v in (number(row.get(OIL)), renewables) if v is not None]
    return round(sum(parts), 2) if parts else None


def _year(row: dict) -> dict | None:
    values = {}
    for key, (column, decimals) in FIELDS.items():
        value = number(row.get(column))
        if value is not None:
            values[key] = _round(value, decimals)
    other = _other(row)
    if other is not None:
        values['other'] = other
    if not values:
        return None
    order = ('gen', 'nuclear', 'coal', 'gas', 'hydro', 'wind', 'solar', 'other', 'share', 'carbon', 'per_capita')
    return {'year': int(row['year']), **{k: values[k] for k in order if k in values}}


def parse_mix(body: str, codes, minimum: int = MIN_COUNTRIES) -> dict:
    """Yearly rows from FIRST_YEAR for the given ISO alpha-3 codes plus the world as 'WLD'.
    Missing values are omitted, never filled."""
    reader = csv.DictReader(io.StringIO(body))
    if not REQUIRED <= set(reader.fieldnames or ()):
        raise ValueError('OWID energy columns changed')
    wanted = set(codes)
    countries: dict[str, dict] = {}
    for row in reader:
        code = row['iso_code']
        if row['country'] == 'World' and code in ('', 'OWID_WRL'):
            code = 'WLD'
        elif code not in wanted:
            continue
        try:
            if int(row['year']) < FIRST_YEAR:
                continue
        except ValueError:
            continue
        year = _year(row)
        if year:
            entry = countries.setdefault(code, {'name': 'World' if code == 'WLD' else row['country'], 'years': []})
            entry['years'].append(year)
    for entry in countries.values():
        entry['years'].sort(key=lambda y: y['year'])
    if 'WLD' not in countries:
        raise ValueError('World aggregate missing')
    matched = len(countries) - 1
    if matched < minimum:
        raise ValueError(f'Only {matched} countries matched')
    # The latest year most countries report; a few lag a year behind the rest.
    latest = Counter(max((y['year'] for y in e['years'] if 'gen' in y), default=0) for e in countries.values())
    latest.pop(0, None)
    if not latest:
        raise ValueError('No electricity generation values')
    year = max(latest, key=lambda y: (latest[y], y))
    return {
        'observed_at': f'{year}-12-31T00:00:00+00:00',
        'source_url': PAGE,
        'unit': 'TWh',
        'countries': dict(sorted(countries.items())),
    }


async def fetch_mix(client) -> dict:
    response = await client.get(URL, headers=HEADERS)
    response.raise_for_status()
    return parse_mix(response.text, set(ISO3.values()))
