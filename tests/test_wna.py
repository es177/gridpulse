import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'api' / 'sources'))
import wna  # noqa: E402

FIXTURE = ROOT / 'tests' / 'fixtures' / 'wna' / 'wna.html'  # live table of 16 October 2026, trimmed
NA_CELL = '<td style="text-align: left;"><div align="center">NA</div></td>\n'


class WorldTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.markup = FIXTURE.read_text(encoding='utf-8')
        cls.data = wna.parse_world(cls.markup)
        cls.by_name = {c['name']: c for c in cls.data['countries']}

    def test_all_country_rows_and_world_total(self):
        self.assertEqual(len(self.data['countries']), 42)
        self.assertEqual((self.data['generation_year'], self.data['uranium_year']), (2025, 2025))
        self.assertEqual(self.data['updated'], '2026-10-16')
        self.assertEqual(self.data['observed_at'], '2026-10-16T00:00:00+00:00')
        undated = wna.parse_world(self.markup.replace('Updated', 'Revised'))
        self.assertIsNone(undated['observed_at'])  # falls back to fetched_at for staleness
        world = self.data['world']
        self.assertEqual((world['operable'], world['operable_mwe'], world['construction'], world['construction_mwe']),
                         (443, 405667, 79, 86560))
        self.assertEqual((world['planned'], world['planned_mwe'], world['proposed'], world['proposed_mwe']),
                         (122, 111133, 336, 299332))
        self.assertEqual((world['generation_twh'], world['uranium_t'], world['iso3']), (2701.6, 68920, 'WLD'))
        self.assertTrue(world['share_approx'])
        self.assertEqual(world['share_pct'], 9.0)

    def test_world_total_is_the_sum_of_rows(self):
        countries = self.data['countries']
        for key in ('operable', 'operable_mwe', 'construction', 'construction_mwe', 'planned', 'planned_mwe',
                    'proposed', 'proposed_mwe', 'uranium_t'):
            self.assertEqual(sum(c[key] or 0 for c in countries), self.data['world'][key], key)
        # Taiwan has no row; the world footnote carries its generation.
        self.assertEqual(self.data['world']['includes'], [{'name': 'Taiwan', 'iso3': 'TWN', 'generation_twh': 2.1}])
        rows = sum(c['generation_twh'] or 0 for c in countries) + 2.1
        self.assertAlmostEqual(rows, self.data['world']['generation_twh'], delta=0.5)

    def test_values_map_to_columns_and_blanks_stay_missing(self):
        usa = self.by_name['USA']
        self.assertEqual((usa['generation_twh'], usa['share_pct'], usa['operable'], usa['operable_mwe'],
                          usa['proposed_mwe'], usa['uranium_t']), (785.6, 17.7, 94, 96952, 7540, 19011))
        china = self.by_name['China']
        self.assertEqual((china['construction'], china['construction_mwe'], china['proposed_mwe'], china['uranium_t']),
                         (38, 43327, 168575, 13872))
        self.assertEqual((self.by_name['Slovakia']['operable'], self.by_name['Slovakia']['construction']), (6, 0))
        self.assertIn('Argentina', self.by_name)  # footnote dagger removed
        self.assertFalse(self.by_name['Argentina']['share_approx'])
        bangladesh = self.by_name['Bangladesh']
        self.assertIsNone(bangladesh['generation_twh'])
        self.assertIsNone(bangladesh['share_pct'])
        self.assertEqual((bangladesh['construction'], bangladesh['uranium_t']), (2, 179))

    def test_every_row_has_an_iso_code(self):
        codes = {c['name']: c['iso3'] for c in self.data['countries']}
        self.assertEqual((codes['Korea RO (South)'], codes['Czech Republic'], codes['UAE'], codes['USA'],
                          codes['United Kingdom'], codes['Turkey'], codes['South Africa']),
                         ('KOR', 'CZE', 'ARE', 'USA', 'GBR', 'TUR', 'ZAF'))
        self.assertTrue(all(len(code or '') == 3 for code in codes.values()))
        self.assertEqual(len(set(codes.values())), 42)
        # The owid mix source covers exactly the table's countries.
        self.assertEqual(set(codes.values()), set(wna.ISO3.values()))

    def test_unknown_country_keeps_its_row_without_a_code(self):
        markup = self.markup.replace('>Vietnam<', '>Ruritania<')
        with self.assertLogs('gridpulse', 'WARNING'):
            data = wna.parse_world(markup)
        row = next(c for c in data['countries'] if c['name'] == 'Ruritania')
        self.assertIsNone(row['iso3'])
        self.assertEqual(row['planned'], 2)

    def test_cell_formats(self):
        cases = {'1,631': 1631, '12 714': 12714, '1631†': 1631, '10.8*': 10.8, 'c. 9%': 9.0, '0': 0,
                 'NA': None, '': None, '-': None, '–': None, '<1': None, '2-3': None, 'n/a': None}
        for cell, expected in cases.items():
            self.assertEqual(wna._value(cell, 'operable'), expected, cell)
        self.assertIsInstance(wna._value('1,631', 'operable_mwe'), int)
        self.assertIsInstance(wna._value('40', 'share_pct'), float)

    def test_footnote_references_and_merged_cells(self):
        markup = self.markup.replace('<div align="center">1631</div>', '<div align="center">1631<sup>1</sup></div>')
        self.assertEqual(next(c for c in wna.parse_world(markup)['countries'] if c['name'] == 'Argentina')
                         ['operable_mwe'], 1631)
        # Bangladesh's two NA cells merged into one spanning both columns.
        merged = self.markup.replace(NA_CELL * 2, '<td colspan="2"><div align="center">NA</div></td>\n', 1)
        self.assertNotEqual(merged, self.markup)
        row = next(c for c in wna.parse_world(merged)['countries'] if c['name'] == 'Bangladesh')
        self.assertEqual((row['generation_twh'], row['share_pct'], row['construction'], row['uranium_t']),
                         (None, None, 2, 179))

    def test_rejects_changed_or_partial_tables(self):
        with self.assertRaises(ValueError):
            wna.parse_world('<html>maintenance</html>')
        with self.assertRaises(ValueError):
            wna.parse_world(self.markup.replace('Net MWe', 'MW'))
        with self.assertRaisesRegex(ValueError, '11 cells'):  # a dropped cell must not shift values
            wna.parse_world(self.markup.replace(NA_CELL * 2, NA_CELL, 1))


if __name__ == '__main__':
    unittest.main()
