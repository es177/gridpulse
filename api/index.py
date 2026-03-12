"""GridPulse - Energy Intelligence Platform (Vercel Serverless)."""

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func

load_dotenv()

# Ensure api dir is on path for imports
sys.path.insert(0, os.path.dirname(__file__))

from database import (
    Base,
    GridSnapshot,
    Investment,
    NewsRaw,
    PolicyEvent,
    Reactor,
    ReactorHistory,
    SessionLocal,
    engine,
    init_db,
)
from routers import enrichment, grid, investments, policy, reactors
from scrapers.eia import fetch_fuel_mix, _mock_fuel_mix
from scrapers.news import (
    INVESTMENT_QUERIES,
    POLICY_QUERIES,
    extract_with_claude,
    fetch_news,
)
from scrapers.nrc import fetch_reactor_status, _mock_reactor_status
from seed_data import seed

# Initialize database tables + seed data
init_db()
seed()


def _seed_live_data():
    """Populate grid snapshots and reactor power on cold start (no cron on free tier)."""
    db = SessionLocal()
    try:
        existing = db.query(func.count(GridSnapshot.id)).scalar()
        if existing > 0:
            return

        now = datetime.utcnow()
        fuel_data = _mock_fuel_mix()
        for row in fuel_data:
            db.add(GridSnapshot(
                timestamp=now,
                region=row["region"],
                fuel_type=row["fuel_type"],
                value_mw=row["value_mw"],
                respondent=row.get("respondent", ""),
            ))

        nrc_data = _mock_reactor_status()
        for item in nrc_data:
            reactor = db.query(Reactor).filter(Reactor.name == item["name"]).first()
            if reactor:
                reactor.current_pct_power = item["pct_power"]
                reactor.last_updated = now

        db.commit()
        print(f"[Seed] Live data: {len(fuel_data)} grid rows, {len(nrc_data)} reactor updates")
    except Exception as e:
        db.rollback()
        print(f"[Seed] Live data error: {e}")
    finally:
        db.close()


_seed_live_data()

app = FastAPI(
    title="GridPulse",
    description="Energy Intelligence Platform API",
    version="1.0.0",
)

# CORS — allow Vercel preview URLs and production domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(grid.router)
app.include_router(reactors.router)
app.include_router(enrichment.router)
app.include_router(policy.router)
app.include_router(investments.router)


# --- Summary endpoint ---


@app.get("/api/stats/summary")
async def get_summary():
    """Top-level KPIs for dashboard header."""
    db = SessionLocal()
    try:
        latest_ts = db.query(func.max(GridSnapshot.timestamp)).scalar()
        total_demand = 0
        nuclear_mw = 0
        if latest_ts:
            cutoff = latest_ts - timedelta(minutes=30)
            snapshots = (
                db.query(GridSnapshot)
                .filter(GridSnapshot.timestamp >= cutoff)
                .all()
            )
            fuel_totals = {}
            for s in snapshots:
                fuel_totals[s.fuel_type] = fuel_totals.get(s.fuel_type, 0) + s.value_mw
            total_demand = sum(fuel_totals.values())
            nuclear_mw = fuel_totals.get("nuclear", 0)

        nuclear_pct = round(nuclear_mw / total_demand * 100, 1) if total_demand > 0 else 0

        high_power_count = (
            db.query(Reactor).filter(Reactor.current_pct_power > 90).count()
        )
        total_reactors = db.query(Reactor).count()

        year_start = datetime(datetime.utcnow().year, 1, 1)
        ytd_investment = (
            db.query(func.sum(Investment.amount_usd))
            .filter(Investment.date >= year_start)
            .scalar()
        ) or 0
        total_investment = (
            db.query(func.sum(Investment.amount_usd)).scalar()
        ) or 0

        latest_policy = (
            db.query(PolicyEvent).order_by(PolicyEvent.date.desc()).first()
        )

        return {
            "total_demand_gw": round(total_demand / 1000, 1),
            "nuclear_pct": nuclear_pct,
            "nuclear_mw": round(nuclear_mw, 0),
            "reactors_above_90": high_power_count,
            "total_reactors": total_reactors,
            "ytd_investment_usd": ytd_investment,
            "total_investment_usd": total_investment,
            "latest_policy": {
                "title": latest_policy.title,
                "date": latest_policy.date.isoformat() if latest_policy.date else None,
                "event_type": latest_policy.event_type,
            }
            if latest_policy
            else None,
            "timestamp": datetime.utcnow().isoformat(),
        }
    finally:
        db.close()


# --- Cron endpoints (called by Vercel Cron Jobs) ---


def _verify_cron(request: Request) -> bool:
    """Verify request is from Vercel Cron."""
    cron_secret = os.getenv("CRON_SECRET")
    if not cron_secret:
        return True  # Allow in dev
    auth = request.headers.get("authorization", "")
    return auth == f"Bearer {cron_secret}"


@app.get("/api/cron/eia")
async def cron_eia(request: Request):
    """Vercel Cron: Sync EIA grid data every 5 minutes."""
    if not _verify_cron(request):
        return Response(status_code=401, content="Unauthorized")

    db = SessionLocal()
    try:
        fuel_data = await fetch_fuel_mix()
        now = datetime.utcnow()
        for row in fuel_data:
            db.add(GridSnapshot(
                timestamp=now,
                region=row["region"],
                fuel_type=row["fuel_type"],
                value_mw=row["value_mw"],
                respondent=row.get("respondent", ""),
            ))
        db.commit()
        return {"status": "ok", "records": len(fuel_data)}
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


@app.get("/api/cron/nrc")
async def cron_nrc(request: Request):
    """Vercel Cron: Sync NRC reactor status every 30 minutes."""
    if not _verify_cron(request):
        return Response(status_code=401, content="Unauthorized")

    db = SessionLocal()
    try:
        status_list = await fetch_reactor_status()
        now = datetime.utcnow()
        updated = 0
        for item in status_list:
            reactor = db.query(Reactor).filter(Reactor.name == item["name"]).first()
            if reactor:
                old_power = reactor.current_pct_power
                reactor.current_pct_power = item["pct_power"]
                reactor.last_updated = now
                if old_power != item["pct_power"]:
                    db.add(ReactorHistory(
                        reactor_id=reactor.id,
                        timestamp=now,
                        pct_power=item["pct_power"],
                    ))
                updated += 1
        db.commit()
        return {"status": "ok", "updated": updated}
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


@app.get("/api/cron/policy")
async def cron_policy(request: Request):
    """Vercel Cron: Sync policy news every 6 hours."""
    if not _verify_cron(request):
        return Response(status_code=401, content="Unauthorized")

    db = SessionLocal()
    try:
        articles = await fetch_news(POLICY_QUERIES, days_back=3)
        processed = 0
        for article in articles:
            existing = db.query(NewsRaw).filter(NewsRaw.url == article["url"]).first()
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
                article["title"], article.get("content", ""), "policy"
            )
            if extraction:
                db.add(PolicyEvent(
                    title=article["title"],
                    date=raw.published_at or datetime.utcnow(),
                    source_url=article["url"],
                    event_type=extraction.get("event_type", "regulatory"),
                    entities_json=json.dumps(extraction.get("entities", [])),
                    dollar_amount=extraction.get("dollar_amount"),
                    sentiment=extraction.get("sentiment", "neutral"),
                    summary=extraction.get("summary", article["title"]),
                ))
                raw.processed = True
                processed += 1
        db.commit()
        return {"status": "ok", "articles": len(articles), "processed": processed}
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


@app.get("/api/cron/investments")
async def cron_investments(request: Request):
    """Vercel Cron: Sync investment news every 12 hours."""
    if not _verify_cron(request):
        return Response(status_code=401, content="Unauthorized")

    db = SessionLocal()
    try:
        articles = await fetch_news(INVESTMENT_QUERIES, days_back=7)
        processed = 0
        for article in articles:
            existing = db.query(NewsRaw).filter(NewsRaw.url == article["url"]).first()
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
                db.add(Investment(
                    company=extraction.get("company", "Unknown"),
                    date=raw.published_at or datetime.utcnow(),
                    amount_usd=extraction.get("amount_usd"),
                    round_type=extraction.get("round_type", "other"),
                    investors_json=json.dumps(extraction.get("investors", [])),
                    technology_type=extraction.get("technology_type", "other"),
                    summary=extraction.get("summary", article["title"]),
                ))
                raw.processed = True
                processed += 1
        db.commit()
        return {"status": "ok", "articles": len(articles), "processed": processed}
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    db = SessionLocal()
    try:
        reactor_count = db.query(Reactor).count()
        latest_grid = db.query(func.max(GridSnapshot.timestamp)).scalar()
        return {
            "status": "healthy",
            "reactors": reactor_count,
            "latest_grid_data": latest_grid.isoformat() if latest_grid else None,
            "timestamp": datetime.utcnow().isoformat(),
        }
    finally:
        db.close()


@app.get("/")
async def root():
    return {
        "name": "GridPulse",
        "version": "1.0.0",
        "docs": "/docs",
    }
