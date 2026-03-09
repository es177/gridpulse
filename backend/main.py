"""GridPulse - Energy Intelligence Platform API."""

import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func

load_dotenv()

# Ensure backend dir is on path
sys.path.insert(0, os.path.dirname(__file__))

from database import (
    GridSnapshot,
    Investment,
    PolicyEvent,
    Reactor,
    SessionLocal,
    init_db,
)
from routers import enrichment, grid, investments, policy, reactors
from scheduler import (
    latest_grid_data,
    start_scheduler,
    sync_eia_data,
    sync_investment_news,
    sync_nrc_data,
    sync_policy_news,
)
from seed_data import seed

# Track connected WebSocket clients
ws_clients: set[WebSocket] = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    # Initialize database
    init_db()
    print("[GridPulse] Database initialized")

    # Seed data on first run
    seed()
    print("[GridPulse] Seed data loaded")

    # Run initial data fetch
    await sync_eia_data()
    await sync_nrc_data()
    print("[GridPulse] Initial data sync complete")

    # Start background scheduler
    start_scheduler()

    # Start WebSocket broadcast task
    broadcast_task = asyncio.create_task(ws_broadcast_loop())

    yield

    # Cleanup
    broadcast_task.cancel()
    from scheduler import scheduler as sched
    sched.shutdown()


app = FastAPI(
    title="GridPulse",
    description="Energy Intelligence Platform API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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
        # Total demand
        latest_ts = db.query(func.max(GridSnapshot.timestamp)).scalar()
        total_demand = 0
        nuclear_mw = 0
        if latest_ts:
            from datetime import timedelta

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

        # Reactors at >90%
        high_power_count = (
            db.query(Reactor)
            .filter(Reactor.current_pct_power > 90)
            .count()
        )
        total_reactors = db.query(Reactor).count()

        # YTD investment total
        year_start = datetime(datetime.utcnow().year, 1, 1)
        ytd_investment = (
            db.query(func.sum(Investment.amount_usd))
            .filter(Investment.date >= year_start)
            .scalar()
        ) or 0

        # All-time investment total as fallback
        total_investment = (
            db.query(func.sum(Investment.amount_usd)).scalar()
        ) or 0

        # Latest policy event
        latest_policy = (
            db.query(PolicyEvent)
            .order_by(PolicyEvent.date.desc())
            .first()
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


# --- WebSocket ---


@app.websocket("/ws/grid")
async def grid_websocket(websocket: WebSocket):
    """WebSocket endpoint for streaming live grid data."""
    await websocket.accept()
    ws_clients.add(websocket)
    print(f"[WS] Client connected. Total: {len(ws_clients)}")
    try:
        # Send current data immediately on connect
        await websocket.send_json(latest_grid_data)

        # Keep connection alive, listening for client messages
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                # Client can send "ping" to keep alive
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Send heartbeat
                await websocket.send_json({"type": "heartbeat", "timestamp": datetime.utcnow().isoformat()})
    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.discard(websocket)
        print(f"[WS] Client disconnected. Total: {len(ws_clients)}")


async def ws_broadcast_loop():
    """Broadcast grid data to all connected WebSocket clients every 5 minutes."""
    while True:
        await asyncio.sleep(300)  # 5 minutes
        if ws_clients and latest_grid_data.get("timestamp"):
            dead = set()
            for ws in ws_clients:
                try:
                    await ws.send_json(latest_grid_data)
                except Exception:
                    dead.add(ws)
            ws_clients -= dead
            print(f"[WS] Broadcast to {len(ws_clients)} clients")


# --- Admin endpoints ---


@app.post("/api/admin/refresh/nrc")
async def admin_refresh_nrc():
    """Manually trigger NRC reactor status sync."""
    await sync_nrc_data()
    return {"status": "ok", "message": "NRC sync triggered"}


@app.post("/api/admin/refresh/policy")
async def admin_refresh_policy():
    """Manually trigger policy news sync."""
    await sync_policy_news()
    return {"status": "ok", "message": "Policy news sync triggered"}


@app.post("/api/admin/refresh/investments")
async def admin_refresh_investments():
    """Manually trigger investment news sync."""
    await sync_investment_news()
    return {"status": "ok", "message": "Investment news sync triggered"}


@app.get("/")
async def root():
    return {
        "name": "GridPulse",
        "version": "1.0.0",
        "docs": "/docs",
    }
