"""Grid data API endpoints."""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from database import GridSnapshot, get_db

router = APIRouter(prefix="/api/grid", tags=["grid"])


@router.get("/current")
async def get_current_grid(db: Session = Depends(get_db)):
    """Get latest fuel mix snapshot grouped by region and fuel type."""
    # Get the most recent timestamp
    latest = db.query(func.max(GridSnapshot.timestamp)).scalar()
    if not latest:
        return {"data": [], "timestamp": None}

    cutoff = latest - timedelta(minutes=30)
    snapshots = (
        db.query(GridSnapshot)
        .filter(GridSnapshot.timestamp >= cutoff)
        .order_by(desc(GridSnapshot.timestamp))
        .all()
    )

    # Group by region
    by_region = {}
    for s in snapshots:
        key = s.region
        if key not in by_region:
            by_region[key] = {"region": key, "respondent": s.respondent, "fuels": {}}
        if s.fuel_type not in by_region[key]["fuels"]:
            by_region[key]["fuels"][s.fuel_type] = s.value_mw

    # Also compute national totals by fuel type
    national = {}
    for s in snapshots:
        if s.fuel_type not in national:
            national[s.fuel_type] = 0
        national[s.fuel_type] += s.value_mw

    return {
        "timestamp": latest.isoformat() if latest else None,
        "regions": list(by_region.values()),
        "national_fuel_mix": national,
    }


@router.get("/history")
async def get_grid_history(
    hours: int = Query(24, ge=1, le=168),
    region: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get time-series grid data for charts."""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    query = db.query(GridSnapshot).filter(GridSnapshot.timestamp >= cutoff)

    if region:
        query = query.filter(GridSnapshot.region == region)

    snapshots = query.order_by(GridSnapshot.timestamp).all()

    # Group by timestamp
    series = {}
    for s in snapshots:
        ts = s.timestamp.isoformat()
        if ts not in series:
            series[ts] = {"timestamp": ts}
        key = f"{s.region}_{s.fuel_type}" if region else s.fuel_type
        if key not in series[ts]:
            series[ts][key] = 0
        series[ts][key] += s.value_mw

    return {"data": list(series.values()), "hours": hours}
