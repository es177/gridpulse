"""World Nuclear Association: reactors and uranium requirements by country (updated ~bimonthly)."""
from __future__ import annotations

import logging
import re
from datetime import datetime

try:
    from .common import HEADERS, text
except ImportError:
    from common import HEADERS, text

URL = ('https://world-nuclear.org/information-library/facts-and-figures/'
       'world-nuclear-power-reactors-and-uranium-requireme')
log = logging.getLogger('gridpulse')

# Column order of the published table, validated against its two header rows.
COLUMNS = ('generation_twh', 'share_pct', 'operable', 'operable_mwe', 'construction', 'construction_mwe',
           'planned', 'planned_mwe', 'proposed', 'proposed_mwe', 'uranium_t')
UNITS = ['TWh', '%', 'No.', 'Net MWe', 'No.', 'Gross MWe', 'No.', 'Gross MWe', 'No.', 'Gross MWe', 'tonnes U']
INTEGERS = {'operable', 'operable_mwe', 'construction', 'construction_mwe', 'planned', 'planned_mwe',
            'proposed', 'proposed_mwe', 'uranium_t'}

# ISO 3166-1 alpha-3 for every country row of the table, keyed by WNA's name in lower case without
# footnote markers or a bracketed qualifier ("Korea RO (South)" -> "korea ro"). Spellings WNA has
# used before map to the same code. The owid mix source covers exactly these codes, so a country
# WNA adds needs a line here; until then its row carries iso3 null and a warning is logged.
ISO3 = {
    'argentina': 'ARG', 'armenia': 'ARM', 'bangladesh': 'BGD', 'belarus': 'BLR', 'belgium': 'BEL',
    'brazil': 'BRA', 'bulgaria': 'BGR', 'canada': 'CAN', 'china': 'CHN', 'czech republic': 'CZE',
    'czechia': 'CZE', 'egypt': 'EGY', 'estonia': 'EST', 'finland': 'FIN', 'france': 'FRA',
    'hungary': 'HUN', 'india': 'IND', 'indonesia': 'IDN', 'iran': 'IRN', 'japan': 'JPN',
    'kazakhstan': 'KAZ', 'korea ro': 'KOR', 'korea': 'KOR', 'south korea': 'KOR', 'mexico': 'MEX',
    'myanmar': 'MMR', 'netherlands': 'NLD', 'pakistan': 'PAK', 'poland': 'POL', 'romania': 'ROU',
    'russia': 'RUS', 'saudi arabia': 'SAU', 'slovakia': 'SVK', 'slovenia': 'SVN', 'south africa': 'ZAF',
    'spain': 'ESP', 'sweden': 'SWE', 'switzerland': 'CHE', 'turkey': 'TUR', 'türkiye': 'TUR',
    'ukraine': 'UKR', 'uae': 'ARE', 'united arab emirates': 'ARE', 'united kingdom': 'GBR', 'uk': 'GBR',
    'usa': 'USA', 'united states': 'USA', 'uzbekistan': 'UZB', 'vietnam': 'VNM', 'viet nam': 'VNM',
}
# Named only in the footnote on the world row: counted in the world total, no row of its own.
FOOTNOTE_ISO3 = {'taiwan': 'TWN'}

MARKERS = r'[*†‡§¶#]'


def _value(cell: str, key: str):
    """'1,631' -> 1631; 'c. 9%' -> 9.0; footnote markers ignored. 'NA', '-', '<1', ranges and blanks
    -> None: a bound or a range is not a value, so it is left missing rather than guessed."""
    cell = re.sub(MARKERS, '', cell).strip()
    cell = re.sub(r'(?<=\d)[\s  ](?=\d{3}\b)', '', cell)  # '12 714' -> '12714'
    match = re.fullmatch(r'(?:c\.|ca\.|~|approx\.)?\s*(\d[\d,]*(?:\.\d+)?)\s*%?', cell, re.I)
    if not match:
        return None
    number = float(match[1].replace(',', ''))
    return int(number) if key in INTEGERS and number.is_integer() else number


def _approx(cell: str) -> bool:
    return bool(re.match(r'\s*(?:c\.|ca\.|~|approx\.)', cell, re.I))


def _name(cell: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(MARKERS, '', cell)).strip()


def _key(name: str) -> str:
    return re.sub(r'\s*\(.*?\)', '', name).strip().lower()


def iso3(name: str) -> str | None:
    key = _key(name)
    return ISO3.get(key) or FOOTNOTE_ISO3.get(key)


def _rows(table: str) -> list[list[str]]:
    """Cell texts per row. A merged cell (colspan) fills each column it covers; superscript
    footnote references are dropped so '1631<sup>a</sup>' still reads as 1631."""
    rows = []
    for row in re.findall(r'<tr\b.*?</tr>', table, re.S | re.I):
        cells = []
        for attrs, body in re.findall(r'<t[dh]\b([^>]*)>(.*?)</t[dh]>', row, re.S | re.I):
            span = re.search(r'colspan\s*=\s*["\']?(\d+)', attrs, re.I)
            value = text(re.sub(r'<sup\b.*?</sup>', '', body, flags=re.S | re.I))
            cells.extend([value] * max(1, min(int(span[1]) if span else 1, 12)))
        rows.append(cells)
    return rows


def _footnote(page: str) -> list[dict]:
    """'World figures include Taiwan, which generated a total of 2.1 TWh from nuclear in 2025.'"""
    match = re.search(r'(?i:world) figures include ([A-Z][\w .\'-]*?)\s*,? which generated (?:a total of )?'
                      r'(\d[\d,]*(?:\.\d+)?)\s*TWh', page)
    if not match:
        return []
    name = match[1].strip()
    return [{'name': name, 'iso3': iso3(name), 'generation_twh': float(match[2].replace(',', ''))}]


def parse_world(markup: str) -> dict:
    table = next((t for t in re.findall(r'<table\b.*?</table>', markup, re.S | re.I)
                  if 'REACTORS OPERABLE' in text(t).upper()), None)
    if not table:
        raise ValueError('World fleet table missing')
    rows = _rows(table)
    units_at = next((i for i, r in enumerate(rows) if r[1:] == UNITS), None)
    if units_at is None:
        raise ValueError('World fleet table columns changed')
    header = ' '.join(' '.join(r) for r in rows[:units_at]).upper()
    year = re.search(r'GENERATION\s+(20\d{2})', header)
    if not year:
        raise ValueError('Generation year missing')
    uranium_year = re.search(r'URANIUM REQUIRED\s+(20\d{2})', header)
    countries, world, unmapped = [], None, []
    for row in rows[units_at + 1:]:
        if not row or not row[0] or row[1:] == UNITS:
            continue
        if len(row) != 12:  # a dropped or merged cell would shift every value after it
            raise ValueError(f'World fleet row has {len(row)} cells')
        record = {'name': _name(row[0]), **{k: _value(v, k) for k, v in zip(COLUMNS, row[1:])}}
        if record['operable'] is None:  # a note or sub-heading spanning the table
            continue
        if record['share_pct'] is not None and not 0 <= record['share_pct'] <= 100:
            raise ValueError('Invalid nuclear share')
        record['share_approx'] = _approx(row[2])
        if record['name'].upper() == 'WORLD':
            record.update(name='World', iso3='WLD', includes=_footnote(text(markup)))
            world = record
        else:
            record['iso3'] = iso3(record['name'])
            if record['iso3'] is None:
                unmapped.append(record['name'])
            countries.append(record)
    if len(countries) < 25 or world is None:
        raise ValueError('Incomplete world fleet table')
    if unmapped:
        log.warning('WNA rows without an ISO code: %s', ', '.join(unmapped))
    updated = re.search(r'Updated\s+(?:\w+,\s+)?(\d{1,2} \w+ 20\d{2})', text(markup))
    try:
        updated_on = datetime.strptime(updated[1], '%d %B %Y').date().isoformat() if updated else None
    except ValueError:
        updated_on = None
    return {
        # The table's own date, so an unrevised table goes stale instead of looking fresh on every fetch.
        'observed_at': f'{updated_on}T00:00:00+00:00' if updated_on else None,
        'updated': updated_on,
        'generation_year': int(year[1]),
        'uranium_year': int(uranium_year[1]) if uranium_year else None,
        'countries': countries,
        'world': world,
        'definitions': {
            'operable': 'Connected to the grid; includes units not currently generating.',
            'construction': 'First concrete poured (keel laid for floating plants); includes suspended projects.',
            'planned': 'Approvals, funding or commitment in place.',
            'proposed': 'Specific programme or site proposals; timing very uncertain.',
            'uranium_t': 'Uranium required for the year, tonnes U (WNA Nuclear Fuel Report reference scenario).',
        },
        'source_url': URL,
    }


async def fetch_world(client) -> dict:
    response = await client.get(URL, headers=HEADERS)
    response.raise_for_status()
    return parse_world(response.text)
