"""APScheduler jobs for periodic data syncing."""

import asyncio
import json
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from database import (
    GridSnapshot,
    Investment,
    NewsRaw,
    PolicyEvent,
    Reactor,
    ReactorHistory,
    SessionLocal,
)
from scrapers.eia import fetch_fuel_mix, fetch_regional_demand
from scrapers.news import (
    INVESTMENT_QUERIES,
    POLICY_QUERIES,
    extract_with_claude,
    fetch_news,
)
from scrapers.nrc import fetch_reactor_status

scheduler = AsyncIOScheduler()

# Store latest grid data for WebSocket broadcast
latest_grid_data = {"timestamp": None, "national_fuel_mix": {}, "regions": []}


async def sync_eia_data():
    """Fetch EIA grid data and store snapshots."""
    global latest_grid_data
    print(f"[Scheduler] EIA sync at {datetime.utcnow()}")

    db = SessionLocal()
    try:
        fuel_data = await fetch_fuel_mix()
        now = datetime.utcnow()

        for row in fuel_data:
            db.add(
                GridSnapshot(
                    timestamp=now,
                    region=row["region"],
                    fuel_type=row["fuel_type"],
                    value_mw=row["value_mw"],
                    respondent=row.get("respondent", ""),
                )
            )
        db.commit()

        # Update latest data for WebSocket
        national = {}
        regions_dict = {}
        for row in fuel_data:
            ft = row["fuel_type"]
            national[ft] = national.get(ft, 0) + row["value_mw"]

            reg = row["region"]
            if reg not in regions_dict:
                regions_dict[reg] = {"region": reg, "respondent": row.get("respondent", ""), "fuels": {}}
            regions_dict[reg]["fuels"][ft] = row["value_mw"]

        latest_grid_data = {
            "timestamp": now.isoformat(),
            "national_fuel_mix": national,
            "regions": list(regions_dict.values()),
        }

        print(f"[Scheduler] EIA: stored {len(fuel_data)} fuel mix records")
    except Exception as e:
        db.rollback()
        print(f"[Scheduler] EIA error: {e}")
    finally:
        db.close()


async def sync_nrc_data():
    """Fetch NRC reactor status and update database."""
    print(f"[Scheduler] NRC sync at {datetime.utcnow()}")

    db = SessionLocal()
    try:
        status_list = await fetch_reactor_status()
        now = datetime.utcnow()

        for item in status_list:
            reactor = (
                db.query(Reactor)
                .filter(Reactor.name == item["name"])
                .first()
            )
            if reactor:
                old_power = reactor.current_pct_power
                reactor.current_pct_power = item["pct_power"]
                reactor.last_updated = now

                # Record history if power changed
                if old_power != item["pct_power"]:
                    db.add(
                        ReactorHistory(
                            reactor_id=reactor.id,
                            timestamp=now,
                            pct_power=item["pct_power"],
                        )
                    )

        db.commit()
        print(f"[Scheduler] NRC: updated {len(status_list)} reactors")
    except Exception as e:
        db.rollback()
        print(f"[Scheduler] NRC error: {e}")
    finally:
        db.close()


async def sync_policy_news():
    """Fetch and process policy news articles."""
    print(f"[Scheduler] Policy news sync at {datetime.utcnow()}")

    db = SessionLocal()
    try:
        articles = await fetch_news(POLICY_QUERIES, days_back=3)

        for article in articles:
            # Skip if already fetched
            existing = (
                db.query(NewsRaw).filter(NewsRaw.url == article["url"]).first()
            )
            if existing:
                continue

            # Store raw
            raw = NewsRaw(
                query=article["query"],
                title=article["title"],
                url=article["url"],
                published_at=(
                    datetime.fromisoformat(article["published_at"].replace("Z", "+00:00"))
                    if article.get("published_at")
                    else None
                ),
                content=article.get("content"),
                processed=False,
            )
            db.add(raw)
            db.flush()

            # Extract with Claude
            extraction = await extract_with_claude(
                article["title"], article.get("content", ""), "policy"
            )
            if extraction:
                db.add(
                    PolicyEvent(
                        title=article["title"],
                        date=raw.published_at or datetime.utcnow(),
                        source_url=article["url"],
                        event_type=extraction.get("event_type", "regulatory"),
                        entities_json=json.dumps(extraction.get("entities", [])),
                        dollar_amount=extraction.get("dollar_amount"),
                        sentiment=extraction.get("sentiment", "neutral"),
                        summary=extraction.get("summary", article["title"]),
                    )
                )
                raw.processed = True

        db.commit()
        print(f"[Scheduler] Policy: processed {len(articles)} articles")
    except Exception as e:
        db.rollback()
        print(f"[Scheduler] Policy error: {e}")
    finally:
        db.close()


async def sync_investment_news():
    """Fetch and process investment news articles."""
    print(f"[Scheduler] Investment news sync at {datetime.utcnow()}")

    db = SessionLocal()
    try:
        articles = await fetch_news(INVESTMENT_QUERIES, days_back=7)

        for article in articles:
            existing = (
                db.query(NewsRaw).filter(NewsRaw.url == article["url"]).first()
            )
            if existing:
                continue

            raw = NewsRaw(
                query=article["query"],
                title=article["title"],
                url=article["url"],
                published_at=(
                    datetime.fromisoformat(article["published_at"].replace("Z", "+00:00"))
                    if article.get("published_at")
                    else None
                ),
                content=article.get("content"),
                processed=False,
            )
            db.add(raw)
            db.flush()

            extraction = await extract_with_claude(
                article["title"], article.get("content", ""), "investment"
            )
            if extraction:
                db.add(
                    Investment(
                        company=extraction.get("company", "Unknown"),
                        date=raw.published_at or datetime.utcnow(),
                        amount_usd=extraction.get("amount_usd"),
                        round_type=extraction.get("round_type", "other"),
                        investors_json=json.dumps(extraction.get("investors", [])),
                        technology_type=extraction.get("technology_type", "other"),
                        summary=extraction.get("summary", article["title"]),
                    )
                )
                raw.processed = True

        db.commit()
        print(f"[Scheduler] Investment: processed {len(articles)} articles")
    except Exception as e:
        db.rollback()
        print(f"[Scheduler] Investment error: {e}")
    finally:
        db.close()


def start_scheduler():
    """Configure and start all scheduled jobs."""
    # EIA grid data every 5 minutes
    scheduler.add_job(sync_eia_data, "interval", minutes=5, id="eia_sync")

    # NRC reactor status every 30 minutes
    scheduler.add_job(sync_nrc_data, "interval", minutes=30, id="nrc_sync")

    # Policy news every 6 hours
    scheduler.add_job(sync_policy_news, "interval", hours=6, id="policy_sync")

    # Investment news every 12 hours
    scheduler.add_job(sync_investment_news, "interval", hours=12, id="investment_sync")

    scheduler.start()
    print("[Scheduler] Started with EIA(5m), NRC(30m), Policy(6h), Investment(12h)")
