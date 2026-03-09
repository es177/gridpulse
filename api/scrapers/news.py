"""NewsAPI client with Claude AI extraction pipeline."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta

import httpx

NEWS_API_BASE = "https://newsapi.org/v2/everything"

POLICY_QUERIES = [
    "nuclear energy policy",
    "DOE loan program energy",
    "IRA clean energy",
    "FERC electricity",
    "uranium enrichment",
    "advanced reactor NRC",
    "energy permitting reform",
]

INVESTMENT_QUERIES = [
    "nuclear startup funding",
    "clean energy investment",
    "DOE loan guarantee",
    "energy venture capital",
]


async def fetch_news(queries: list[str], days_back: int = 3) -> list[dict]:
    """Fetch articles from NewsAPI for given search queries."""
    api_key = os.getenv("NEWS_API_KEY", "")
    if not api_key:
        return _mock_news(queries)

    from_date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    all_articles = []

    async with httpx.AsyncClient(timeout=30) as client:
        for query in queries:
            try:
                resp = await client.get(
                    NEWS_API_BASE,
                    params={
                        "apiKey": api_key,
                        "q": query,
                        "from": from_date,
                        "sortBy": "publishedAt",
                        "language": "en",
                        "pageSize": 10,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                for article in data.get("articles", []):
                    all_articles.append(
                        {
                            "query": query,
                            "title": article.get("title", ""),
                            "url": article.get("url", ""),
                            "published_at": article.get("publishedAt"),
                            "content": article.get("content") or article.get("description", ""),
                        }
                    )
            except Exception as e:
                print(f"[NewsAPI] Error for query '{query}': {e}")

    return all_articles


async def extract_with_claude(
    title: str, content: str, extraction_type: str = "policy"
) -> dict | None:
    """Use Claude API to extract structured data from a news article."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        return _mock_extraction(title, extraction_type)

    if extraction_type == "policy":
        prompt = f"""Analyze this energy policy news article and extract structured data.

Title: {title}
Content: {content}

Return a JSON object with these fields:
- event_type: one of "legislation", "executive_order", "regulatory", "funding_announcement", "international"
- entities: list of company/agency names affected
- dollar_amount: numeric dollar amount if mentioned, null otherwise
- sentiment: "positive", "negative", or "neutral" for clean energy
- summary: one sentence summary

Return ONLY the JSON object, no other text."""
    else:
        prompt = f"""Analyze this clean energy investment news article and extract structured data.

Title: {title}
Content: {content}

Return a JSON object with these fields:
- company: primary company name
- amount_usd: numeric investment amount in USD, null if not mentioned
- round_type: one of "seed", "series_a", "series_b", "series_c", "growth", "spac", "doe_grant", "other"
- investors: list of investor names
- technology_type: one of "nuclear", "fusion", "solar", "wind", "geothermal", "storage", "hydrogen", "other"
- summary: one sentence summary

Return ONLY the JSON object, no other text."""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 500,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            text = data["content"][0]["text"].strip()
            # Parse JSON from response
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text)
    except Exception as e:
        print(f"[Claude] Extraction error: {e}")
        return _mock_extraction(title, extraction_type)


def _mock_news(queries: list[str]) -> list[dict]:
    """Return mock news articles."""
    import random

    mock_articles = [
        {
            "title": "DOE Announces $6B in Clean Energy Loan Guarantees",
            "content": "The Department of Energy announced a new round of loan guarantees targeting advanced nuclear and clean hydrogen projects under the Inflation Reduction Act.",
        },
        {
            "title": "NRC Approves License Extension for Vogtle Units 3 and 4",
            "content": "The Nuclear Regulatory Commission granted 40-year license extensions for the newest nuclear units in the US, located at Plant Vogtle in Georgia.",
        },
        {
            "title": "Kairos Power Breaks Ground on Hermes Demonstration Reactor",
            "content": "Kairos Power has begun construction of its Hermes low-power demonstration reactor in Oak Ridge, Tennessee, marking a milestone for advanced reactor deployment.",
        },
        {
            "title": "FERC Proposes Faster Interconnection Rules for Clean Energy",
            "content": "The Federal Energy Regulatory Commission issued a notice of proposed rulemaking to accelerate grid interconnection for renewable and nuclear projects.",
        },
        {
            "title": "TerraPower Secures $750M in Private Funding Round",
            "content": "TerraPower, backed by Bill Gates, closed a $750 million funding round to advance construction of its Natrium sodium-cooled reactor in Kemmerer, Wyoming.",
        },
        {
            "title": "Commonwealth Fusion Systems Achieves Magnet Milestone",
            "content": "CFS reported a breakthrough in high-temperature superconducting magnet performance, bringing its SPARC tokamak closer to demonstrating net energy gain.",
        },
        {
            "title": "Centrus Energy Begins HALEU Production at Piketon",
            "content": "Centrus Energy Corp began producing high-assay low-enriched uranium (HALEU) at its American Centrifuge Plant in Piketon, Ohio, under a DOE contract.",
        },
        {
            "title": "Senate Passes Bipartisan Nuclear Energy Permitting Reform",
            "content": "The US Senate passed legislation to streamline NRC licensing for advanced nuclear reactors, reducing review timelines from years to months.",
        },
    ]

    results = []
    now = datetime.utcnow()
    for i, article in enumerate(mock_articles):
        q = queries[i % len(queries)] if queries else "energy"
        results.append(
            {
                "query": q,
                "title": article["title"],
                "url": f"https://example.com/article/{i}",
                "published_at": (now - timedelta(hours=i * 6)).isoformat(),
                "content": article["content"],
            }
        )
    return results


def _mock_extraction(title: str, extraction_type: str) -> dict:
    """Return mock extraction result."""
    if extraction_type == "policy":
        return {
            "event_type": "regulatory",
            "entities": ["DOE", "NRC"],
            "dollar_amount": None,
            "sentiment": "positive",
            "summary": title,
        }
    return {
        "company": "Unknown",
        "amount_usd": None,
        "round_type": "other",
        "investors": [],
        "technology_type": "nuclear",
        "summary": title,
    }
