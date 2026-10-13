import asyncio
import json
import sys
import unittest
from datetime import datetime
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'api' / 'sources'))
import eia  # noqa: E402
from common import FUELS  # noqa: E402

FIXTURES = ROOT / 'tests' / 'fixtures' / 'eia'


def load(name):
    path = FIXTURES / name
    return path.read_text() if name.endswith('.html') else json.loads(path.read_text())


def hours(series):
    return [datetime.fromisoformat(p['t']) for p in series]


class GridTest(unittest.TestCase):
    def setUp(self):
        self.grid = eia.parse_v2_grid(load('v2_region_data.json'))
        self.regions = {r['id']: r for r in self.grid['regions']}

    def test_regions_in_order_with_display_names(self):
        self.assertEqual([r['id'] for r in self.grid['regions']], [c for c, _ in eia.REGIONS])
        self.assertEqual(self.regions['ERCO']['name'], 'ERCOT')
        self.assertEqual(self.regions['ISNE']['name'], 'ISO-NE')
        self.assertEqual(self.grid['via'], 'eia-v2')

    def test_observed_at_is_latest_us48_demand_hour_in_utc(self):
        us = self.regions['US48']
        self.assertEqual(self.grid['observed_at'], '2026-10-13T01:00:00+00:00')
        self.assertEqual(us['latest']['t'], self.grid['observed_at'])
        self.assertIsNotNone(us['latest']['d'])

    def test_series_is_contiguous_hourly(self):
        for region in self.grid['regions']:
            stamps = hours(region['series'])
            self.assertTrue(all((b - a).total_seconds() == 3600 for a, b in zip(stamps, stamps[1:])), region['id'])

    def test_single_ba_forecasts_run_ahead_but_us48_aggregate_does_not(self):
        us, pjm = self.regions['US48'], self.regions['PJM']
        # US48 DF for unreported hours is a partial sum, so it stops at the latest actual.
        self.assertEqual(us['series'][-1]['t'], us['latest']['t'])
        future = [p for p in pjm['series'] if p['t'] > pjm['latest']['t']]
        self.assertTrue(future)
        self.assertTrue(all(p['d'] is None and p['df'] is not None for p in future))
        lead = datetime.fromisoformat(future[-1]['t']) - datetime.fromisoformat(pjm['latest']['t'])
        self.assertLessEqual(lead.total_seconds(), eia.FORECAST_HOURS * 3600)

    def test_interchange_sign_kept_as_reported_and_balance_lags_demand(self):
        balance = self.regions['US48']['latest_balance']
        self.assertEqual(balance['t'], '2026-10-12T03:00:00+00:00')
        self.assertEqual(balance['ti'], -6023)  # EIA: positive TI = net exports
        self.assertLess(balance['t'], self.regions['US48']['latest']['t'])
        self.assertIsNone(self.regions['US48']['latest']['ng'])

    def test_930_fallback_normalizes_to_same_schema(self):
        fallback = eia.parse_930_grid(load('930_region_data.json'))
        self.assertEqual(fallback['via'], 'eia-930-api')
        self.assertEqual(fallback['observed_at'], self.grid['observed_at'])
        self.assertEqual([r['id'] for r in fallback['regions']], [r['id'] for r in self.grid['regions']])
        us = fallback['regions'][0]
        self.assertEqual(set(us['latest']), {'t', 'd', 'df', 'ng', 'ti'})
        self.assertAlmostEqual(us['latest']['d'], self.regions['US48']['latest']['d'], delta=1)
        self.assertEqual(us['latest_balance']['t'], self.regions['US48']['latest_balance']['t'])

    def test_rejects_missing_us48_and_thin_coverage(self):
        rows = load('v2_region_data.json')['response']['data']
        with self.assertRaisesRegex(ValueError, 'US48'):
            eia.parse_v2_grid({'response': {'data': [r for r in rows if r['respondent'] != 'US48']}})
        thin = [r for r in rows if r['respondent'] in ('US48', 'PJM', 'MISO', 'ERCO', 'CISO')]
        with self.assertRaisesRegex(ValueError, 'only 5'):
            eia.parse_v2_grid({'response': {'data': thin}})
        seven = [r for r in rows if r['respondent'] != 'ISNE']
        self.assertEqual(len(eia.parse_v2_grid({'response': {'data': seven}})['regions']), 7)

    def test_rejects_garbage_payloads(self):
        for payload in ({'error': 'API_KEY_INVALID'}, {'response': {'data': []}}, [], 'oops'):
            with self.assertRaises(ValueError):
                eia.parse_v2_grid(payload)
        for payload in ([], [{}], {'data': []}, [{'data': [{'TIME_ZONE': 'Eastern', 'VALUES': {}}]}]):
            with self.assertRaises(ValueError):
                eia.parse_930_grid(payload)


class FuelTest(unittest.TestCase):
    def test_latest_complete_hour_and_canonical_buckets(self):
        payload = load('v2_fuel_type.json')
        fuel = eia.parse_v2_fuel(payload)
        self.assertEqual(fuel['observed_at'], '2026-10-12T03:00:00+00:00')
        latest = fuel['series'][-1]
        self.assertEqual(latest['t'], fuel['observed_at'])
        self.assertTrue(set(latest['mix']) <= set(FUELS))
        raw = {r['fueltype']: float(r['value']) for r in payload['response']['data']
               if r['period'] == '2026-10-12T03'}
        self.assertEqual(latest['mix']['storage'], raw['BAT'] + raw['PS'] + raw['OES'] + raw['UES'])
        self.assertEqual(latest['mix']['solar'], raw['SUN'] + raw['SNB'])
        self.assertEqual(latest['mix']['other'], raw['OTH'] + raw['UNK'])

    def test_incomplete_hours_are_dropped(self):
        payload = load('v2_fuel_type.json')
        payload['response']['data'] = [r for r in payload['response']['data']
                                       if not (r['period'] == '2026-10-12T03' and r['fueltype'] == 'SUN')]
        self.assertEqual(eia.parse_v2_fuel(payload)['observed_at'], '2026-10-12T02:00:00+00:00')
        only_gas = {'response': {'data': [{'period': '2026-10-12T03', 'respondent': 'US48', 'fueltype': 'NG', 'value': '1'}]}}
        with self.assertRaisesRegex(ValueError, 'complete'):
            eia.parse_v2_fuel(only_gas)

    def test_930_fallback_matches_v2(self):
        v2 = eia.parse_v2_fuel(load('v2_fuel_type.json'))
        fallback = eia.parse_930_fuel(load('930_fuel_type.json'))
        self.assertEqual(fallback['via'], 'eia-930-api')
        self.assertEqual(fallback['observed_at'], v2['observed_at'])
        self.assertEqual(fallback['series'][-1]['mix'], v2['series'][-1]['mix'])


class PricesTest(unittest.TestCase):
    def test_common_month_and_year_over_year(self):
        prices = eia.parse_v2_prices(load('v2_retail_sales.json'))
        self.assertEqual(prices['period'], '2026-07')
        self.assertEqual(prices['observed_at'], '2026-07-01T00:00:00+00:00')
        self.assertEqual(len(prices['rows']), 51)
        self.assertNotIn('US', [r['state'] for r in prices['rows']])
        us = prices['us']
        self.assertEqual(us['res'], 18.31)
        self.assertEqual(us['res_yoy'], round((18.31 / 17.45 - 1) * 100, 2))
        self.assertEqual([h['period'] for h in prices['us_history']], ['2025-07', '2026-06', '2026-07'])

    def test_never_ranks_states_across_mixed_months(self):
        payload = load('v2_retail_sales.json')
        payload['response']['data'] = [r for r in payload['response']['data']
                                       if not (r['stateid'] == 'TX' and r['period'] == '2026-07')]
        prices = eia.parse_v2_prices(payload)
        self.assertEqual(prices['period'], '2026-06')
        self.assertIsNone(prices['us']['res_yoy'])  # 2025-06 not in the fixture

    def test_rejects_unit_changes_and_thin_coverage(self):
        payload = load('v2_retail_sales.json')
        payload['response']['data'][0]['price-units'] = 'dollars per megawatthour'
        with self.assertRaisesRegex(ValueError, 'units'):
            eia.parse_v2_prices(payload)
        few = {'response': {'data': [r for r in load('v2_retail_sales.json')['response']['data']
                                     if r['stateid'] in ('US', 'VA', 'TX')]}}
        with self.assertRaisesRegex(ValueError, 'only 2 states'):
            eia.parse_v2_prices(few)
        self.assertEqual(len(eia.parse_v2_prices(few, min_states=2)['rows']), 2)

    def test_published_table_fallback_covers_every_state(self):
        table = eia.parse_price_table(load('epm_table_5_6_a.html'))
        v2 = eia.parse_v2_prices(load('v2_retail_sales.json'))
        self.assertEqual(table['via'], 'eia-epm-table')
        self.assertEqual(table['period'], v2['period'])
        self.assertEqual(len(table['rows']), 51)
        self.assertEqual(table['us'], v2['us'])
        va = next(r for r in table['rows'] if r['state'] == 'VA')
        self.assertEqual(va, next(r for r in v2['rows'] if r['state'] == 'VA'))

    def test_table_rejects_changed_schema(self):
        markup = load('epm_table_5_6_a.html')
        with self.assertRaises(ValueError):
            eia.parse_price_table('<html>upstream error</html>')
        with self.assertRaisesRegex(ValueError, 'schema'):
            eia.parse_price_table(markup.replace('Industrial', 'Manufacturing', 1))


class FetchTest(unittest.TestCase):
    def run_fetch(self, fetch, handler):
        async def go():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                return await fetch(client)
        return asyncio.run(go())

    def test_v2_request_shape(self):
        seen = []

        def handler(request):
            seen.append(request.url)
            return httpx.Response(200, json=load('v2_region_data.json'))
        self.assertEqual(self.run_fetch(eia.fetch_grid, handler)['via'], 'eia-v2')
        self.assertEqual(len(seen), 1)
        params = seen[0].params
        self.assertEqual(params.get_list('facets[respondent][]'), [c for c, _ in eia.REGIONS])
        self.assertEqual(params.get_list('facets[type][]'), ['D', 'DF', 'NG', 'TI'])
        self.assertEqual(params['api_key'], eia.api_key())

    def test_falls_back_to_keyless_endpoints_when_v2_is_rate_limited(self):
        def handler(request):
            if request.url.host == 'api.eia.gov':
                return httpx.Response(429, json={'error': {'code': 'OVER_RATE_LIMIT'}})
            if 'region_data_by_fuel_type' in request.url.path:
                return httpx.Response(200, json=load('930_fuel_type.json'))
            if 'region_data' in request.url.path:
                self.assertEqual(request.url.params['timezone'], 'UTC')
                return httpx.Response(200, json=load('930_region_data.json'))
            return httpx.Response(200, text=load('epm_table_5_6_a.html'))
        self.assertEqual(self.run_fetch(eia.fetch_grid, handler)['via'], 'eia-930-api')
        self.assertEqual(self.run_fetch(eia.fetch_fuel, handler)['via'], 'eia-930-api')
        self.assertEqual(self.run_fetch(eia.fetch_prices, handler)['via'], 'eia-epm-table')

    def test_double_failure_reports_both_paths_without_leaking_the_key(self):
        def handler(request):
            return httpx.Response(503 if request.url.host == 'api.eia.gov' else 500)
        for fetch in (eia.fetch_grid, eia.fetch_fuel, eia.fetch_prices):
            with self.assertRaises(ValueError) as caught:
                self.run_fetch(fetch, handler)
            message = str(caught.exception)
            self.assertIn('v2 HTTP 503', message)
            self.assertIn('fallback HTTP 500', message)
            self.assertNotIn(eia.api_key(), message)


if __name__ == '__main__':
    unittest.main()
