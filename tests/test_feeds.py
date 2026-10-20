import asyncio
import json
import sys
import unittest
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'api' / 'sources'))
import feeds  # noqa: E402

FIXTURES = ROOT / 'tests' / 'fixtures' / 'feeds'
# What a parser may raise on a payload that is not what the publisher normally sends.
BROKEN = (ValueError, KeyError, TypeError, IndexError, AttributeError, ET.ParseError)
NOW = datetime(2026, 10, 19, 12, 0, tzinfo=timezone.utc)
FILES = {'World Nuclear News': 'wnn.xml', 'NRC News': 'nrc_releases.html', 'DOE Newsroom': 'doe_newsroom.xml',
         'NERC News': 'nerc.json', 'EIA Today in Energy': 'eia_tie.xml', 'EIA Press Releases': 'eia_press.xml',
         'PJM Inside Lines': 'pjm.xml', 'MISO News': 'miso_news.json', 'MISO Notifications': 'miso_notifications.json',
         'CAISO Emergency Notices': 'caiso.json', 'ERCOT Grid Conditions': 'ercot.json'}
QUIET = {'CAISO Emergency Notices', 'ERCOT Grid Conditions'}  # today's fixtures hold no emergency

# NRC wraps every RSS value in padded CDATA.
PADDED = b'''<rss><channel><item><pubDate><![CDATA[ Mon, 14 Sep 2026 08:00:00 GMT ]]></pubDate>
<title><![CDATA[ NRC Approves Construction Permit ]]></title><link><![CDATA[ https://www.nrc.gov/a.pdf ]]></link>
</item></channel></rss>'''

ATOM = b'''<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Example</title>
<entry><title>Grid &amp; storage update</title><link rel="alternate" href="https://example.org/a"/>
<published>2026-10-10T12:00:00Z</published><summary>&lt;p&gt;Battery storage &lt;b&gt;online&lt;/b&gt;&lt;/p&gt;</summary></entry>
<entry><title>Future item</title><link href="https://example.org/b"/><updated>2026-12-01T00:00:00Z</updated></entry>
<entry><title>Insecure link</title><link href="http://example.org/c"/><updated>2026-10-01T00:00:00Z</updated></entry>
</feed>'''


def raw(name):
    return (FIXTURES / FILES[name]).read_bytes()


def parse(name, now=NOW):
    return feeds.PUBLISHERS[name].parse(raw(name), name, now)


def titles(name, now=NOW):
    return [i['title'] for i in parse(name, now)]


def caiso_notice(**changes):
    """A real routine notice from the fixture, turned into an emergency one."""
    return dict(json.loads(raw('CAISO Emergency Notices'))[1], **changes)


def ercot(**condition):
    payload = json.loads(raw('ERCOT Grid Conditions'))
    payload['current_condition'].update(condition)
    return json.dumps(payload).encode()


class FeedTest(unittest.TestCase):
    def test_every_publisher_has_a_fixture_and_rules_name_real_publishers(self):
        self.assertEqual(set(FILES), {f.name for f in feeds.FEEDS} - {'DOE Nuclear Energy'})
        self.assertLessEqual(set(feeds.RULES), set(feeds.PUBLISHERS))
        self.assertTrue(all(f.timeout < 25 for f in feeds.FEEDS))  # inside the feeds source budget

    def test_fixtures_parse_to_clean_items_on_the_publishers_domain(self):
        for name in FILES:
            items = parse(name)
            self.assertEqual(bool(items), name not in QUIET, name)
            domain = feeds.PUBLISHERS[name].domain
            for item in items:
                host = item['url'].split('/')[2]
                self.assertTrue(item['url'].startswith('https://'))
                self.assertTrue(host == domain or host.endswith('.' + domain), item['url'])
                self.assertTrue(item['published'].endswith('+00:00'))
                self.assertNotIn('<', item['summary'])
                self.assertLessEqual(len(item['summary']), 280)
                self.assertEqual(len(item['id']), 12)
                self.assertTrue(item['tags'] and set(item['tags']) <= set(feeds.TOPICS))

    def test_only_significant_stories_are_kept(self):
        self.assertEqual(titles('DOE Newsroom'), [  # awards, fellowships, petroleum reserve dropped
            'Energy Department Announces Virginia and West Virginia Transmission Project to Receive Defense '
            'Production Act Funding, Strengthening National Security and Grid Reliability',
            'Energy Secretary Secures Mid-Atlantic Grid Ahead of Anticipated Stressed System Conditions',  # 202(c) order
            'Energy Department Supports FERC’s Call for PJM to Protect Ratepayers and Build More Reliable Power'])
        self.assertEqual(titles('NERC News'), [  # board meeting and a story older than MAX_AGE dropped
            'FERC Approves 2027 Budgets for NERC and Regional Entities',
            'NERC’s Computational Loads Standards Pass Final Ballot, Advance to Board Adoption',
            'NERC Examines International Blackouts to Strengthen North American Grid Reliability'])
        self.assertEqual(titles('EIA Press Releases'), ['EIA expects record electricity generation in 2026 and 2027'])
        self.assertEqual(titles('MISO News'), ['MISO accelerates new generation and storage projects with fifth ERAS cycle'])
        self.assertEqual(titles('MISO Notifications'), ['Maximum Generation Warning', 'Capacity Advisory Declaration'])
        self.assertNotIn('PJM Introduces Default Dashboard to Data Viewer Tool', titles('PJM Inside Lines'))
        self.assertEqual(titles('EIA Today in Energy'), ['PJM, ERCOT, and SWPP all set peak load records this summer'])

    def test_topics_and_noise(self):
        self.assertEqual(feeds.topics('New data center load in Virginia'), ['demand'])
        self.assertEqual(feeds.topics('Window maintenance'), [])
        self.assertEqual(feeds.topics('Quarterly update', 'NERC News'), ['reliability'])
        self.assertEqual(feeds.topics('NRC Advisory: NRC to Discuss Proposed Reactor', 'NRC News'), [])
        self.assertEqual(feeds.topics('NRC Approves Reactor Restart', 'NRC News'), ['nuclear'])
        self.assertEqual(feeds.topics('Energy Department Announces 2026 Lawrence Award Winners', 'DOE Newsroom'), [])
        self.assertEqual(feeds.topics('Members Committee Elects Two to PJM Board', 'PJM Inside Lines'), [])
        for subject in ('Capacity Advisory Declaration Termination', 'Updated: Maximum Generation Warning',
                        'Load Pocket Advisory Declaration', 'Conservative Operations Declaration',
                        'Geomagnetic Disturbance Warning', 'Severe Weather Alert'):
            self.assertEqual(feeds.topics(subject, 'MISO Notifications'), [], subject)
        for subject in ('Maximum Generation Alert', 'Maximum Generation Emergency Event Step 2a', 'Energy Emergency Alert Level 1'):
            self.assertEqual(feeds.topics(subject, 'MISO Notifications'), ['reliability'], subject)

    def test_follow_ups_and_car_batteries_are_not_events(self):
        # MISO cancels an advisory with its own notice (Oct 19, 2026); like a termination it is a follow-up.
        self.assertEqual(feeds.topics('Capacity Advisory Declaration Cancellation', 'MISO Notifications'), [])
        self.assertEqual(feeds.topics('Capacity Advisory Declaration', 'MISO Notifications'), ['reliability'])
        # "Battery electric" means cars (EIA Today in Energy, Oct 19, 2026), not grid storage.
        self.assertEqual(feeds.topics('Hybrid sales rise while battery electric sales remain lower after tax credit '
                                      'expiration', 'EIA Today in Energy'), [])
        self.assertEqual(feeds.topics('Battery electric vehicles add to power demand'), ['demand'])
        self.assertEqual(feeds.topics('Battery storage capacity doubles in ERCOT'), ['storage'])
        self.assertEqual(feeds.topics('Grid batteries electrify the evening peak'), ['storage'])

    def test_eia_missing_year_and_padded_dates(self):
        self.assertEqual(parse('EIA Today in Energy')[0]['published'], '2026-10-15T14:00:00+00:00')  # 09:00 EST
        self.assertEqual(feeds.parse_date('Fri, 09 Oct  09:00:00 EST', NOW).isoformat(), '2026-10-09T14:00:00+00:00')
        self.assertEqual(feeds.parse_date('Fri, 09 Jan 09:00:00 EST', datetime(2026, 1, 5, tzinfo=timezone.utc)).year, 2025)
        padded = feeds.parse_feed(PADDED, 'NRC News', NOW)[0]
        self.assertEqual((padded['published'], padded['url']), ('2026-09-14T08:00:00+00:00', 'https://www.nrc.gov/a.pdf'))

    def test_miso_notice_times_are_eastern_standard_despite_utc_label(self):
        warning = parse('MISO Notifications')[0]
        self.assertEqual(warning['published'], '2026-10-12T20:42:25+00:00')  # "10/12/2026 3:42 PM EST"
        self.assertTrue(warning['summary'].startswith('MISO has issued a Maximum Generation Warning'))
        self.assertIn('South Region Central Region', warning['summary'])  # balancing-authority codes dropped

    def test_caiso_times_are_pacific_and_routine_notices_drop(self):
        self.assertEqual(parse('CAISO Emergency Notices'), [])  # maintenance restrictions and a system test
        summer = caiso_notice(EventType='Flex Alert', MessageSubject='Flex Alert issued for CAISO Grid',
                              MessagePostDatetime='2026-10-08T17:00:00')
        winter = caiso_notice(EventType='EEA Watch', MessagePostDatetime='2026-12-01T18:00:00')
        [item] = feeds.parse_caiso(json.dumps([summer]).encode(), now=NOW)
        self.assertEqual(item['published'], '2026-10-09T00:00:00+00:00')  # PDT
        self.assertEqual(item['url'], 'https://www.caiso.com/emergency-notifications#202652546259-14')
        self.assertEqual(item['tags'], ['reliability'])
        self.assertTrue(item['summary'].startswith('The California ISO has declared'))
        [item] = feeds.parse_caiso(json.dumps([winter]).encode(), now=datetime(2026, 12, 2, 12, tzinfo=timezone.utc))
        self.assertEqual(item['published'], '2026-12-02T02:00:00+00:00')  # PST

    def test_relative_links_join_the_publishers_site(self):
        self.assertEqual(parse('EIA Press Releases')[0]['url'], 'https://www.eia.gov/pressroom/releases/press592.php')
        self.assertTrue(parse('NERC News')[0]['url'].startswith('https://www.nerc.com/newsroom/'))
        self.assertEqual(parse('MISO News')[0]['url'], 'https://www.misoenergy.org/link/9a65a9ee991645168f4bc85038e00192.aspx')
        self.assertEqual(parse('MISO Notifications')[0]['url'], 'https://www.misoenergy.org/markets-and-operations/'
                         'notifications/real-time-operations-notifications/real-time-notification/?id=2390')

    def test_links_must_be_https_on_the_publishers_domain(self):
        story = {'title': 'NERC Reliability Assessment', 'date': '2026-10-15T00:00:00Z', 'description': ''}
        links = ['http://www.nerc.com/a', 'https://example.org/b', 'https://nerc.com.example.org/c', 'javascript:x', '/d']
        payload = json.dumps({'items': [dict(story, url=u) for u in links]}).encode()
        self.assertEqual([i['url'] for i in feeds.parse_nerc(payload, now=NOW)],
                         ['https://www.nerc.com/a', 'https://www.nerc.com/d'])

    def test_empty_is_healthy_only_where_quiet_is_normal(self):
        self.assertEqual(feeds.parse_caiso(b'[]', now=NOW), [])
        self.assertEqual(parse('ERCOT Grid Conditions'), [])  # normal conditions
        self.assertEqual(feeds.parse_ercot(ercot(state='weather', title='Weather Watch'), now=NOW), [])
        for broken in (lambda: feeds.parse_caiso(b'{"Message": "error"}', now=NOW),
                       lambda: feeds.parse_ercot(b'{}', now=NOW),
                       lambda: feeds.parse_nerc(b'{"items": []}', now=NOW),
                       lambda: feeds.parse_miso_notices(b'[]', now=NOW),
                       lambda: feeds.parse_feed(b'<rss><channel></channel></rss>', 'Empty', NOW)):
            with self.assertRaises((ValueError, KeyError, TypeError)):
                broken()

    def test_error_pages_empty_bodies_and_rate_limits_raise_for_every_publisher(self):
        bodies = [b'', b'<!DOCTYPE html><html><head><title>503 Service Unavailable</title></head><body></body></html>',
                  b'<html><head><title>Just a moment...</title></head><body><p>Checking</p></body></html>',
                  b'{"error": {"code": "OVER_RATE_LIMIT", "message": "rate limit exceeded"}}', b'{}', b'Too Many Requests']
        for feed in feeds.FEEDS:
            for body in bodies:
                with self.assertRaises(BROKEN, msg=f'{feed.name}: {body[:20]!r}'):
                    feed.parse(body, feed.name, NOW)

    def test_ercot_emergency_becomes_one_item_per_state_and_day(self):
        moment = datetime(2026, 10, 19, 7, 40, 53, tzinfo=timezone.utc)  # 02:40 CDT, the fixture's update time
        eea = feeds.parse_ercot(ercot(state='eea2', eea_level=2, title='EEA Level 2',
                                      condition_note='Controlled outages may be needed.'), now=NOW)
        self.assertEqual([(i['title'], i['url'], i['published'], i['summary'], i['tags']) for i in eea], [(
            'ERCOT Energy Emergency Alert level 2', f'{feeds.ERCOT_CONDITIONS}#eea2-2026-10-19',
            moment.isoformat(), 'Controlled outages may be needed.', ['reliability'])])
        appeal = feeds.parse_ercot(ercot(state='conservation', title='Conservation Appeal'), now=NOW)
        self.assertEqual([(i['title'], i['url']) for i in appeal],
                         [('ERCOT Conservation Appeal', f'{feeds.ERCOT_CONDITIONS}#conservation-2026-10-19')])

    def test_nrc_release_listing(self):
        items = parse('NRC News')
        self.assertEqual(len(items), 3)  # an advisory and a registration notice dropped
        self.assertEqual(items[0]['title'], 'NRC Updates AP1000 Design Certification, Streamlines Future Reactor Licensing')
        self.assertEqual(items[0]['url'], 'https://www.nrc.gov/about-nrc/news-releases/2026/26-080')
        self.assertEqual(items[0]['published'], '2026-10-14T04:00:00+00:00')  # date only: midnight EDT
        self.assertEqual(items[2]['title'], 'NRC Approves Construction of Nation’s First Small Modular Reactor')
        self.assertEqual(len(parse('NRC News', datetime(2026, 10, 13, 2, tzinfo=timezone.utc))), 1)  # future dates drop
        with self.assertRaises(ValueError):
            feeds.parse_nrc_releases('<table><tr><th>Date</th></tr></table>', 'NRC News', NOW)

    def test_nrc_listing_falls_back_to_last_year_while_new_year_is_empty(self):
        pages = {f'{feeds.NRC_RELEASES}/2026': '<html><p>No releases yet</p></html>',
                 f'{feeds.NRC_RELEASES}/2025': raw('NRC News').decode('utf-8')}

        class Client:
            async def get(self, url, headers=None):
                return httpx.Response(200, text=pages[url], request=httpx.Request('GET', url))

        self.assertEqual(len(asyncio.run(feeds.fetch_nrc_releases(Client(), NOW))), 3)
        pages[f'{feeds.NRC_RELEASES}/2025'] = '<html></html>'
        with self.assertRaises(ValueError):
            asyncio.run(feeds.fetch_nrc_releases(Client(), NOW))

    def test_atom_entries_and_rejections(self):
        items = feeds.parse_feed(ATOM, 'Example', NOW)
        self.assertEqual([i['url'] for i in items], ['https://example.org/a'])
        self.assertEqual(items[0]['summary'], 'Battery storage online')
        self.assertEqual(items[0]['tags'], ['storage'])


class MergeTest(unittest.TestCase):
    def test_fetch_isolates_failures_posts_where_needed_and_counts_quiet_publishers(self):
        bodies = {f.url: raw(f.name) for f in feeds.FEEDS if f.name in FILES}
        bodies[f'{feeds.NRC_RELEASES}/2026'] = raw('NRC News')
        requests = []

        class Client:
            async def get(self, url, headers=None):
                return self.reply('GET', url)

            async def post(self, url, json=None, headers=None):
                return self.reply('POST', url, json)

            def reply(self, method, url, body=None):
                requests.append((method, url, body))
                status = 200 if url in bodies else 503
                return httpx.Response(status, content=bodies.get(url, b''), request=httpx.Request(method, url))

        merged = asyncio.run(feeds.fetch_feeds(Client(), NOW))
        self.assertEqual(merged['failed'], ['DOE Nuclear Energy'])
        counts = {f['name']: f['count'] for f in merged['feeds']}
        self.assertEqual((counts['CAISO Emergency Notices'], counts['ERCOT Grid Conditions']), (0, 0))
        self.assertIn(('POST', feeds.PUBLISHERS['MISO Notifications'].url, {'topics': ['RealTime'], 'take': 0}), requests)
        self.assertEqual(len(merged['items']), sum(counts.values()))
        self.assertEqual(merged['source_url'], feeds.FEEDS[0].url)

    def test_merge_dedupes_and_orders(self):
        results = [parse(f.name) if f.name in FILES else TimeoutError() for f in feeds.FEEDS]
        results[0] = results[0] + [dict(results[1][0], source='Copy')]
        merged = feeds.merge(results)
        urls = [i['url'] for i in merged['items']]
        self.assertEqual(len(urls), len(set(urls)))
        published = [i['published'] for i in merged['items']]
        self.assertEqual(published, sorted(published, reverse=True))
        self.assertEqual(merged['observed_at'], published[0])
        with self.assertRaises(ValueError):
            feeds.merge([ValueError()] * len(feeds.FEEDS))
        quiet = feeds.merge([[] for _ in feeds.FEEDS])
        self.assertEqual((quiet['items'], quiet['failed'], quiet['observed_at']), ([], [], None))


class CarryForwardTest(unittest.TestCase):
    @staticmethod
    def item(source, url, day):
        return {'id': url[-6:], 'title': url, 'url': url, 'source': source,
                'published': f'2026-10-{day:02}T00:00:00+00:00', 'summary': '', 'tags': []}

    def test_failed_publisher_keeps_previous_items(self):
        item = self.item
        previous = {'items': [item('A', 'https://a.example/1', 10), item('B', 'https://b.example/1', 11),
                              item('B', 'https://b.example/0', 1)]}  # older than MAX_AGE by Nov 20
        new = {'observed_at': None, 'items': [item('A', 'https://a.example/2', 12)], 'failed': ['B'], 'feeds': []}
        merged = feeds.carry_forward(new, previous, NOW)
        self.assertEqual([i['url'] for i in merged['items']], ['https://a.example/2', 'https://b.example/1', 'https://b.example/0'])
        self.assertEqual(merged['observed_at'], '2026-10-12T00:00:00+00:00')
        later = feeds.carry_forward(new, previous, datetime(2026, 11, 20, tzinfo=timezone.utc))
        self.assertEqual([i['url'] for i in later['items']], ['https://a.example/2', 'https://b.example/1'])
        self.assertIs(feeds.carry_forward({**new, 'failed': []}, previous, NOW)['items'], new['items'])
        self.assertIs(feeds.carry_forward(new, None, NOW), new)

    def test_ercot_alert_stays_after_conditions_return_to_normal(self):
        alert = self.item('ERCOT Grid Conditions', f'{feeds.ERCOT_CONDITIONS}#eea1-2026-10-18', 18)
        new = {'observed_at': None, 'items': [], 'failed': [], 'feeds': []}
        merged = feeds.carry_forward(new, {'items': [alert]}, NOW)
        self.assertEqual(merged['items'], [alert])
        self.assertEqual(merged['observed_at'], alert['published'])


if __name__ == '__main__':
    unittest.main()
