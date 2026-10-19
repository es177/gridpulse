"""Route-level tests: real parsers on fixtures, no network, partial data never fails."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / 'tests' / 'fixtures'
sys.path.insert(0, str(ROOT / 'api'))

from fastapi.testclient import TestClient  # noqa: E402

import index  # noqa: E402
from sources import eia, feeds, nrc, wna  # noqa: E402

DATA = {
    'eia_grid': lambda: eia.parse_v2_grid(json.loads((FIX / 'eia/v2_region_data.json').read_text())),
    'eia_fuel': lambda: eia.parse_v2_fuel(json.loads((FIX / 'eia/v2_fuel_type.json').read_text())),
    'eia_prices': lambda: eia.parse_v2_prices(json.loads((FIX / 'eia/v2_retail_sales.json').read_text())),
    'nrc_status': lambda: nrc.parse_status((FIX / 'nrc/status.txt').read_text()),
    'nrc_directory': lambda: nrc.parse_directory((FIX / 'nrc/directory.html').read_text()),
    'feeds': lambda: feeds.merge([feeds.parse_feed((FIX / 'feeds/wnn.xml').read_bytes(), 'World Nuclear News')]
                                 + [ValueError('offline')] * (len(feeds.FEEDS) - 1)),
    'wna': lambda: wna.parse_world((FIX / 'wna/wna.html').read_text()),
}


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for name, entry in index.store.entries.items():
            entry.next_due = float('inf')          # never touch the network
            entry.data = DATA[name]() if name in DATA else None
            entry.fetched_at = '2026-10-13T00:00:00+00:00' if entry.data else None
        cls.client = TestClient(index.app)

    def get(self, path):
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200, response.text[:200])
        self.assertIn('stale-if-error', response.headers['vercel-cdn-cache-control'])
        return response.json()

    def test_grid_combines_demand_and_fuel(self):
        body = self.get('/api/grid')
        self.assertEqual(body['demand']['regions'][0]['id'], 'US48')
        self.assertTrue(body['fuel']['series'])
        self.assertEqual(set(body['sources']), {'eia_grid', 'eia_fuel'})

    def test_reactors_join_every_unit_with_history(self):
        body = self.get('/api/reactors?days=30')
        self.assertGreaterEqual(body['fleet']['units'], 90)
        self.assertEqual(len(body['dates']), 30)
        unit = body['units'][0]
        self.assertEqual(len(unit['power']), 30)
        self.assertTrue(all(u['docket'] for u in body['units']))
        fleet = body['fleet']
        self.assertEqual(fleet['full'] + fleet['reduced'] + fleet['offline'] + fleet['unknown'], fleet['units'])
        self.assertLessEqual(fleet['online_mw'], fleet['capacity_mw'])

    def test_live_lists_every_operator_even_without_data(self):
        body = self.get('/api/live')
        self.assertEqual([i['key'] for i in body['isos']], ['caiso', 'ercot', 'spp', 'miso', 'nyiso', 'isone'])
        self.assertTrue(all('iso' in i and 'name' in i for i in body['isos']))
        self.assertFalse(any(m['has_data'] for m in body['sources'].values()))

    def test_feed_merges_sources_newest_first(self):
        body = self.get('/api/feed')
        dates = [i['published'] for i in body['items']]
        self.assertTrue(dates)
        self.assertEqual(dates, sorted(dates, reverse=True))

    def test_prices_and_world(self):
        self.assertGreaterEqual(len(self.get('/api/prices')['prices']['rows']), 48)
        self.assertGreaterEqual(len(self.get('/api/global')['world']['countries']), 25)

    def test_status_reports_every_source(self):
        body = self.get('/api/status')
        self.assertEqual(set(body['sources']), set(index.SOURCES))
        self.assertTrue(all(m['resolution'] in ('time', 'day', 'month') for m in body['sources'].values()))
        wna_meta = body['sources']['wna']
        self.assertEqual((wna_meta['observed_at'], wna_meta['resolution']), ('2026-10-08T00:00:00+00:00', 'day'))


if __name__ == '__main__':
    unittest.main()
