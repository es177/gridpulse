"""Database models and initialization for GridPulse (Vercel-compatible)."""

import json
import os
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from sqlalchemy.pool import NullPool


def _get_engine():
    """Create engine based on environment."""
    pg_url = os.getenv("POSTGRES_URL") or os.getenv("POSTGRES_URL_NON_POOLING")
    if pg_url:
        # Vercel Postgres — fix protocol if needed
        if pg_url.startswith("postgres://"):
            pg_url = pg_url.replace("postgres://", "postgresql://", 1)
        return create_engine(pg_url, poolclass=NullPool, connect_args={"connect_timeout": 10})
    # Local SQLite fallback
    return create_engine(
        "sqlite:///./gridpulse.db",
        connect_args={"check_same_thread": False},
    )


engine = _get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Models ---


class GridSnapshot(Base):
    __tablename__ = "grid_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    region = Column(String(32), index=True)
    fuel_type = Column(String(32), index=True)
    value_mw = Column(Float)
    respondent = Column(String(64))


class Reactor(Base):
    __tablename__ = "reactors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128))
    unit = Column(String(32))
    docket = Column(String(32))
    state = Column(String(4))
    lat = Column(Float)
    lng = Column(Float)
    mwt_licensed = Column(Float)
    reactor_type = Column(String(32))
    operator = Column(String(128))
    license_expires = Column(String(16))
    current_pct_power = Column(Float, default=0)
    last_updated = Column(DateTime, default=datetime.utcnow)

    history = relationship("ReactorHistory", back_populates="reactor")


class ReactorHistory(Base):
    __tablename__ = "reactor_history"

    id = Column(Integer, primary_key=True, index=True)
    reactor_id = Column(Integer, ForeignKey("reactors.id"), index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    pct_power = Column(Float)

    reactor = relationship("Reactor", back_populates="history")


class EnrichmentEntity(Base):
    __tablename__ = "enrichment_entities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), unique=True)
    type = Column(String(32))
    stage = Column(String(32))
    lat = Column(Float)
    lng = Column(Float)
    description = Column(Text)
    doe_funding_usd = Column(Float, default=0)
    nrc_docket = Column(String(32))
    website = Column(String(256))


class PolicyEvent(Base):
    __tablename__ = "policy_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(512))
    date = Column(DateTime, index=True)
    source_url = Column(String(512))
    event_type = Column(String(32))
    entities_json = Column(Text, default="[]")
    dollar_amount = Column(Float, nullable=True)
    sentiment = Column(String(16))
    summary = Column(Text)

    @property
    def entities(self):
        return json.loads(self.entities_json) if self.entities_json else []


class Investment(Base):
    __tablename__ = "investments"

    id = Column(Integer, primary_key=True, index=True)
    company = Column(String(128))
    date = Column(DateTime, index=True)
    amount_usd = Column(Float, nullable=True)
    round_type = Column(String(32))
    investors_json = Column(Text, default="[]")
    technology_type = Column(String(32))
    summary = Column(Text)

    @property
    def investors(self):
        return json.loads(self.investors_json) if self.investors_json else []


class NewsRaw(Base):
    __tablename__ = "news_raw"

    id = Column(Integer, primary_key=True, index=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)
    query = Column(String(128))
    title = Column(String(512))
    url = Column(String(512), unique=True)
    published_at = Column(DateTime, nullable=True)
    content = Column(Text, nullable=True)
    processed = Column(Boolean, default=False)


def init_db():
    Base.metadata.create_all(bind=engine)
