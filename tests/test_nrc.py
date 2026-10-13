import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'api' / 'sources'))
import nrc  # noqa: E402

FIXTURES = ROOT / 'tests' / 'fixtures' / 'nrc'


def read(name):
    return (FIXTURES / name).read_text(encoding='utf-8')


class StatusTest(unittest.TestCase):
    def setUp(self):
        self.status = nrc.parse_status(read('status.txt'))

    def test_dates_are_chronological_and_latest_report_wins(self):
        dates = self.status['dates']
        self.assertEqual(dates, sorted(dates))
        self.assertEqual(self.status['report_date'], dates[-1])
        self.assertEqual(self.status['observed_at'], dates[-1] + 'T00:00:00+00:00')
        self.assertEqual(len(self.status['units']), 95)
        for unit in self.status['units']:
            self.assertEqual(len(unit['power']), len(dates))
            self.assertIsNotNone(unit['power'][-1])

    def test_partial_or_garbage_reports_are_rejected(self):
        with self.assertRaises(ValueError):
            nrc.parse_status('ReportDt|Unit|Power\n10/9/2026 12:00:00 AM|Unit 1|100\n')
        with self.assertRaises(ValueError):
            nrc.parse_status('<html>Access denied</html>')

    def test_out_of_range_power_is_missing_not_clamped(self):
        rows = [f'1/2/2026 12:00:00 AM|Unit {i}|100' for i in range(85)]
        rows.append('1/2/2026 12:00:00 AM|Odd|140')
        result = nrc.parse_status('\n'.join(rows))
        odd = next(u for u in result['units'] if u['name'] == 'Odd')
        self.assertIsNone(odd['power'][-1])


class DirectoryTest(unittest.TestCase):
    def test_includes_part_52_dockets(self):
        units = nrc.parse_directory(read('directory.html'))['units']
        self.assertEqual(len(units), 95)
        vogtle4 = next(u for u in units if u['name'] == 'Vogtle 4')
        self.assertEqual(vogtle4['docket'], '05200026')
        self.assertEqual(vogtle4['state'], 'GA')
        self.assertTrue(vogtle4['url'].startswith('https://www.nrc.gov/'))

    def test_rejects_incomplete_directory(self):
        with self.assertRaises(ValueError):
            nrc.parse_directory('<table><tr><td>nothing</td></tr></table>')


class JoinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.status = nrc.parse_status(read('status.txt'))
        directory = nrc.parse_directory(read('directory.html'))
        reference = json.loads((ROOT / 'api' / 'data' / 'reactors.json').read_text())
        cls.rows = {r['name']: r for r in nrc.join_units(cls.status, directory, reference)}

    def test_every_reported_unit_joins_directory_and_reference(self):
        self.assertEqual(len(self.rows), 95)
        for row in self.rows.values():
            self.assertTrue(row['docket'], row['name'])
            self.assertIsNotNone(row['lat'], row['name'])
            self.assertIsNotNone(row['mwt'], row['name'])

    def test_name_aliases(self):
        self.assertEqual(self.rows['Harris 1']['docket'], '05000400')
        self.assertEqual(self.rows['River Bend Station 1']['docket'], '05000458')
        self.assertEqual(self.rows['Vogtle 3']['docket'], '05200025')
        self.assertEqual(nrc.normalized('St. Lucie 2'), nrc.normalized('Saint Lucie 2'))

    def test_status_change_since_and_average(self):
        dates = self.status['dates']
        offline = self.rows['Browns Ferry 1']
        self.assertEqual(offline['status'], 'offline')
        self.assertEqual(offline['since'], '2026-09-12')
        self.assertLess(offline['avg30'], 10)
        reduced = self.rows['Hatch 2']
        self.assertEqual((reduced['today'], reduced['prev'], reduced['change']), (94, 95, -1))
        self.assertEqual((reduced['status'], reduced['since']), ('reduced', dates[-1]))

    def test_classification_thresholds(self):
        self.assertEqual([nrc.classify(p) for p in (100, 95, 94, 1, 0, None)],
                         ['full', 'full', 'reduced', 'reduced', 'offline', 'unknown'])


class EventsTest(unittest.TestCase):
    def test_index_lists_daily_pages_newest_first(self):
        links = nrc.parse_event_index(read('events_2026.html'))
        self.assertEqual(len(links), 8)
        self.assertTrue(links[0].endswith('/2026/20261010en'))
        self.assertTrue(all(link.startswith('https://www.nrc.gov/') for link in links))

    def test_events_parse_merge_and_omit_people(self):
        pages = [nrc.parse_events(read(f'events_{day}.html'), f'https://example.org/{day}')
                 for day in ('20261009', '20261008')]
        self.assertEqual([len(p) for p in pages], [6, 8])
        items = nrc.merge_events(pages)
        self.assertEqual(len(items), 9)  # five events repeat across the two days
        self.assertEqual([i['published'] for i in items], sorted((i['published'] for i in items), reverse=True))
        reactor = next(i for i in items if i['id'] == 'EN-58484')
        self.assertEqual(reactor['title'], 'Browns Ferry 1 — Degraded condition')
        self.assertEqual(reactor['published'], '2026-10-08T00:32:00+00:00')  # 20:32 ET
        self.assertIn('Unit 1: 0% → 0% (Cold Shutdown)', reactor['summary'])
        self.assertEqual(reactor['url'], 'https://example.org/20261009#en58484')
        self.assertEqual(reactor['updated'], '2026-10-07')  # the field ends at </div>, not the next <br>
        materials = next(i for i in items if i['id'] == 'EN-58471')
        self.assertEqual(materials['facility'], '3M Company, Corp Rad Prot and Comp')
        self.assertEqual(materials['title'], '3M Company, Corp Rad Prot and Comp — Stuck shutter')
        self.assertEqual(materials['summary'], 'Agreement State · Non Emergency')
        for item in items:
            self.assertNotIn('Redacted', item['title'] + item['summary'])
            self.assertLessEqual(len(item['summary']), 280)


if __name__ == '__main__':
    unittest.main()
