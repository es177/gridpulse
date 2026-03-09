"""RSS feed scraper for fast, free news updates."""
from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime

import httpx

# Fast-updating public RSS feeds for nuclear/energy news
RSS_FEEDS = [
    {
        "name": "World Nuclear News",
        "url": "https://world-nuclear-news.org/RSS",
        "source_id": "wnn",
    },
    {
        "name": "DOE Office of Nuclear Energy",
        "url": "https://www.energy.gov/ne/rss.xml",
        "source_id": "doe_ne",
    },
    {
        "name": "NRC News Releases",
        "url": "https://www.nrc.gov/reading-rm/doc-collections/news/rss.xml",
        "source_id": "nrc",
    },
    {
        "name": "Reuters Energy",
        "url": "https://news.google.com/rss/search?q=nuclear+energy+when:7d&hl=en-US&gl=US&ceid=US:en",
        "source_id": "google_news",
    },
    {
        "name": "Nuclear Energy News",
        "url": "https://news.google.com/rss/search?q=%22nuclear+reactor%22+OR+%22uranium+enrichment%22+OR+%22fusion+energy%22+when:3d&hl=en-US&gl=US&ceid=US:en",
        "source_id": "google_nuclear",
    },
]

# Nuclear/energy keywords for relevance filtering
RELEVANCE_KEYWORDS = [
    "nuclear", "reactor", "uranium", "enrichment", "fusion",
    "nrc", "doe", "smr", "haleu", "tritium",
    "terrapower", "nuscale", "oklo", "kairos", "x-energy",
    "centrus", "urenco", "helion", "cfs", "commonwealth fusion",
    "grid", "megawatt", "gigawatt", "clean energy", "baseload",
    "advanced reactor", "molten salt", "fast reactor", "tokamak",
]


def _is_relevant(title: str, description: str) -> bool:
    """Check if article is relevant to nuclear/energy sector."""
    text = f"{title} {description}".lower()
    return any(kw in text for kw in RELEVANCE_KEYWORDS)


def _generate_why_matters(title: str, description: str) -> str:
    """Generate a 'why this matters' summary based on content keywords."""
    text = f"{title} {description}".lower()

    if any(w in text for w in ["legislation", "bill", "act", "signed", "passed", "congress"]):
        return "Policy changes directly impact the regulatory and economic landscape for nuclear energy deployment."
    if any(w in text for w in ["funding", "grant", "loan", "investment", "raised", "billion", "million"]):
        return "Capital flows signal market confidence and accelerate technology development timelines."
    if any(w in text for w in ["nrc", "license", "certification", "approved", "regulatory"]):
        return "Regulatory milestones are critical gatekeepers for new nuclear technology deployment."
    if any(w in text for w in ["construction", "built", "broke ground", "site", "deploy"]):
        return "Physical construction progress moves technology from concept to grid-connected reality."
    if any(w in text for w in ["fusion", "tokamak", "plasma", "stellarator"]):
        return "Fusion breakthroughs could unlock virtually unlimited clean energy if commercialized."
    if any(w in text for w in ["enrichment", "uranium", "haleu", "fuel"]):
        return "Fuel supply chain security is essential for both existing fleet operations and advanced reactor deployment."
    if any(w in text for w in ["grid", "demand", "capacity", "shortage", "blackout"]):
        return "Grid reliability directly affects energy security, economic stability, and clean energy transition timing."
    if any(w in text for w in ["safety", "incident", "shutdown", "leak"]):
        return "Safety events shape public perception and regulatory response, affecting the entire industry."

    return "This development reflects the evolving landscape of nuclear energy policy, technology, or markets."


async def fetch_rss_feeds() -> list[dict]:
    """Fetch and parse all configured RSS feeds."""
    all_articles = []

    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        for feed in RSS_FEEDS:
            try:
                resp = await client.get(feed["url"])
                resp.raise_for_status()
                articles = _parse_rss(resp.text, feed)
                all_articles.extend(articles)
            except Exception as e:
                print(f"[RSS] Error fetching {feed['name']}: {e}")

    # Deduplicate by title similarity
    seen_titles = set()
    deduped = []
    for article in all_articles:
        key = article["title"].lower().strip()[:80]
        if key not in seen_titles:
            seen_titles.add(key)
            deduped.append(article)

    # Sort by date, newest first
    deduped.sort(key=lambda a: a.get("published_at") or "", reverse=True)
    return deduped


def _parse_rss(xml_text: str, feed: dict) -> list[dict]:
    """Parse RSS XML into article dicts."""
    articles = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []

    # Handle both RSS 2.0 and Atom feeds
    ns = {"atom": "http://www.w3.org/2005/Atom"}

    # RSS 2.0 format
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        description = (item.findtext("description") or "").strip()
        pub_date = item.findtext("pubDate") or ""

        if not title or not link:
            continue

        # Filter by relevance
        if feed["source_id"] in ("google_news", "google_nuclear") and not _is_relevant(title, description):
            continue

        published_at = None
        try:
            if pub_date:
                published_at = parsedate_to_datetime(pub_date).isoformat()
        except Exception:
            pass

        # Clean HTML from description
        import re
        description = re.sub(r"<[^>]+>", "", description).strip()
        if len(description) > 500:
            description = description[:500] + "..."

        why_matters = _generate_why_matters(title, description)

        articles.append({
            "title": title,
            "url": link,
            "description": description,
            "published_at": published_at,
            "source_name": feed["name"],
            "source_id": feed["source_id"],
            "why_matters": why_matters,
        })

    # Atom format fallback
    if not articles:
        for entry in root.findall(".//atom:entry", ns):
            title = (entry.findtext("atom:title", "", ns) or "").strip()
            link_el = entry.find("atom:link", ns)
            link = link_el.get("href", "") if link_el is not None else ""
            summary = (entry.findtext("atom:summary", "", ns) or "").strip()
            updated = entry.findtext("atom:updated", "", ns)

            if not title:
                continue

            import re
            summary = re.sub(r"<[^>]+>", "", summary).strip()
            why_matters = _generate_why_matters(title, summary)

            articles.append({
                "title": title,
                "url": link,
                "description": summary[:500],
                "published_at": updated,
                "source_name": feed["name"],
                "source_id": feed["source_id"],
                "why_matters": why_matters,
            })

    return articles
