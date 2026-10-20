"""Route-level tests: real parsers on fixtures, no network, partial data never fails."""
import json
import sys
import unittest
import warnings
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / 'tests' / 'fixtures'
sys.path.insert(0, str(ROOT / 'api'))

# Starlette 1.x nudges toward a successor HTTP client for its test client; tests only.
warnings.filterwarnings('ignore', message='Using `httpx` with `starlette.testclient` is deprecated')
from fastapi.testclient import TestClient  # noqa: E402

import index  # noqa: E402
from sources import eia, feeds, nrc, owid, wna  # noqa: E402

NOW = datetime(2026, 10, 13, 2, 0, tzinfo=timezone.utc)  # fixtures are from October 2026
DATA = {
    'eia_grid': lambda: eia.parse_v2_grid(json.loads((FIX / 'eia/v2_region_data.json').read_text())),
    'eia_fuel': lambda: eia.parse_v2_fuel(json.loads((FIX / 'eia/v2_fuel_type.json').read_text())),
    'eia_prices': lambda: eia.parse_v2_prices(json.loads((FIX / 'eia/v2_retail_sales.json').read_text())),
    'nrc_status': lambda: nrc.parse_status((FIX / 'nrc/status.txt').read_text()),
    'nrc_directory': lambda: nrc.parse_directory((FIX / 'nrc/directory.html').read_text()),
    'feeds': lambda: feeds.merge([feeds.parse_feed((FIX / 'feeds/wnn.xml').read_bytes(), 'World Nuclear News', NOW)]
                                 + [ValueError('offline')] * (len(feeds.FEEDS) - 1)),
    'wna': lambda: wna.parse_world((FIX / 'wna/wna.html').read_text()),
    # The trimmed fixture holds five WNA countries; production requires 25.
    'owid': lambda: owid.parse_mix((FIX / 'owid/owid-energy-data.csv').read_text(), wna.ISO3.values(), minimum=3),
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
        body = self.get('/api/reactors')
        self.assertGreaterEqual(body['fleet']['units'], 90)
        self.assertGreater(len(body['dates']), 30)
        self.assertTrue(all(len(u['power']) == len(body['dates']) for u in body['units']))
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

    def test_prices(self):
        self.assertGreaterEqual(len(self.get('/api/prices')['prices']['rows']), 48)

    def test_global_joins_the_fleet_table_and_the_yearly_mix(self):
        body = self.get('/api/global')
        self.assertEqual(set(body['sources']), {'wna', 'owid'})
        self.assertGreaterEqual(len(body['world']['countries']), 25)
        codes = {c['iso3'] for c in body['world']['countries']}
        mix = body['mix']
        self.assertEqual((mix['unit'], mix['observed_at']), ('TWh', '2025-12-31T00:00:00+00:00'))
        self.assertIn('WLD', mix['countries'])
        self.assertTrue(set(mix['countries']) - {'WLD'} <= codes)
        france = mix['countries']['FRA']
        self.assertEqual(france['name'], 'France')
        self.assertEqual(set(france['years'][-1]), {'year', 'gen', 'nuclear', 'coal', 'gas', 'hydro', 'wind',
                                                    'solar', 'other', 'share', 'carbon', 'per_capita'})
        self.assertIn('max-age=21600,', self.client.get('/api/global').headers['vercel-cdn-cache-control'])

    def test_query_strings_redirect_to_the_bare_path(self):
        response = self.client.get('/api/grid?bust=1', follow_redirects=False)
        self.assertEqual((response.status_code, response.headers['location']), (308, '/api/grid'))

    def test_settled_responses_say_they_are_not_refreshing(self):
        self.assertIs(self.get('/api/grid')['refreshing'], False)

    def test_failing_source_shortens_cdn_caching(self):
        entry = index.store.entries['eia_prices']
        entry.error = 'HTTP 503'
        try:
            self.assertIn('max-age=15,', self.client.get('/api/prices').headers['vercel-cdn-cache-control'])
        finally:
            entry.error = None
        self.assertIn('max-age=3600,', self.client.get('/api/prices').headers['vercel-cdn-cache-control'])

    def test_status_reports_every_source(self):
        body = self.get('/api/status')
        self.assertEqual(set(body['sources']), set(index.SOURCES))
        self.assertTrue(all(m['resolution'] in ('time', 'day', 'month', 'year') for m in body['sources'].values()))
        wna_meta = body['sources']['wna']
        self.assertEqual((wna_meta['observed_at'], wna_meta['resolution']), ('2026-10-16T00:00:00+00:00', 'day'))
        owid_meta = body['sources']['owid']
        self.assertEqual((owid_meta['observed_at'], owid_meta['resolution']), ('2025-12-31T00:00:00+00:00', 'year'))


if __name__ == '__main__':
    unittest.main()
