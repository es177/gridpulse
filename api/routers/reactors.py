"""Reactor data API endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import Reactor, ReactorHistory, get_db

router = APIRouter(prefix="/api/reactors", tags=["reactors"])


@router.get("")
async def list_reactors(
    state: Optional[str] = None,
    sort_by: str = "name",
    db: Session = Depends(get_db),
):
    """Get all reactors with current power status."""
    query = db.query(Reactor)
    if state:
        query = query.filter(Reactor.state == state.upper())

    if sort_by == "power":
        query = query.order_by(desc(Reactor.current_pct_power))
    elif sort_by == "capacity":
        query = query.order_by(desc(Reactor.mwt_licensed))
    else:
        query = query.order_by(Reactor.name)

    reactors = query.all()
    return {
        "count": len(reactors),
        "reactors": [
            {
                "id": r.id,
                "name": r.name,
                "unit": r.unit,
                "docket": r.docket,
                "state": r.state,
                "lat": r.lat,
                "lng": r.lng,
                "mwt_licensed": r.mwt_licensed,
                "reactor_type": r.reactor_type,
                "operator": r.operator,
                "license_expires": r.license_expires,
                "current_pct_power": r.current_pct_power,
                "last_updated": r.last_updated.isoformat() if r.last_updated else None,
            }
            for r in reactors
        ],
    }


@router.get("/{reactor_id}/history")
async def reactor_history(
    reactor_id: int,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Get power history for a single reactor."""
    reactor = db.query(Reactor).filter(Reactor.id == reactor_id).first()
    if not reactor:
        raise HTTPException(status_code=404, detail="Reactor not found")

    history = (
        db.query(ReactorHistory)
        .filter(ReactorHistory.reactor_id == reactor_id)
        .order_by(desc(ReactorHistory.timestamp))
        .limit(limit)
        .all()
    )

    return {
        "reactor": {"id": reactor.id, "name": reactor.name},
        "history": [
            {
                "timestamp": h.timestamp.isoformat(),
                "pct_power": h.pct_power,
            }
            for h in reversed(history)
        ],
    }
