import asyncio
import csv
import io
import sys
import unittest
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'api' / 'sources'))
import owid  # noqa: E402

# OWID energy CSV of April 2026, trimmed to a few entities, years and the columns read.
FIXTURE = ROOT / 'tests' / 'fixtures' / 'owid' / 'owid-energy-data.csv'
CODES = {'FRA', 'USA', 'CHN', 'EGY', 'UKR', 'KOR'}  # KOR is absent from the fixture


def edit(body: str, country: str, year: str, **cells) -> str:
    """The fixture with some cells of one row replaced."""
    reader = csv.DictReader(io.StringIO(body))
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=reader.fieldnames, lineterminator='\n')
    writer.writeheader()
    for row in reader:
        if row['country'] == country and row['year'] == year:
            row.update(cells)
        writer.writerow(row)
    return out.getvalue()


class MixTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.body = FIXTURE.read_text(encoding='utf-8')
        cls.data = owid.parse_mix(cls.body, CODES, minimum=3)
        cls.countries = cls.data['countries']

    def year(self, code, year, data=None):
        return next(y for y in (data or self.data)['countries'][code]['years'] if y['year'] == year)

    def test_shape_and_selection(self):
        self.assertEqual(set(self.data), {'observed_at', 'source_url', 'unit', 'countries'})
        self.assertEqual(self.data['unit'], 'TWh')
        self.assertTrue(self.data['source_url'].startswith('https://ourworldindata.org/'))
        # Germany is not a WNA row and Europe is an aggregate: both left out. World becomes WLD.
        self.assertEqual(set(self.countries), {'FRA', 'USA', 'CHN', 'EGY', 'UKR', 'WLD'})
        self.assertEqual((self.countries['WLD']['name'], self.countries['USA']['name']), ('World', 'United States'))
        for entry in self.countries.values():
            years = [y['year'] for y in entry['years']]
            self.assertEqual(years, sorted(years))
            self.assertGreaterEqual(years[0], 2000)  # 1999 rows dropped

    def test_values_and_rounding(self):
        self.assertEqual(self.year('FRA', 2025), {
            'year': 2025, 'gen': 569.98, 'nuclear': 392.07, 'coal': 1.74, 'gas': 17.25, 'hydro': 59.41,
            'wind': 46.49, 'solar': 31.82, 'other': 21.2, 'share': 68.8, 'carbon': 41.4, 'per_capita': 8552})
        world = self.year('WLD', 2025)
        self.assertEqual((world['gen'], world['nuclear'], world['share']), (31772.35, 2811.57, 8.8))
        self.assertIsInstance(world['per_capita'], int)
        # other = oil + other renewables (bioenergy included); China publishes no separate remainder.
        self.assertEqual(self.year('CHN', 2025)['other'], round(89.55 + 213.01, 2))
        for entry in self.countries.values():
            for y in entry['years']:
                parts = sum(y.get(k, 0) for k in ('nuclear', 'coal', 'gas', 'hydro', 'wind', 'solar', 'other'))
                self.assertAlmostEqual(parts, y['gen'], delta=0.02 * y['gen'] + 0.05)

    def test_observed_at_is_the_latest_year_most_countries_report(self):
        self.assertEqual(self.data['observed_at'], '2025-12-31T00:00:00+00:00')
        self.assertEqual(self.countries['UKR']['years'][-1]['year'], 2022)  # lagging country does not decide

    def test_missing_values_are_omitted_not_filled(self):
        egypt = self.year('EGY', 2025)
        self.assertNotIn('nuclear', egypt)
        self.assertNotIn('share', egypt)
        self.assertEqual(self.year('EGY', 2024)['nuclear'], 0.0)  # a published zero stays
        self.assertEqual([y['year'] for y in self.countries['UKR']['years']], [2021, 2022])  # blank 2023 row dropped
        body = edit(self.body, 'France', '2025', oil_electricity='', other_renewable_electricity='')
        self.assertEqual(self.year('FRA', 2025, owid.parse_mix(body, CODES, minimum=3))['other'], 10.84)
        body = edit(body, 'France', '2025', biofuel_electricity='', other_renewable_exc_biofuel_electricity='')
        self.assertNotIn('other', self.year('FRA', 2025, owid.parse_mix(body, CODES, minimum=3)))

    def test_coverage_and_format_validation(self):
        with self.assertRaisesRegex(ValueError, 'countries matched'):
            owid.parse_mix(self.body, CODES)  # five WNA countries are fewer than 25
        no_world = '\n'.join(line for line in self.body.splitlines() if not line.startswith('World,'))
        with self.assertRaisesRegex(ValueError, 'World'):
            owid.parse_mix(no_world, CODES, minimum=3)
        with self.assertRaisesRegex(ValueError, 'columns'):
            owid.parse_mix(self.body.replace('nuclear_share_elec', 'nuclear_share'), CODES, minimum=3)
        with self.assertRaises(ValueError):
            owid.parse_mix('<html>rate limited</html>', CODES, minimum=3)

    def test_fetch_uses_the_wna_countries_and_validates(self):
        def handler(request):
            self.assertEqual(str(request.url), owid.URL)
            return httpx.Response(200, text=self.body)

        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                return await owid.fetch_mix(client)

        with self.assertRaisesRegex(ValueError, 'Only 5 countries matched'):  # FRA, USA, CHN, EGY, UKR
            asyncio.run(run())


if __name__ == '__main__':
    unittest.main()
