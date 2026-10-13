import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'api'))
if (ROOT / 'api' / 'sources' / '__init__.py').exists():
    from sources import iso
    from sources.common import FUELS
else:  # standalone until the package registry exists
    sys.path.insert(0, str(ROOT / 'api' / 'sources'))
    import iso
    from common import FUELS

FIXTURES = ROOT / 'tests' / 'fixtures' / 'iso'
NOW = datetime(2026, 10, 13, 1, 52, tzinfo=timezone.utc)


def text(name):
    return (FIXTURES / name).read_text()


def load(name):
    return json.loads(text(name))


class Shape:
    def check_shape(self, result, iso_label):
        self.assertEqual(result['iso'], iso_label)
        self.assertLessEqual(set(result['mix']), set(FUELS))
        times = [p['t'] for p in result['series']]
        self.assertEqual(times, sorted(times))
        self.assertTrue(all(t.endswith('+00:00') for t in times + [result['observed_at']]))
        self.assertTrue(all(datetime.fromisoformat(t).minute % 15 == 0 for t in times))


class CaisoTest(unittest.TestCase, Shape):
    def test_latest_values_utc_and_canonical_buckets(self):
        r = iso.parse_caiso(text('caiso_fuelsource.csv'), text('caiso_demand.csv'), NOW)
        self.check_shape(r, 'CAISO')
        self.assertEqual(r['observed_at'], '2026-10-13T01:40:00+00:00')   # 18:40 PDT
        self.assertEqual(r['load_mw'], 27515)
        self.assertEqual(r['mix']['hydro'], 176 + 1766)                    # small + large hydro
        self.assertEqual(r['mix']['biomass'], 170 + 133)                   # biomass + biogas
        self.assertEqual(r['mix']['storage'], 7591)                        # discharging is positive
        self.assertEqual(r['mix']['imports'], 4348)
        self.assertEqual(r['series'][0]['t'], '2026-10-12T07:00:00+00:00')  # 00:00 PDT
        self.assertEqual(r['series'][-1]['t'], '2026-10-13T01:30:00+00:00')

    def test_yesterdays_file_just_after_local_midnight(self):
        after_midnight = datetime(2026, 10, 13, 7, 3, tzinfo=timezone.utc)  # 00:03 PDT Oct 13
        r = iso.parse_caiso(text('caiso_fuelsource.csv'), text('caiso_demand.csv'), after_midnight)
        self.assertEqual(r['observed_at'], '2026-10-13T01:40:00+00:00')

    def test_fall_back_repeated_hour_resolves_in_order(self):
        times = ['00:55', '01:00', '01:55', '01:00', '01:05', '02:00']
        now = datetime(2026, 11, 1, 10, 5, tzinfo=timezone.utc)
        resolved = iso._caiso_times(times, [True] * len(times), now)
        self.assertEqual([t.strftime('%H:%M') for t in resolved], ['07:55', '08:00', '08:55', '09:00', '09:05', '10:00'])

    def test_rejects_garbage_and_schema_change(self):
        with self.assertRaises(ValueError):
            iso.parse_caiso('<html>error</html>', None, NOW)
        with self.assertRaises(ValueError):
            iso.parse_caiso('Time,Foo\n00:00,1\n', None, NOW)


class ErcotTest(unittest.TestCase, Shape):
    def test_actuals_only_storage_net_and_price(self):
        r = iso.parse_ercot(load('ercot_fuel_mix.json'), load('ercot_supply_demand.json'), load('ercot_prices.json'), NOW)
        self.check_shape(r, 'ERCOT')
        self.assertEqual(r['observed_at'], '2026-10-13T01:40:00+00:00')   # forecast rows excluded
        self.assertEqual(r['load_mw'], 70779)
        self.assertEqual(r['mix']['storage'], 5515.9)                      # not double counted with components
        self.assertEqual(r['mix']['coal'], 6924.8)
        self.assertEqual(r['price']['usd_mwh'], 45.57)
        self.assertEqual(r['price']['observed_at'], '2026-10-13T01:30:00+00:00')
        self.assertEqual(r['series'][0]['t'], '2026-10-12T05:00:00+00:00')  # 00:00 CDT

    def test_price_failure_does_not_drop_feed(self):
        r = iso.parse_ercot(load('ercot_fuel_mix.json'), None, {'rtSppData': []}, NOW)
        self.assertIsNone(r['price'])
        self.assertIsNone(r['load_mw'])

    def test_rejects_garbage(self):
        for payload in ({}, {'data': []}, {'data': {'2026-10-12': {'bad stamp': {}}}}):
            with self.assertRaises(ValueError):
                iso.parse_ercot(payload, None, None, NOW)


class SppTest(unittest.TestCase, Shape):
    def test_utc_labels_and_future_load_ignored(self):
        r = iso.parse_spp(load('spp_gen_mix.json'), load('spp_load.json'), NOW)
        self.check_shape(r, 'SPP')
        self.assertEqual(r['observed_at'], '2026-10-13T01:40:00+00:00')
        self.assertEqual(r['load_mw'], 39655.1)
        self.assertEqual(r['mix']['oil'], 4.0)
        self.assertEqual(r['mix']['storage'], 27.7)
        self.assertNotIn('imports', r['mix'])

    def test_rejects_garbage(self):
        with self.assertRaises(ValueError):
            iso.parse_spp({'response': {}}, None, NOW)


class MisoTest(unittest.TestCase, Shape):
    def test_eastern_standard_time_all_year(self):
        r = iso.parse_miso(load('miso_fuel_mix.json'), load('miso_total_load.json'), NOW)
        self.check_shape(r, 'MISO')
        self.assertEqual(r['observed_at'], '2026-10-13T01:40:00+00:00')   # 20:40 EST, not EDT
        self.assertEqual(r['load_mw'], 90156)
        self.assertEqual(r['mix']['imports'], 3048)
        self.assertEqual(r['series'][0]['t'], '2026-10-12T05:00:00+00:00')  # 00:00 EST

    def test_rejects_garbage(self):
        for payload in ({}, {'Fuel': {'Type': [{}]}}):
            with self.assertRaises(ValueError):
                iso.parse_miso(payload, None, NOW)


class NyisoTest(unittest.TestCase, Shape):
    def test_zone_sum_and_gas_buckets(self):
        r = iso.parse_nyiso(text('nyiso_rtfuelmix.csv'), text('nyiso_pal.csv'), NOW)
        self.check_shape(r, 'NYISO')
        self.assertEqual(r['observed_at'], '2026-10-13T01:30:00+00:00')   # 21:30 EDT
        last = [l.split(',') for l in text('nyiso_pal.csv').splitlines()[-11:]]
        self.assertAlmostEqual(r['load_mw'], round(sum(float(c[4]) for c in last), 1))
        mix_rows = [l.split(',') for l in text('nyiso_rtfuelmix.csv').splitlines()[-7:]]
        gas = sum(float(c[3]) for c in mix_rows if c[2] in ('Dual Fuel', 'Natural Gas'))
        self.assertEqual(r['mix']['gas'], gas)

    def test_incomplete_latest_zone_group_is_skipped(self):
        lines = text('nyiso_pal.csv').strip().splitlines()
        r = iso.parse_nyiso(text('nyiso_rtfuelmix.csv'), '\n'.join(lines[:-1]), NOW)
        full = iso.parse_nyiso(text('nyiso_rtfuelmix.csv'), text('nyiso_pal.csv'), NOW)
        self.assertNotEqual(r['load_mw'], full['load_mw'])
        self.assertEqual(r['series'][-1]['t'], full['series'][-1]['t'])

    def test_rejects_garbage_and_future(self):
        with self.assertRaises(ValueError):
            iso.parse_nyiso('<html>error</html>', None, NOW)
        with self.assertRaises(ValueError):
            iso.parse_nyiso(text('nyiso_rtfuelmix.csv'), None, datetime(2026, 10, 12, tzinfo=timezone.utc))


class IsoneTest(unittest.TestCase, Shape):
    def test_partial_latest_point_dropped_and_aggregate_excluded(self):
        raw = load('isone_genfuelmix.json')
        r = iso.parse_isone(raw, load('isone_systemload.json'), NOW)
        self.check_shape(r, 'ISO-NE')
        points = sorted(raw[0]['data'], key=lambda p: p['BeginDateMs'])
        complete = points[-2]                       # newest point lacks Batteries
        self.assertNotIn('Batteries', points[-1])
        self.assertEqual(r['mix']['imports'], complete['NetImports'])
        self.assertEqual(r['mix']['biomass'], complete['Wood'] + complete['LandfillGas'] + complete['Refuse'])
        self.assertEqual(round(sum(r['mix'].values()), 1),
                         round(sum(v for k, v in complete.items() if k not in iso.ISONE_SKIP), 1))
        self.assertEqual(r['observed_at'], '2026-10-13T01:50:00+00:00')   # load at 21:50 EDT
        self.assertEqual(r['load_mw'], 12412.1)

    def test_rejects_garbage(self):
        for payload in ([], [{}], [{'data': [{'Wind': 1}]}]):
            with self.assertRaises(ValueError):
                iso.parse_isone(payload, None, NOW)


class BuildTest(unittest.TestCase):
    def test_rejects_non_positive_load_and_empty_mix(self):
        t = datetime(2026, 10, 13, 1, 0, tzinfo=timezone.utc)
        with self.assertRaises(ValueError):
            iso._build('spp', [(t, 0.0)], [(t, {'wind': 5.0})], NOW)
        with self.assertRaises(ValueError):
            iso._build('spp', [(t, 10.0)], [], NOW)
        with self.assertRaises(ValueError):
            iso._build('spp', [], [(t, {'wind': 0.0})], NOW)

    def test_registry_matches_meta(self):
        self.assertEqual(list(iso.ISOS), list(iso.META))
        for meta in iso.META.values():
            self.assertEqual(set(meta), {'label', 'name', 'url', 'cadence'})


if __name__ == '__main__':
    unittest.main()
