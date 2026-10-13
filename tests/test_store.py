import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'api'))

import httpx  # noqa: E402
import store  # noqa: E402
from sources.common import Source  # noqa: E402


def source(name, fetch, ttl=60):
    return Source(name, fetch, ttl=ttl, stale_after=3600, label=name, url='https://example.org', cadence='test', timeout=5)


def run(coro):
    return asyncio.run(coro)


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.empty = Path(tempfile.mkdtemp()) / 'none.json'

    def test_failed_refresh_keeps_last_good_and_hides_details(self):
        calls = {'n': 0}

        async def flaky(client):
            calls['n'] += 1
            if calls['n'] > 1:
                raise RuntimeError('https://api.example.org/?api_key=SECRET exploded')
            return {'observed_at': '2026-01-01T00:00:00+00:00', 'value': 1}

        async def go():
            s = store.Store({'a': source('a', flaky, ttl=0)}, self.empty)
            first = await s.get('a')
            self.assertEqual(first.data['value'], 1)
            second = await s.get('a', force=True)
            return second, s.meta('a')

        with self.assertLogs('gridpulse', 'WARNING'):
            entry, meta = run(go())
        self.assertEqual(entry.data['value'], 1)
        self.assertEqual(entry.error, 'RuntimeError')
        self.assertNotIn('SECRET', json.dumps(meta))
        self.assertTrue(meta['has_data'])

    def test_http_errors_report_status_only(self):
        async def forbidden(client):
            request = httpx.Request('GET', 'https://example.org/?api_key=SECRET')
            raise httpx.HTTPStatusError('denied', request=request, response=httpx.Response(429, request=request))

        async def go():
            s = store.Store({'a': source('a', forbidden)}, self.empty)
            return await s.get('a')

        with self.assertLogs('gridpulse', 'WARNING') as logs:
            self.assertEqual(run(go()).error, 'HTTP 429')
        self.assertNotIn('SECRET', ''.join(logs.output))

    def test_slow_source_does_not_block_fast_one(self):
        async def slow(client):
            await asyncio.sleep(2)
            return {'observed_at': None, 'v': 'slow'}

        async def fast(client):
            return {'observed_at': None, 'v': 'fast'}

        async def go():
            s = store.Store({'slow': source('slow', slow), 'fast': source('fast', fast)}, self.empty)
            loop = asyncio.get_running_loop()
            start = loop.time()
            entries = await s.get_many(['slow', 'fast'], wait=0.2)
            return loop.time() - start, entries

        elapsed, entries = run(go())
        self.assertLess(elapsed, 1.0)
        self.assertEqual(entries['fast'].data['v'], 'fast')
        self.assertIsNone(entries['slow'].data)

    def test_concurrent_requests_share_one_upstream_call(self):
        calls = {'n': 0}

        async def fetch(client):
            calls['n'] += 1
            await asyncio.sleep(0.05)
            return {'observed_at': None}

        async def go():
            s = store.Store({'a': source('a', fetch)}, self.empty)
            await asyncio.gather(*(s.get('a') for _ in range(10)))
            await s.get('a')  # within ttl: no new call

        run(go())
        self.assertEqual(calls['n'], 1)

    def test_refresh_left_on_another_event_loop_is_replaced(self):
        calls = {'n': 0}

        async def fetch(client):
            calls['n'] += 1
            if calls['n'] == 1:
                await asyncio.sleep(3600)       # never finishes on the first loop
            return {'observed_at': None, 'v': calls['n']}

        s = store.Store({'a': source('a', fetch)}, self.empty)
        first = asyncio.new_event_loop()
        first.run_until_complete(s.get('a', wait=0))   # leaves a pending task behind
        first.run_until_complete(asyncio.sleep(0.05))  # let it start, then abandon the loop
        self.assertEqual(calls['n'], 1)
        second = asyncio.new_event_loop()
        try:
            entry = second.run_until_complete(s.get('a', wait=2))
        finally:
            second.close()
            for task in asyncio.all_tasks(first):
                task.cancel()
            first.run_until_complete(asyncio.gather(*asyncio.all_tasks(first), return_exceptions=True))
            first.close()
        self.assertEqual(entry.data['v'], 2)
        self.assertIsNone(s.entries['a'].task)

    def test_carry_merges_with_previous_payload(self):
        async def fetch(client):
            return {'observed_at': None, 'items': ['new']}

        src = Source('a', fetch, ttl=60, stale_after=60, label='a', url='u', cadence='c', timeout=5,
                     carry=lambda new, old: {**new, 'items': new['items'] + (old or {}).get('items', [])})
        path = Path(tempfile.mkdtemp()) / 'snapshot.json'
        path.write_text(json.dumps({'a': {'data': {'items': ['old']}, 'fetched_at': 'y'}}))

        async def go():
            s = store.Store({'a': src}, path)
            return await s.get('a', force=True)

        self.assertEqual(run(go()).data['items'], ['new', 'old'])

    def test_snapshot_seeds_cold_start(self):
        path = Path(tempfile.mkdtemp()) / 'snapshot.json'
        path.write_text(json.dumps({'a': {'data': {'observed_at': 'x', 'v': 7}, 'fetched_at': 'y'}}))

        async def never(client):
            raise ValueError('upstream down')

        async def go():
            s = store.Store({'a': source('a', never)}, path)
            return await s.get('a'), s.meta('a')

        with self.assertLogs('gridpulse', 'WARNING'):
            entry, meta = run(go())
        self.assertEqual(entry.data['v'], 7)
        self.assertEqual(meta['fetched_at'], 'y')
        self.assertEqual(meta['error'], 'invalid data: upstream down')


if __name__ == '__main__':
    unittest.main()
