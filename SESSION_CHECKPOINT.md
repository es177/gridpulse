# GridPulse - Session Checkpoint
> **Date:** 2026-03-11
> **Status:** Demo-ready — Vercel deployment prepared, all 4 views working, refresh button added

---

## 1. Current Architecture

```
GridPulse/
├── backend/                    # Local dev FastAPI server
│   ├── main.py                 # FastAPI app + WebSocket + lifespan (skip-sync-if-fresh logic)
│   ├── database.py             # SQLAlchemy models (SQLite: gridpulse.db)
│   ├── scheduler.py            # APScheduler: EIA(5m), NRC(30m), Policy(6h), Investment(12h)
│   ├── seed_data.py            # Seed: 86 reactors, 12 enrichment entities, 18 investments, 13 policy events
│   ├── requirements.txt        # fastapi, uvicorn, sqlalchemy, httpx, apscheduler, websockets
│   ├── scrapers/
│   │   ├── eia.py              # EIA Grid Monitor API — deterministic mock with real regional profiles
│   │   ├── nrc.py              # NRC reactor power status — real CSV scraper + deterministic mock
│   │   ├── news.py             # NewsAPI + Claude AI extraction — mock uses real source URLs
│   │   └── rss.py              # RSS feed scraper (5 feeds) — NOT INTEGRATED
│   └── routers/
│       ├── grid.py             # /api/grid/current, /api/grid/history
│       ├── reactors.py         # /api/reactors
│       ├── enrichment.py       # /api/enrichment
│       ├── policy.py           # /api/policy
│       └── investments.py      # /api/investments
│
├── api/                        # Vercel serverless deployment (mirrors backend)
│   ├── index.py                # Main FastAPI app with cron endpoints (endpoints exist, crons disabled)
│   ├── database.py             # Dual-mode: SQLite (local) / Postgres (Vercel via POSTGRES_URL)
│   ├── seed_data.py            # Synced copy of backend seed data
│   ├── requirements.txt        # includes psycopg2-binary for Postgres
│   ├── scrapers/               # Synced: eia.py, nrc.py, news.py (NO rss.py)
│   └── routers/                # Synced: all 5 router files
│
├── frontend/                   # React 18 + Vite 5 + Tailwind 3 + Zustand 4
│   ├── package.json            # react, recharts, react-leaflet, leaflet, zustand
│   ├── src/
│   │   ├── App.jsx             # 4 tabs + RefreshButton component in header
│   │   ├── main.jsx            # Entry point
│   │   ├── index.css           # Tailwind + custom gp-* utility classes
│   │   ├── store/useStore.js   # Zustand store: refreshing/lastRefreshed state + fetch functions
│   │   ├── hooks/useGridWebSocket.js  # WS (local) / REST polling (Vercel) auto-switch
│   │   ├── views/
│   │   │   ├── Dashboard.jsx   # KPI strip + FuelMix + Regional + ReactorTable + PolicyFeed
│   │   │   ├── Timeline.jsx    # Horizontal L-to-R timeline (policy + investments)
│   │   │   ├── MapView.jsx     # Leaflet map (reactors, enrichment, investments)
│   │   │   └── GlobalCompare.jsx  # 10 nuclear powers comparison (IAEA PRIS data)
│   │   └── components/
│   │       ├── KPICard.jsx
│   │       ├── FuelMixChart.jsx     # Recharts donut
│   │       ├── RegionalChart.jsx    # Recharts bar chart
│   │       ├── ReactorTable.jsx     # Sortable/searchable table
│   │       ├── PolicyFeed.jsx       # Activity feed sidebar
│   │       └── EventModal.jsx       # Detail overlay
│
└── vercel.json                 # Build config, API rewrites, function config (crons REMOVED for free tier)
```

---

## 2. What's Working

### All Views ✅
- **Dashboard** — 6 KPI cards, fuel mix donut, regional demand bars, reactor table (86 units), activity feed
- **Timeline** — 31 events (deduped), filterable by category, searchable, expandable cards
- **Map** — 50 sites, 12 facilities, 86 reactor units, color-coded by power output
- **Global** — 10 countries, side-by-side comparison, IAEA PRIS data

### Data Quality ✅
- **EIA mock**: Deterministic, realistic US generation mix (354.7 GW total, ~18.5% nuclear) based on real EIA regional profiles with time-of-day solar/gas variation
- **NRC scraper**: Hits real NRC URL (fixed case-sensitive redirect, added follow_redirects). Deterministic mock fallback with realistic outage patterns (4 units in refueling, 4 at reduced power)
- **Seed data**: 13 policy events (2022-2024) with real source URLs (congress.gov, energy.gov, nrc.gov, company sites). 18 investments including Amazon/X-energy, Holtec/Palisades, CFS, Form Energy, General Matter
- **News mock**: Real source URLs instead of example.com. Smarter extraction that infers company/amount from titles

### Refresh Button ✅
- Spinning SVG icon in header, "REFRESHING" text during fetch
- `refreshing` and `lastRefreshed` state in Zustand store
- Calls `fetchAll()` which hits all 6 API endpoints in parallel

### Vercel Deployment Structure ✅
- `vercel.json` — build command, output dir, API rewrites, function config
- Cron **endpoints** exist in `api/index.py` but cron **schedule removed** from `vercel.json` (free tier)
- `api/` directory fully synced with backend scrapers, seed data, routers
- Frontend builds cleanly (`npm run build` — 762KB bundle)

### Backend Startup Logic ✅
- Skips EIA/NRC sync if data exists within last 5 minutes (prevents duplicate data on hot reloads)

---

## 3. What's Not Done Yet

### Vercel Deployment
- **Not yet deployed** — code is pushed to GitHub but Vercel project not connected
- **Vercel Postgres** needed for production DB (free tier: Neon addon)
- **Env vars** to set: `CRON_SECRET` (optional without crons), `EIA_API_KEY`, `NEWS_API_KEY`, `ANTHROPIC_API_KEY` (all optional — app works with curated data)

### Features Not Built
- **News Tab** — RSS scraper exists (`backend/scrapers/rss.py`) but not integrated
- **RSS cron endpoints** not wired
- **Timeline sort order** — still oldest-first (user previously requested newest-first)
- **Source timestamps** on individual components (only KPI "Last Updated" shows server time)

### To Re-enable Cron Jobs (paid Vercel plan)
Add this block back to `vercel.json`:
```json
"crons": [
  { "path": "/api/cron/eia", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/nrc", "schedule": "*/30 * * * *" },
  { "path": "/api/cron/policy", "schedule": "0 */6 * * *" },
  { "path": "/api/cron/investments", "schedule": "0 */12 * * *" }
]
```

---

## 4. Environment Variables

```env
# Required for live data (optional — app works without them)
EIA_API_KEY=           # https://www.eia.gov/opendata/register.php (free)
NEWS_API_KEY=          # https://newsapi.org/register (free tier)
ANTHROPIC_API_KEY=     # For Claude AI news extraction (paid)

# Vercel-specific
POSTGRES_URL=          # Auto-set by Vercel Postgres addon
CRON_SECRET=           # Only needed if cron jobs re-enabled
```

---

## 5. Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173` with API proxied to `:8000`.

---

## 6. Git Info

- **Remote:** https://github.com/es177/gridpulse.git
- **Branch:** main
- **Latest commits:**
  - `15a49f3` — Remove Vercel cron jobs (free tier incompatible)
  - `174cf50` — 3/11/26
  - `4525022` — feat: GridPulse energy intelligence platform — full stack
