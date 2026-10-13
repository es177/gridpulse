"""Publisher RSS/Atom feeds merged into one dated news stream. A failing feed never sinks the rest."""
from __future__ import annotations

import asyncio
import hashlib
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

try:
    from .common import HEADERS, text, utc_iso
    from .nrc import NRC_HEADERS
except ImportError:
    from common import HEADERS, text, utc_iso
    from nrc import NRC_HEADERS

# (display name, url, timeout seconds, request headers)
FEEDS = [
    ('World Nuclear News', 'https://www.world-nuclear-news.org/rss', 8, HEADERS),
    ('NRC News', 'https://www.nrc.gov/public-involve/rss?feed=news', 8, NRC_HEADERS),
    ('DOE Nuclear Energy', 'https://www.energy.gov/ne/rss.xml', 8, HEADERS),
    ('EIA Today in Energy', 'https://www.eia.gov/rss/todayinenergy.xml', 12, HEADERS),  # often ~9 s
    ('PJM Inside Lines', 'https://insidelines.pjm.com/feed/', 8, HEADERS),
    ('ISO New England', 'https://isonewswire.com/feed/', 8, HEADERS),
]
MAX_ITEMS = 150
# Topic implied by the publisher, added even when the headline lacks a keyword.
FEED_TAGS = {'World Nuclear News': 'nuclear', 'NRC News': 'nuclear', 'DOE Nuclear Energy': 'nuclear',
             'PJM Inside Lines': 'grid', 'ISO New England': 'grid'}
ATOM = '{http://www.w3.org/2005/Atom}'

TAGS = {
    'ai-load': r'data cent(?:er|re)s?|\bai\b|artificial intelligence|large loads?|hyperscal|computational',
    'grid': r'\bgrid\b|transmission|interconnection|reliability|capacity auction|\bload\b|outage',
    'nuclear': r'nuclear|reactor|uranium|haleu|enrichment|\bsmr',
    'storage': r'storage|batter(?:y|ies)|demand response|flexibility',
    'supply': r'\bsolar\b|\bwind\b|geothermal|power plant|natural gas|\bgeneration\b',
}
TAG_PATTERNS = {tag: re.compile(pattern, re.I) for tag, pattern in TAGS.items()}
BOILERPLATE = re.compile(r'\s*The post .*? appeared first on .*$', re.I)


def tag(title: str, summary: str = '', implied: str | None = None) -> list[str]:
    content = f'{title} {summary}'
    return [name for name, pattern in TAG_PATTERNS.items() if name == implied or pattern.search(content)]


def parse_date(raw: str | None, now: datetime | None = None) -> datetime | None:
    """RFC 822 (RSS) or ISO 8601 (Atom). Infers a missing year, as EIA's feed sometimes omits it."""
    value = re.sub(r'\s+', ' ', (raw or '').strip())
    if not value:
        return None
    now = now or datetime.now(timezone.utc)
    try:
        moment = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        moment = None
    if moment is None:
        missing_year = re.match(r'^(?:\w{3}, )?(\d{1,2} \w{3}) (\d{1,2}:\d{2}(?::\d{2})?)(.*)$', value)
        if missing_year:
            for year in (now.year, now.year - 1):
                try:
                    candidate = parsedate_to_datetime(f'{missing_year[1]} {year} {missing_year[2]}{missing_year[3]}')
                except (TypeError, ValueError, IndexError):
                    break
                if candidate <= now + timedelta(days=1):
                    moment = candidate
                    break
    if moment is None:
        try:
            moment = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def _https(url: str) -> str:
    url = (url or '').strip()
    if url.startswith('http://') and ('eia.gov' in url or 'nrc.gov' in url or 'energy.gov' in url):
        url = 'https://' + url[len('http://'):]
    return url


def parse_feed(raw: bytes | str, source: str, now: datetime | None = None) -> list[dict]:
    root = ET.fromstring(raw)
    now = now or datetime.now(timezone.utc)
    items = []
    for node in root.findall('.//item'):
        items.append((node.findtext('title'), node.findtext('link'), node.findtext('pubDate'),
                      node.findtext('description')))
    for node in root.findall(f'.//{ATOM}entry'):
        # Elements without children are falsy, so test for None explicitly.
        link = node.find(f'{ATOM}link[@rel="alternate"]')
        if link is None:
            link = node.find(f'{ATOM}link')
        items.append((node.findtext(f'{ATOM}title'), link.get('href') if link is not None else None,
                      node.findtext(f'{ATOM}published') or node.findtext(f'{ATOM}updated'),
                      node.findtext(f'{ATOM}summary') or node.findtext(f'{ATOM}content')))
    articles = []
    for title, link, published, description in items:
        title, url = text(title), _https(link)
        moment = parse_date(published, now)
        # Future dates are publisher errors; a small allowance covers clock skew.
        if not title or not url.startswith('https://') or moment is None or moment > now + timedelta(minutes=10):
            continue
        summary = BOILERPLATE.sub('', text(description))
        if len(summary) > 280:
            summary = summary[:279].rsplit(' ', 1)[0] + '…'
        articles.append({
            'id': hashlib.sha1(url.encode()).hexdigest()[:12],
            'title': title,
            'url': url,
            'published': utc_iso(moment),
            'source': source,
            'summary': summary,
            'tags': tag(title, summary, FEED_TAGS.get(source)),
        })
    if not articles:
        raise ValueError(f'{source} feed contains no dated items')
    return articles


def merge(results: list) -> dict:
    """Combine per-feed results (lists or exceptions) in FEEDS order."""
    by_url, failed, feeds = {}, [], []
    for (name, url, _, _), result in zip(FEEDS, results):
        if isinstance(result, BaseException):
            failed.append(name)
            continue
        feeds.append({'name': name, 'url': url, 'count': len(result)})
        for item in result:
            by_url.setdefault(item['url'], item)
    if not by_url:
        raise ValueError('All news feeds unavailable')
    items = sorted(by_url.values(), key=lambda i: (i['published'], i['id']), reverse=True)[:MAX_ITEMS]
    return {'observed_at': items[0]['published'], 'items': items, 'failed': failed, 'feeds': feeds,
            'source_url': FEEDS[0][1]}


def carry_forward(new: dict, previous: dict | None) -> dict:
    """Keep a failed publisher's previous items so one outage does not empty its section."""
    if not previous or not new.get('failed'):
        return new
    by_url = {item['url']: item for item in new['items']}
    for item in previous.get('items', []):
        if item.get('source') in new['failed']:
            by_url.setdefault(item['url'], item)
    items = sorted(by_url.values(), key=lambda i: (i['published'], i['id']), reverse=True)[:MAX_ITEMS]
    return {**new, 'items': items, 'observed_at': items[0]['published']}


async def fetch_feeds(client) -> dict:
    async def one(name, url, timeout, headers):
        response = await asyncio.wait_for(client.get(url, headers=headers), timeout)
        response.raise_for_status()
        return parse_feed(response.content, name)

    results = await asyncio.gather(*(one(*feed) for feed in FEEDS), return_exceptions=True)
    return merge(results)
