"""Investment tracker API endpoints."""

import json
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import Investment, get_db

router = APIRouter(prefix="/api/investments", tags=["investments"])


@router.get("")
async def list_investments(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    technology_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get paginated investment events."""
    query = db.query(Investment)
    if technology_type:
        query = query.filter(Investment.technology_type == technology_type)

    total = query.count()
    investments = (
        query.order_by(desc(Investment.date))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "investments": [
            {
                "id": inv.id,
                "company": inv.company,
                "date": inv.date.isoformat() if inv.date else None,
                "amount_usd": inv.amount_usd,
                "round_type": inv.round_type,
                "investors": json.loads(inv.investors_json) if inv.investors_json else [],
                "technology_type": inv.technology_type,
                "summary": inv.summary,
            }
            for inv in investments
        ],
    }
