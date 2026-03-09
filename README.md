# GridPulse — Energy Intelligence Platform

Real-time US energy grid monitoring, nuclear fleet tracking, clean energy policy analysis, and startup investment intelligence.

## Quick Start

### 1. API Keys

Copy `.env.example` to `backend/.env` and add your keys:

```bash
cp .env.example backend/.env
```

| Key | Source | Required |
|-----|--------|----------|
| `EIA_API_KEY` | [EIA Open Data](https://www.eia.gov/opendata/register.php) | Optional (mock data available) |
| `NEWS_API_KEY` | [NewsAPI](https://newsapi.org/register) | Optional |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/) | Optional |

> The platform works without API keys using realistic mock data for development.

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
python seed_data.py          # Run once to populate database
uvicorn main:app --reload    # Starts on http://localhost:8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                  # Starts on http://localhost:5173
```

## Architecture

- **Backend**: FastAPI + SQLAlchemy + APScheduler + WebSocket
- **Frontend**: Vite + React 18 + TailwindCSS + Recharts + React-Leaflet + Zustand
- **Database**: SQLite (dev) / PostgreSQL-ready

## Data Sources

| Source | Refresh | Data |
|--------|---------|------|
| EIA API | 5 min | Real-time grid demand & fuel mix by region |
| NRC | 30 min | Reactor power status for all US nuclear units |
| NewsAPI + Claude | 6 hr / 12 hr | Policy events & investment tracking |
| Seed data | Once | Enrichment entities, known investments, reactor fleet |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/grid/current` | Latest fuel mix by region |
| `GET /api/grid/history?hours=24` | Time-series grid data |
| `GET /api/reactors` | All reactors with current power % |
| `GET /api/reactors/{id}/history` | Power history for single reactor |
| `GET /api/enrichment` | Advanced nuclear entities |
| `GET /api/policy?limit=50` | Policy events |
| `GET /api/investments?limit=50` | Investment events |
| `GET /api/stats/summary` | Dashboard KPIs |
| `WS /ws/grid` | Live grid data stream |

## License

MIT
