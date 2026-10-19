import asyncio
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'api' / 'sources'))
import feeds  # noqa: E402

FIXTURES = ROOT / 'tests' / 'fixtures' / 'feeds'
NOW = datetime(2026, 10, 13, 2, 0, tzinfo=timezone.utc)
FILES = {'World Nuclear News': 'wnn.xml', 'NRC News': 'nrc_releases.html', 'EIA Today in Energy': 'eia_tie.xml',
         'PJM Inside Lines': 'pjm.xml', 'ISO New England': 'isone.xml'}

# NRC wraps every RSS value in padded CDATA.
PADDED = b'''<rss><channel><item><pubDate><![CDATA[ Mon, 14 Sep 2026 08:00:00 GMT ]]></pubDate>
<title><![CDATA[ NRC Advisory: Public Meeting ]]></title><link><![CDATA[ https://www.nrc.gov/a.pdf ]]></link>
</item></channel></rss>'''

ATOM = b'''<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Example</title>
<entry><title>Grid &amp; storage update</title><link rel="alternate" href="https://example.org/a"/>
<published>2026-10-10T12:00:00Z</published><summary>&lt;p&gt;Battery storage &lt;b&gt;online&lt;/b&gt;&lt;/p&gt;</summary></entry>
<entry><title>Future item</title><link href="https://example.org/b"/><updated>2026-12-01T00:00:00Z</updated></entry>
<entry><title>Insecure link</title><link href="http://example.org/c"/><updated>2026-10-01T00:00:00Z</updated></entry>
</feed>'''


def parse(name, now=NOW):
    raw = (FIXTURES / FILES[name]).read_bytes()
    if name == 'NRC News':
        return feeds.parse_nrc_releases(raw.decode('utf-8'), name, now)
    return feeds.parse_feed(raw, name, now)


class FeedTest(unittest.TestCase):
    def test_fixtures_parse_with_dates_and_clean_text(self):
        for name in FILES:
            items = parse(name)
            self.assertTrue(items, name)
            for item in items:
                self.assertTrue(item['url'].startswith('https://'))
                self.assertTrue(item['published'].endswith('+00:00'))
                self.assertNotIn('<', item['summary'])
                self.assertLessEqual(len(item['summary']), 280)
                self.assertEqual(len(item['id']), 12)

    def test_eia_missing_year_and_padded_dates(self):
        eia = parse('EIA Today in Energy')
        self.assertEqual(eia[0]['published'], '2026-10-09T14:00:00+00:00')  # "Fri, 09 Oct  09:00:00 EST"
        padded = feeds.parse_feed(PADDED, 'NRC News', NOW)[0]
        self.assertEqual((padded['published'], padded['url']), ('2026-09-14T08:00:00+00:00', 'https://www.nrc.gov/a.pdf'))
        self.assertEqual(feeds.parse_date('Fri, 09 Jan 09:00:00 EST', datetime(2026, 1, 5, tzinfo=timezone.utc)).year, 2025)

    def test_boilerplate_and_implied_tags(self):
        iso = parse('ISO New England')
        self.assertTrue(all('appeared first on' not in i['summary'] for i in iso))
        self.assertTrue(all('grid' in i['tags'] for i in iso))
        self.assertTrue(all('nuclear' in i['tags'] for i in parse('NRC News')))
        self.assertEqual(feeds.tag('New data center load in Virginia'), ['ai-load', 'grid'])
        self.assertEqual(feeds.tag('Window maintenance'), [])

    def test_nrc_release_listing(self):
        items = parse('NRC News', datetime(2026, 10, 19, tzinfo=timezone.utc))
        self.assertEqual(len(items), 5)
        self.assertEqual(items[0]['title'], 'NRC Updates AP1000 Design Certification, Streamlines Future Reactor Licensing')
        self.assertEqual(items[0]['url'], 'https://www.nrc.gov/about-nrc/news-releases/2026/26-080')
        self.assertEqual(items[0]['published'], '2026-10-14T04:00:00+00:00')  # date only: midnight EDT
        self.assertEqual(items[-1]['published'], '2026-01-27T05:00:00+00:00')  # midnight EST
        self.assertEqual(items[2]['title'], 'NRC Approves Construction of Nation’s First Small Modular Reactor')
        self.assertEqual(len(parse('NRC News')), 3)  # releases dated after NOW are dropped
        with self.assertRaises(ValueError):
            feeds.parse_nrc_releases('<table><tr><th>Date</th></tr></table>', 'NRC News', NOW)

    def test_nrc_listing_falls_back_to_last_year_while_new_year_is_empty(self):
        year = datetime.now(feeds.EASTERN).year
        pages = {f'{feeds.NRC_RELEASES}/{year}': '<html><p>No releases yet</p></html>',
                 f'{feeds.NRC_RELEASES}/{year - 1}': (FIXTURES / FILES['NRC News']).read_text(encoding='utf-8')}

        class Client:
            async def get(self, url, headers=None):
                return httpx.Response(200, text=pages[url], request=httpx.Request('GET', url))

        self.assertEqual(len(asyncio.run(feeds.fetch_nrc_releases(Client()))), 5)
        pages[f'{feeds.NRC_RELEASES}/{year - 1}'] = '<html></html>'
        with self.assertRaises(ValueError):
            asyncio.run(feeds.fetch_nrc_releases(Client()))

    def test_atom_entries_and_rejections(self):
        items = feeds.parse_feed(ATOM, 'Example', NOW)
        self.assertEqual([i['url'] for i in items], ['https://example.org/a'])
        self.assertEqual(items[0]['summary'], 'Battery storage online')
        self.assertEqual(items[0]['tags'], ['grid', 'storage'])
        with self.assertRaises(ValueError):
            feeds.parse_feed(b'<rss><channel></channel></rss>', 'Empty', NOW)

    def test_merge_isolates_failures_dedupes_and_orders(self):
        results = []
        for name, *_ in feeds.FEEDS:
            results.append(parse(name) if name in FILES else TimeoutError())
        duplicate = dict(results[0][0], source='Copy')
        results[0] = results[0] + [duplicate]
        merged = feeds.merge(results)
        self.assertEqual(merged['failed'], ['DOE Nuclear Energy'])
        urls = [i['url'] for i in merged['items']]
        self.assertEqual(len(urls), len(set(urls)))
        published = [i['published'] for i in merged['items']]
        self.assertEqual(published, sorted(published, reverse=True))
        self.assertEqual(merged['observed_at'], published[0])
        with self.assertRaises(ValueError):
            feeds.merge([ValueError()] * len(feeds.FEEDS))


class CarryForwardTest(unittest.TestCase):
    def test_failed_publisher_keeps_previous_items(self):
        item = lambda src, url, day: {'id': url[-6:], 'title': url, 'url': url, 'source': src,
                                      'published': f'2026-10-{day:02}T00:00:00+00:00', 'summary': '', 'tags': []}
        previous = {'items': [item('A', 'https://a.example/1', 10), item('B', 'https://b.example/1', 11)]}
        new = {'observed_at': None, 'items': [item('A', 'https://a.example/2', 12)], 'failed': ['B'], 'feeds': []}
        merged = feeds.carry_forward(new, previous)
        self.assertEqual([i['url'] for i in merged['items']], ['https://a.example/2', 'https://b.example/1'])
        self.assertEqual(merged['observed_at'], '2026-10-12T00:00:00+00:00')
        self.assertIs(feeds.carry_forward({**new, 'failed': []}, previous)['items'], new['items'])


if __name__ == '__main__':
    unittest.main()
