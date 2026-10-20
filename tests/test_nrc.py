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

    def test_rows_with_unreadable_dates_are_skipped(self):
        rows = [f'1/2/2026 12:00:00 AM|Unit {i}|100' for i in range(85)]
        rows += ['|Blank|100', '13/45/2026 12:00:00 AM|Bad|100', '1/1/2026 12:00:00 AM|Unit 0|90']
        result = nrc.parse_status('\n'.join(rows))
        self.assertEqual(result['dates'], ['2026-01-01', '2026-01-02'])
        self.assertNotIn('Bad', {u['name'] for u in result['units']})
        self.assertEqual(next(u for u in result['units'] if u['name'] == 'Unit 0')['power'], [90, 100])


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


    def test_each_cited_cfr_section_is_its_own_summary_part(self):
        # Waterford 3, EN 58501 (Oct 2026) cites two sections in one cell.
        two = '50.72(b)(2)(iv)(B) - RPS Actuation - Critical\n 50.72(b)(3)(iv)(A) - Valid Specif Sys Actuation\n'
        page = read('events_20261009.html')
        start = page.index('10 CFR Section:<br>', page.index('id="en58484"')) + len('10 CFR Section:<br>')
        markup = page[:start] + two + page[page.index('</div>', start):]
        event = next(i for i in nrc.parse_events(markup, 'u') if i['id'] == 'EN-58484')
        self.assertTrue(event['summary'].startswith(
            'Power Reactor · RPS Actuation - Critical · Valid Specif Sys Actuation · Non Emergency · Unit 1'))
        part70 = nrc.CFR_CODE.split('PART 70 APP A (b)(1) - Unanalyzed Condition')
        self.assertEqual([d for d in part70 if d], ['Unanalyzed Condition'])
        self.assertEqual(nrc.CFR_CODE.split('Agreement State'), ['Agreement State'])

    def test_feed_keeps_reactor_events_scrams_and_emergencies_only(self):
        pages = [nrc.parse_events(read(f'events_{day}.html'), 'u') for day in ('20261009', '20261008')]
        significant = {i['id']: i['category'] for i in nrc.merge_events(pages) if i['significant']}
        self.assertIn('EN-58484', significant)                   # Browns Ferry 1, power reactor
        self.assertEqual(set(significant.values()), {'Power Reactor'})  # materials and medical reports dropped
        self.assertNotIn('EN-58471', significant)                # Agreement State shutter

    def test_links_stay_on_nrc(self):
        self.assertEqual(nrc.nrc_url('/reactors/a.html'), 'https://www.nrc.gov/reactors/a.html')
        self.assertEqual(nrc.nrc_url('https://www.nrc.gov/b'), 'https://www.nrc.gov/b')
        for bad in ('javascript:alert(1)', '//evil.example/x', 'https://www.nrc.gov.evil.example/', 'http://www.nrc.gov/c', ''):
            self.assertIsNone(nrc.nrc_url(bad), bad)

    def test_sentence_case_keeps_plant_acronyms(self):
        self.assertEqual(nrc.sentence_case('RCS PRESSURE BOUNDARY DEGRADED'), 'RCS pressure boundary degraded')
        self.assertEqual(nrc.sentence_case('LOSS OF ECCS (HPCI) INJECTION'), 'Loss of ECCS (HPCI) injection')
        self.assertEqual(nrc.sentence_case('Degraded Condition'), 'Degraded condition')

if __name__ == '__main__':
    unittest.main()
