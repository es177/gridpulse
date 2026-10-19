"""World Nuclear Association: reactors and uranium requirements by country (updated ~bimonthly)."""
from __future__ import annotations

import re
from datetime import datetime

try:
    from .common import HEADERS, text
except ImportError:
    from common import HEADERS, text

URL = ('https://world-nuclear.org/information-library/facts-and-figures/'
       'world-nuclear-power-reactors-and-uranium-requireme')

# Column order of the published table, validated against its two header rows.
COLUMNS = ('generation_twh', 'share_pct', 'operable', 'operable_mwe', 'construction', 'construction_mwe',
           'planned', 'planned_mwe', 'proposed', 'proposed_mwe', 'uranium_t')
UNITS = ['TWh', '%', 'No.', 'Net MWe', 'No.', 'Gross MWe', 'No.', 'Gross MWe', 'No.', 'Gross MWe', 'tonnes U']
INTEGERS = {'operable', 'operable_mwe', 'construction', 'construction_mwe', 'planned', 'planned_mwe',
            'proposed', 'proposed_mwe', 'uranium_t'}


def _value(cell: str, key: str):
    """'1,631' -> 1631; 'NA' or blank -> None; 'c. 9%' -> 9.0 (approximate world share)."""
    match = re.fullmatch(r'(?:c\.\s*)?(-?[\d,]+(?:\.\d+)?)\s*%?', cell.strip())
    if not match:
        return None
    number = float(match[1].replace(',', ''))
    return int(number) if key in INTEGERS and number.is_integer() else number


def _name(cell: str) -> str:
    return re.sub(r'[†‡*]+', '', cell).strip()


def parse_world(markup: str) -> dict:
    table = next((t for t in re.findall(r'<table\b.*?</table>', markup, re.S | re.I)
                  if 'REACTORS OPERABLE' in text(t).upper()), None)
    if not table:
        raise ValueError('World fleet table missing')
    rows = [[text(c) for c in re.findall(r'<t[dh]\b[^>]*>(.*?)</t[dh]>', row, re.S | re.I)]
            for row in re.findall(r'<tr\b.*?</tr>', table, re.S | re.I)]
    header = ' '.join(rows[0]).upper() if rows else ''
    year = re.search(r'GENERATION\s+(20\d{2})', header)
    if not year:
        raise ValueError('Generation year missing')
    if not any(r[1:] == UNITS for r in rows):
        raise ValueError('World fleet table columns changed')
    countries, world = [], None
    for row in rows:
        if len(row) != 12 or row[1:] == UNITS or not row[0]:
            continue
        record = {'name': _name(row[0]), **{k: _value(v, k) for k, v in zip(COLUMNS, row[1:])}}
        if record['operable'] is None:
            continue
        if record['share_pct'] is not None and not 0 <= record['share_pct'] <= 100:
            raise ValueError('Invalid nuclear share')
        if record['name'].upper() == 'WORLD':
            record['name'] = 'World'
            record['share_approx'] = row[2].strip().lower().startswith('c.')
            world = record
        else:
            countries.append(record)
    if len(countries) < 25 or world is None:
        raise ValueError('Incomplete world fleet table')
    updated = re.search(r'Updated\s+\w+,\s+(\d{1,2} \w+ 20\d{2})', text(markup))
    try:
        updated_on = datetime.strptime(updated[1], '%d %B %Y').date().isoformat() if updated else None
    except ValueError:
        updated_on = None
    return {
        # The table's own date, so an unrevised table goes stale instead of looking fresh on every fetch.
        'observed_at': f'{updated_on}T00:00:00+00:00' if updated_on else None,
        'updated': updated_on,
        'generation_year': int(year[1]),
        'countries': countries,
        'world': world,
        'definitions': {
            'operable': 'Connected to the grid; includes units not currently generating.',
            'construction': 'First concrete poured (keel laid for floating plants); includes suspended projects.',
            'planned': 'Approvals, funding or commitment in place.',
            'proposed': 'Specific programme or site proposals; timing very uncertain.',
        },
        'source_url': URL,
    }


async def fetch_world(client) -> dict:
    response = await client.get(URL, headers=HEADERS)
    response.raise_for_status()
    return parse_world(response.text)
