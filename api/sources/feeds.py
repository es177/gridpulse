"""Publisher news and grid-operator notices merged into one dated stream of significant events.
Publishers are fetched concurrently and a failing one never sinks the rest."""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Callable, Optional
from urllib.parse import urljoin, urlsplit
from zoneinfo import ZoneInfo

try:
    from .common import HEADERS, text, utc_iso
    from .nrc import EASTERN, NRC_HEADERS
except ImportError:
    from common import HEADERS, text, utc_iso
    from nrc import EASTERN, NRC_HEADERS

# NRC's RSS news feed stopped gaining items in September 2026, when releases moved from PDFs to
# web pages. The yearly release listing at {NRC_RELEASES}/{year} is the complete record.
NRC_RELEASES = 'https://www.nrc.gov/about-nrc/news-releases'
MISO = 'https://www.misoenergy.org'
MISO_NOTICES = MISO + '/markets-and-operations/notifications/real-time-operations-notifications/'
CAISO_NOTICES = 'https://www.caiso.com/emergency-notifications'
ERCOT_CONDITIONS = 'https://www.ercot.com/gridmktinfo/dashboards/gridconditions'

MAX_ITEMS = 150
MAX_AGE = timedelta(days=45)
ATOM = '{http://www.w3.org/2005/Atom}'
# MISO labels publishDateUnformatted +00:00, but it is Eastern Standard wall time all year.
MISO_TIME = timezone(timedelta(hours=-5))
PACIFIC = ZoneInfo('America/Los_Angeles')
CENTRAL = ZoneInfo('America/Chicago')
CAISO_ROUTINE = {'Restricted Maintenance Operations', 'Test'}
FOLLOW_UP = re.compile(r'\s*(?:updated?|ended|cancell?ed|termination)\b', re.I)
# ERCOT dashboard states above 'normal' and 'weather' (a forecast watch): voluntary conservation
# notice, conservation appeal and Energy Emergency Alert levels.
ERCOT_ALERTS = {'vcn', 'conservation', 'eea1', 'eea2', 'eea3'}

# Topics a reader can filter by. A story is listed only if it matches at least one,
# counting the topic its publisher implies.
TOPICS = {
    'nuclear': r'nuclear|reactors?\b|uranium|haleu|enrichment|\bsmrs?\b|fission|\bnrc\b',
    'reliability': r'emergenc|\balerts?\b|\badvisor(?:y|ies)\b|load shed|rolling (?:blackout|outage)|blackout'
                   r'|power outage|reliabilit|maximum generation|capacity (?:deficien|shortfall)|resource adequacy'
                   r'|peak (?:demand|load)|(?:demand|load) records?|record (?:demand|peak|load)|(?:hot|cold|extreme) weather'
                   r'|stressed (?:system|grid)|secur(?:e|es|ing) [\w\s-]{0,30}\bgrid\b',  # DOE 202(c) orders
    'demand': r'data cent(?:er|re)s?|\bai\b|artificial intelligence|large loads?|hyperscal|crypto'
              r'|load growth|electricity (?:use|demand|consumption)|power demand|electric vehicles?',
    'markets': r'capacity (?:auction|market|prices?)|auction results|interconnection|transmission|\btariffs?\b'
               r'|\bferc\b|wholesale (?:power |electricity )?(?:prices?|markets?)|market (?:rules?|design|reform)'
               r'|electricity (?:prices?|bills?|rates?)|power prices?',
    'generation': r'\bsolar\b|\bwind (?:power|farms?|generation|energy|capacity|turbines?)\b|offshore wind|geothermal'
                  r'|power plants?|gas[- ]fired|coal[- ]fired|coal plants?|generat(?:ion|ing) capacity'
                  r'|electricity generation|retire',
    'storage': r'\bstorage\b|batter(?:y|ies)(?! electric\b)|pumped hydro',  # not "battery electric" cars
}
TOPIC_PATTERNS = {name: re.compile(pattern, re.I) for name, pattern in TOPICS.items()}
# Housekeeping, promotion and opinion: never listed, whoever publishes it.
NOISE = re.compile(
    r'\b(?:webinars?|podcasts?|videos?|newsletters?|viewpoint|opinion|interviews?|q&a|registration|register'
    r'|training|user guide|careers?|jobs?|interns?|internships?|scholarships?|reminder|stakeholder'
    r'|consumer liaison|meetings?|workshops?|conferences?|symposium|summit|forums?|hearings?|town hall'
    r'|anniversary|appoint(?:s|ed|ment)?|joins|welcomes|roundup|interactive|dashboards?|data viewer|heatmap'
    r'|board of directors)\b', re.I)
# World Nuclear News publishes several stories a day worldwide; only milestones are listed.
MAJOR_NUCLEAR = re.compile(
    r'connected to (?:the )?grid|grid connection|criticality|first concrete|construction (?:starts?|begins?|licen)'
    r'|(?:starts?|begins?) construction|commercial operation|enters? operation|operating licen[cs]e|approv|permit'
    r'|clears|selected|restart|shut ?down|closure|decommission|incident|accident|order(?:s|ed|ing)?\b'
    r'|final investment decision'
    r'|funding|loan|cancel|halt|suspend', re.I)
# Per publisher: the topic every story implies, a pattern a headline must match ('major'),
# and headlines to drop on top of NOISE ('noise').
RULES = {
    'World Nuclear News': {'implies': 'nuclear', 'major': MAJOR_NUCLEAR},
    'NRC News': {'implies': 'nuclear',
                 'noise': re.compile(r'^NRC Advisory:|Plant Performance|Schedules Public Outreach', re.I)},
    'DOE Nuclear Energy': {'implies': 'nuclear'},
    'DOE Newsroom': {'noise': re.compile(
        r'Early Career|Fellowship|Lawrence Award|Genesis Mission|Strategic Petroleum|45Z|Prize', re.I)},
    'NERC News': {'implies': 'reliability'},
    'PJM Inside Lines': {'noise': re.compile(r'Education Recordings|Named .*Vice President|Elects .*Board', re.I)},
    'MISO Notifications': {
        'implies': 'reliability',
        'major': re.compile(r'^(?:Maximum Generation (?:Emergency )?(?:Warning|Alert|Event)|Energy Emergency'
                            r'|Capacity Advisory Declaration)', re.I),
        'noise': re.compile(r'Termination|Cancell?ation|^Updated:', re.I)},  # follow-ups, as for CAISO
    'CAISO Emergency Notices': {'implies': 'reliability'},
    'ERCOT Grid Conditions': {'implies': 'reliability'},
}
BOILERPLATE = re.compile(r'\s*The post .*? appeared first on .*$', re.I)


def topics(title: str, source: str = '') -> list[str]:
    """Topics for a story, or [] if it should not be listed. Headlines only: summaries mention
    side subjects (a gas-price story citing power demand) and would mislabel stories."""
    rule = RULES.get(source, {})
    noisy = NOISE.search(title) or ('noise' in rule and rule['noise'].search(title))
    if noisy or ('major' in rule and not rule['major'].search(title)):
        return []
    return [name for name, pattern in TOPIC_PATTERNS.items() if name == rule.get('implies') or pattern.search(title)]


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


def _link(link: str | None, source: str) -> str:
    """Absolute https link on the publisher's own domain, or '' to reject the story."""
    feed = PUBLISHERS.get(source)
    url = (link or '').strip()
    if feed:
        url = urljoin(feed.url, url)
        if url.startswith('http://'):  # every publisher serves its own pages over https
            url = 'https://' + url[len('http://'):]
    host = urlsplit(url).hostname or ''
    on_domain = not feed or host == feed.domain or host.endswith('.' + feed.domain)
    return url if url.startswith('https://') and on_domain else ''


def _articles(entries, source: str, now: datetime | None = None, quiet: bool = False) -> list[dict]:
    """(title markup, link, aware datetime or None, description markup) -> listed stories.
    An empty list means no news. Unless the publisher is quiet (its notices exist only while
    something is happening), a payload without a single dated story is treated as broken."""
    now = now or datetime.now(timezone.utc)
    articles, dated = [], 0
    for title, link, moment, description in entries:
        title, url = text(title), _link(link, source)
        # Future dates are publisher errors; a small allowance covers clock skew.
        if not title or not url or moment is None or moment > now + timedelta(minutes=10):
            continue
        dated += 1
        tags = topics(title, source)
        if not tags or moment < now - MAX_AGE:
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
            'tags': tags,
        })
    if not dated and not quiet:
        raise ValueError(f'{source} feed contains no dated items')
    return articles


def parse_feed(raw: bytes | str, source: str, now: datetime | None = None) -> list[dict]:
    """RSS or Atom. Relative links resolve against the publisher's URL."""
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
    return _articles([(t, u, parse_date(p, now), d) for t, u, p, d in items], source, now)


def parse_nrc_releases(markup: bytes | str, source: str = 'NRC News', now: datetime | None = None) -> list[dict]:
    """NRC's yearly release table: date, release number linking to the release, title.
    Dates carry no time, so each release is stamped at the start of its Eastern day."""
    if isinstance(markup, bytes):
        markup = markup.decode('utf-8', 'replace')
    entries = []
    for row in re.findall(r'<tr\b.*?</tr>', markup, re.S | re.I):
        cells = re.findall(r'<td\b[^>]*>(.*?)</td>', row, re.S | re.I)
        link = re.search(r'href="([^"]+)"', cells[1]) if len(cells) == 3 else None
        if not link:
            continue
        try:
            day = datetime.strptime(text(cells[0]), '%m/%d/%Y').replace(tzinfo=EASTERN)
        except ValueError:
            continue
        entries.append((cells[2], urljoin(NRC_RELEASES, text(link[1])), day, ''))
    return _articles(entries, source, now)


def parse_nerc(raw: bytes | str, source: str = 'NERC News', now: datetime | None = None) -> list[dict]:
    """NERC's newsroom search API: site-relative URLs, ISO dates in UTC."""
    return _articles([(i.get('title'), i.get('url'), parse_date(i.get('date'), now), i.get('description'))
                      for i in json.loads(raw)['items']], source, now)


def parse_miso_news(raw: bytes | str, source: str = 'MISO News', now: datetime | None = None) -> list[dict]:
    """MISO's news releases. Only title, link, date and subheading are read."""
    return _articles([(a.get('name'), a.get('linkURL'), parse_date(a.get('startPublish'), now), a.get('subheader'))
                      for a in json.loads(raw)['articles']], source, now)


def parse_miso_notices(raw: bytes | str, source: str = 'MISO Notifications', now: datetime | None = None) -> list[dict]:
    """MISO's real-time operations notifications for about the last month."""
    entries = []
    for notice in json.loads(raw):
        moment = datetime.fromisoformat(notice['publishDateUnformatted'][:19]).replace(tzinfo=MISO_TIME)
        link = notice.get('permanentLinkUrl') or f"{MISO_NOTICES}#{notice.get('id')}"
        # Keep the region names, not the lists of balancing-authority codes after them.
        body = re.sub(r'(\w+ Region) - [^<]*', r'\1', notice.get('body') or '')
        entries.append((notice['subject'], link, moment, body))
    return _articles(entries, source, now)


def parse_caiso(raw: bytes | str, source: str = 'CAISO Emergency Notices', now: datetime | None = None) -> list[dict]:
    """CAISO's emergency notices for the last 90 days, without links or time zone: times are
    Pacific wall clock. Routine maintenance restrictions and system tests are dropped, and
    no notices at all is the normal state."""
    notices = json.loads(raw)
    if not isinstance(notices, list):  # an error envelope must not read as "no emergencies"
        raise ValueError(f'{source} payload is not a list of notices')
    entries = []
    for notice in notices:
        # Follow-ups repeat the event they belong to; one item per emergency is enough.
        if notice['EventType'] in CAISO_ROUTINE or FOLLOW_UP.match(notice.get('MessageSubject') or ''):
            continue
        moment = datetime.fromisoformat(notice['MessagePostDatetime'][:19]).replace(tzinfo=PACIFIC)
        body = re.sub(r'^.*?Notice No: \S+', '', notice.get('MessageBody') or '', flags=re.S)
        entries.append((notice['MessageSubject'], f"{CAISO_NOTICES}#{notice['MessageID']}", moment, body))
    return _articles(entries, source, now, quiet=True)


def parse_ercot(raw: bytes | str, source: str = 'ERCOT Grid Conditions', now: datetime | None = None) -> list[dict]:
    """ERCOT's grid conditions dashboard reports only the current condition. An alert in force
    becomes one item per state and Central day, stamped with the dashboard's update time;
    normal conditions mean no items."""
    condition = json.loads(raw)['current_condition']
    state, level = condition['state'], int(condition.get('eea_level') or 0)
    if level < 1 and state not in ERCOT_ALERTS:
        return []
    moment = datetime.fromtimestamp(condition['datetime'], timezone.utc)
    title = f'ERCOT Energy Emergency Alert level {level}' if level else f"ERCOT {condition.get('title') or state}"
    url = f'{ERCOT_CONDITIONS}#{state}-{moment.astimezone(CENTRAL).date().isoformat()}'
    return _articles([(title, url, moment, condition.get('condition_note'))], source, now, quiet=True)


async def fetch_nrc_releases(client, now: datetime | None = None) -> list[dict]:
    year = (now or datetime.now(timezone.utc)).astimezone(EASTERN).year
    for y in (year, year - 1):  # in early January the new year's listing is a page without rows
        response = await client.get(f'{NRC_RELEASES}/{y}', headers=NRC_HEADERS)
        response.raise_for_status()
        try:
            return parse_nrc_releases(response.text, now=now)
        except ValueError:
            if y != year:
                raise


@dataclass(frozen=True)
class Feed:
    name: str
    url: str                          # fetched; also the base for relative links
    parse: Callable[..., list]        # (body, name, now) -> items; raises when the payload is broken
    timeout: float = 8                # seconds; all publishers share the feeds source's 25 s budget
    post: Optional[dict] = None       # JSON body to POST instead of a GET
    fetch: Optional[Callable] = None  # custom async (client, now) -> items
    snapshot: bool = False            # reports only the current state, so earlier items are carried forward

    @property
    def domain(self) -> str:
        """Every link must stay on this registrable domain, e.g. caiso.com for wwwmobile.caiso.com."""
        return '.'.join(urlsplit(self.url).hostname.split('.')[-2:])


# Timeouts leave room over the slowest of 10 calls measured in Oct 2026 while every source refreshed
# at once: WNN up to 6.5 s (alone ~1.1 s); eia.gov answers its RSS only after 8-10 s; energy.gov
# usually answers in 0.3 s but stalled for a minute (13-15 s, once 40 s).
FEEDS = [
    Feed('World Nuclear News', 'https://www.world-nuclear-news.org/rss', parse_feed, timeout=12),  # ~280 KB
    Feed('NRC News', NRC_RELEASES, parse_nrc_releases, fetch=fetch_nrc_releases),
    Feed('DOE Nuclear Energy', 'https://www.energy.gov/ne/rss.xml', parse_feed, timeout=20),  # RSS served as text/html
    Feed('DOE Newsroom', 'https://www.energy.gov/newsroom/rss.xml', parse_feed, timeout=20),
    Feed('NERC News', 'https://www.nerc.com/api/search/news?t=Headlines&pg=1', parse_nerc),
    Feed('EIA Today in Energy', 'https://www.eia.gov/rss/todayinenergy.xml', parse_feed, timeout=20),
    Feed('EIA Press Releases', 'https://www.eia.gov/rss/press_rss.xml', parse_feed, timeout=20),
    Feed('PJM Inside Lines', 'https://insidelines.pjm.com/feed/', parse_feed),
    Feed('MISO News', MISO + '/api/News/GetNews', parse_miso_news, timeout=12),  # ~320 KB with article bodies
    Feed('MISO Notifications', MISO + '/api/topicnotifications/getrecentnotifications', parse_miso_notices,
         post={'topics': ['RealTime'], 'take': 0}),
    Feed('CAISO Emergency Notices', 'https://wwwmobile.caiso.com/TodaysOutlookApi/api/EmergencyNotices/v2/'
         'Last90DaysEmergencyNotifications', parse_caiso),
    Feed('ERCOT Grid Conditions', 'https://www.ercot.com/api/1/services/read/dashboards/daily-prc.json',
         parse_ercot, snapshot=True),
]
PUBLISHERS = {feed.name: feed for feed in FEEDS}


def _newest(items) -> list[dict]:
    return sorted(items, key=lambda i: (i['published'], i['id']), reverse=True)[:MAX_ITEMS]


def merge(results: list) -> dict:
    """Combine per-publisher results (lists, possibly empty, or exceptions) in FEEDS order."""
    by_url, failed, feeds = {}, [], []
    for feed, result in zip(FEEDS, results):
        if isinstance(result, BaseException):
            failed.append(feed.name)
            continue
        feeds.append({'name': feed.name, 'url': feed.url, 'count': len(result)})
        for item in result:
            by_url.setdefault(item['url'], item)
    if not feeds:
        raise ValueError('All news feeds unavailable')
    items = _newest(by_url.values())
    return {'observed_at': items[0]['published'] if items else None, 'items': items, 'failed': failed,
            'feeds': feeds, 'source_url': FEEDS[0].url}


def carry_forward(new: dict, previous: dict | None, now: datetime | None = None) -> dict:
    """Keep a failed publisher's previous items so one outage does not empty its section, and a
    snapshot publisher's earlier alerts after conditions return to normal."""
    keep = set(new.get('failed') or ()) | {feed.name for feed in FEEDS if feed.snapshot}
    cutoff = utc_iso((now or datetime.now(timezone.utc)) - MAX_AGE)
    by_url = {item['url']: item for item in new['items']}
    for item in (previous or {}).get('items', []):
        if item.get('source') in keep and item.get('published', '') >= cutoff:
            by_url.setdefault(item['url'], item)
    if len(by_url) == len(new['items']):
        return new
    items = _newest(by_url.values())
    return {**new, 'items': items, 'observed_at': items[0]['published']}


async def fetch_feeds(client, now: datetime | None = None) -> dict:
    async def one(feed: Feed) -> list[dict]:
        if feed.fetch:
            return await feed.fetch(client, now)
        if feed.post is None:
            response = await client.get(feed.url, headers=HEADERS)
        else:
            response = await client.post(feed.url, json=feed.post, headers=HEADERS)
        response.raise_for_status()
        return feed.parse(response.content, feed.name, now)

    results = await asyncio.gather(*(asyncio.wait_for(one(feed), feed.timeout) for feed in FEEDS),
                                   return_exceptions=True)
    return merge(results)
