"""Policy events API endpoints."""

import json
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import PolicyEvent, get_db

router = APIRouter(prefix="/api/policy", tags=["policy"])


@router.get("")
async def list_policy_events(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    event_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get paginated policy events."""
    query = db.query(PolicyEvent)
    if event_type:
        query = query.filter(PolicyEvent.event_type == event_type)

    total = query.count()
    events = (
        query.order_by(desc(PolicyEvent.date))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "events": [
            {
                "id": e.id,
                "title": e.title,
                "date": e.date.isoformat() if e.date else None,
                "source_url": e.source_url,
                "event_type": e.event_type,
                "entities": json.loads(e.entities_json) if e.entities_json else [],
                "dollar_amount": e.dollar_amount,
                "sentiment": e.sentiment,
                "summary": e.summary,
            }
            for e in events
        ],
    }
