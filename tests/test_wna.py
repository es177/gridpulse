import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'api' / 'sources'))
import wna  # noqa: E402

FIXTURE = ROOT / 'tests' / 'fixtures' / 'wna' / 'wna.html'


class WorldTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = wna.parse_world(FIXTURE.read_text(encoding='utf-8'))
        cls.by_name = {c['name']: c for c in cls.data['countries']}

    def test_all_country_rows_and_world_total(self):
        self.assertEqual(len(self.data['countries']), 42)
        self.assertEqual(self.data['generation_year'], 2025)
        self.assertEqual(self.data['updated'], '2026-10-08')
        self.assertEqual(self.data['observed_at'], '2026-10-08T00:00:00+00:00')
        undated = wna.parse_world(FIXTURE.read_text(encoding='utf-8').replace('Updated', 'Revised'))
        self.assertIsNone(undated['observed_at'])  # falls back to fetched_at for staleness
        world = self.data['world']
        self.assertEqual((world['operable'], world['operable_mwe']), (442, 405227))
        self.assertTrue(world['share_approx'])
        self.assertEqual(world['share_pct'], 9.0)

    def test_values_map_to_columns_and_blanks_stay_missing(self):
        usa = self.by_name['USA']
        self.assertEqual((usa['generation_twh'], usa['share_pct'], usa['operable'], usa['operable_mwe']),
                         (785.6, 17.7, 94, 96952))
        self.assertIn('Argentina', self.by_name)  # footnote dagger removed
        bangladesh = self.by_name['Bangladesh']
        self.assertIsNone(bangladesh['generation_twh'])
        self.assertEqual(bangladesh['construction'], 2)

    def test_rejects_changed_or_partial_tables(self):
        with self.assertRaises(ValueError):
            wna.parse_world('<html>maintenance</html>')
        markup = FIXTURE.read_text(encoding='utf-8').replace('Net MWe', 'MW')
        with self.assertRaises(ValueError):
            wna.parse_world(markup)


if __name__ == '__main__':
    unittest.main()
