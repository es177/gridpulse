"""Enrichment and advanced nuclear entity endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import EnrichmentEntity, get_db

router = APIRouter(prefix="/api/enrichment", tags=["enrichment"])


@router.get("")
async def list_entities(
    entity_type: Optional[str] = None,
    stage: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get all enrichment/advanced nuclear entities."""
    query = db.query(EnrichmentEntity)
    if entity_type:
        query = query.filter(EnrichmentEntity.type == entity_type)
    if stage:
        query = query.filter(EnrichmentEntity.stage == stage)

    entities = query.order_by(EnrichmentEntity.name).all()
    return {
        "count": len(entities),
        "entities": [
            {
                "id": e.id,
                "name": e.name,
                "type": e.type,
                "stage": e.stage,
                "lat": e.lat,
                "lng": e.lng,
                "description": e.description,
                "doe_funding_usd": e.doe_funding_usd,
                "nrc_docket": e.nrc_docket,
                "website": e.website,
            }
            for e in entities
        ],
    }
