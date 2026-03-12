# GridPulse - Session Checkpoint
> **Date:** 2026-03-12
> **Status:** Demo-ready for General Matter — data overhaul complete, dedicated Policy page built, all source URLs fact-checked
> **Last commit:** `3fcc9e1` — feat: data overhaul + dedicated policy tracker page

---

## 1. Current Architecture

```
GridPulse/
├── backend/                    # Local dev FastAPI server
│   ├── main.py                 # FastAPI app + WebSocket + lifespan (skip-sync-if-fresh logic)
│   ├── database.py             # SQLAlchemy models (SQLite: gridpulse.db)
│   │                           #   EnrichmentEntity: +source_url
│   │                           #   Investment: +source_url, +lat, +lng
│   ├── scheduler.py            # APScheduler: EIA(5m), NRC(30m), Policy(6h), Investment(12h)
│   ├── seed_data.py            # Seed: 86 reactors, 11 enrichment entities, 20 investments, 23 policy events
│   ├── requirements.txt        # fastapi, uvicorn, sqlalchemy, httpx, apscheduler, websockets
│   ├── scrapers/
│   │   ├── eia.py              # EIA Grid Monitor API — deterministic mock with real regional profiles
│   │   ├── nrc.py              # NRC reactor power status — real CSV scraper + deterministic mock
│   │   ├── news.py             # NewsAPI + Claude AI extraction — mock uses real source URLs
│   │   └── rss.py              # RSS feed scraper (5 feeds) — NOT INTEGRATED
│   └── routers/
│       ├── grid.py             # /api/grid/current, /api/grid/history
│       ├── reactors.py         # /api/reactors
│       ├── enrichment.py       # /api/enrichment (returns source_url)
│       ├── policy.py           # /api/policy
│       └── investments.py      # /api/investments (returns source_url, lat, lng)
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
│   │   ├── App.jsx             # 5 tabs (Dashboard, Timeline, Policy, Map, Global) + RefreshButton
│   │   ├── main.jsx            # Entry point
│   │   ├── index.css           # Tailwind + custom gp-* utility classes
│   │   ├── store/useStore.js   # Zustand store: refreshing/lastRefreshed state + fetch functions
│   │   ├── hooks/useGridWebSocket.js  # WS (local) / REST polling (Vercel) auto-switch
│   │   ├── views/
│   │   │   ├── Dashboard.jsx   # KPI strip (Latest Policy clickable→Policy view) + charts + table + feed
│   │   │   ├── Timeline.jsx    # Horizontal timeline, newest-first sort, expandable cards
│   │   │   ├── PolicyView.jsx  # ★ NEW — Nuclear Policy Tracker with category grouping & enrichment filter
│   │   │   ├── MapView.jsx     # Leaflet map (reactors, enrichment, investments with direct coords)
│   │   │   └── GlobalCompare.jsx  # 10 nuclear powers comparison (IAEA PRIS data)
│   │   └── components/
│   │       ├── KPICard.jsx
│   │       ├── FuelMixChart.jsx     # Recharts donut
│   │       ├── RegionalChart.jsx    # Recharts bar chart
│   │       ├── ReactorTable.jsx     # Sortable/searchable table
│   │       ├── PolicyFeed.jsx       # Activity feed sidebar (no item limit, enrichment badge)
│   │       └── EventModal.jsx       # Detail overlay
│
└── vercel.json                 # Build config, API rewrites, function config (crons REMOVED for free tier)
```

---

## 2. What Was Done in This Session (3/12/26)

### Data Overhaul (Revision Prompt)
The app was being demoed to **General Matter** (HALEU enrichment startup). The previous seed data had critical errors and thin coverage.

**What was fixed:**
- **General Matter**: Changed from "fusion/Palo Alto" → "enrichment/Paducah KY". Updated: type, stage, lat/lng, description ($1.5B facility, $900M DOE contract, 140 jobs, 2034 operations), source_url (paducahky.gov)
- **Schema additions**: `source_url` on EnrichmentEntity and Investment models. `lat`/`lng` on Investment model (was silently dropping ~60% of map markers due to name-matching)
- **Removed** duplicate American Centrifuge Plant entity (same as Centrus Energy)
- **All 11 enrichment entities** now have verified source_url
- **All 20 investments** now have source_url + direct lat/lng coordinates
- **All 23 policy events** now have verified source_url

**Events added for 2025-2026 density:**
- DOE $2.7B enrichment awards (Jan 5, 2026) — energy.gov ✅
- TerraPower NRC construction permit (Mar 4, 2026) — ans.org ✅
- General Matter Paducah DOE lease (Aug 2025) — paducahky.gov ✅
- Kairos Power Hermes construction start (May 2025)
- Executive Orders to quadruple nuclear (May 2025)
- NRC TerraPower safety review complete (Dec 2025) — ans.org ✅
- Constellation Clinton/Dresden license renewals (Dec 2025)
- Last Energy $100M Series C investment (Dec 2025)

**URL fact-checking**: Every critical URL was fetched and verified to load correctly.

### New Policy Page
- **`PolicyView.jsx`** — Full Nuclear Policy Tracker page
  - "Enrichment & Fuel Cycle — Most Relevant" section pinned to top (4 events)
  - Filter chips: All, Enrichment & Fuel Cycle, Funding & Awards, Legislation, Licensing & Regulatory, Executive Orders
  - Keyword search across titles, summaries, entities
  - Expandable cards with full summary, entity tags, sentiment, VIEW SOURCE button
  - Enrichment keyword detection: haleu, leu, enrichment, uranium, centrifuge, centrus, urenco, orano, general matter, fuel cycle, etc.

### Frontend Fixes
- **Map**: Investment markers use direct `inv.lat`/`inv.lng` (fallback to entity lookup). All 20 investments now render.
- **Timeline**: Reversed sort to newest-first (both items and month groups)
- **Activity Feed**: Removed 40-item slice (renders all with scroll), added enrichment badge type
- **Dashboard**: "Latest Policy" KPI card is now clickable → navigates to Policy view. Fixed undefined display bug.
- **Nav**: Added "POLICY" tab between Timeline and Map

### Sync
- `backend/seed_data.py` synced to `api/seed_data.py`
- `backend/database.py` changes mirrored in `api/database.py`
- Router changes mirrored in `api/routers/`

---

## 3. Current Data State

| Data Type | Count | Has source_url | Has coords |
|-----------|-------|----------------|------------|
| Enrichment Entities | 11 | ✅ All | ✅ All (entity lat/lng) |
| Investments | 20 | ✅ All | ✅ All (direct lat/lng) |
| Policy Events | 23 | ✅ All | N/A |
| Reactors (NRC seed) | 86 | N/A | ✅ All |
| **Total timeline items** | **43** | | |

**Year density:** 2022: 1, 2023: 7, 2024: 24, 2025: 9, 2026: 2

**General Matter data (critical — this is the demo audience):**
- Entity: type=enrichment, stage=construction, Paducah KY (37.0834, -88.6), $900M DOE funding
- Investment: $70M Series A, enrichment technology, Founders Fund / Lowercarbon / YC
- Policy events mentioning GM: DOE $2.7B (entity), GM Paducah lease (dedicated event)
- Source URLs: paducahky.gov (verified ✅), energy.gov (verified ✅)

---

## 4. What's Working

### All 5 Views ✅
- **Dashboard** — 6 KPI cards (Latest Policy clickable), fuel mix donut, regional bars, reactor table, activity feed
- **Timeline** — 43 events (deduped), newest-first, filterable, searchable, expandable with source links
- **Policy** — 23 policy events grouped by category, enrichment-relevant section at top, filter chips, search, expandable cards with VIEW SOURCE
- **Map** — 50 reactor sites, 11 enrichment facilities, 20 investment markers (all with coords), color-coded, source links in popups
- **Global** — 10 countries comparison, IAEA PRIS data

### Build ✅
- `npm run build` passes (897 modules, 771KB bundle, 1.8s)
- No console errors when backend is running

---

## 5. What's Not Done Yet / Next Steps

### Priority for Demo
- [ ] **Deploy to Vercel** — code is pushed to GitHub but Vercel project not yet connected
- [ ] **Vercel Postgres** — needed for production DB (free tier: Neon addon)
- [ ] **Env vars** to set on Vercel: `POSTGRES_URL` (auto-set by addon). Optional: `EIA_API_KEY`, `NEWS_API_KEY`, `ANTHROPIC_API_KEY`

### Nice-to-Have Improvements
- [ ] **News Tab** — RSS scraper exists (`backend/scrapers/rss.py`) but not integrated into a view
- [ ] **Source timestamps** on individual components (only KPI "Last Updated" shows server time)
- [ ] **Mobile responsiveness** — works but could be polished for mobile demo
- [ ] **Loading states** — some views flash before data arrives
- [ ] **PolicyView: link in collapsed card** — the source_url link in collapsed cards could be more prominent
- [ ] **Global Compare** — uses hardcoded IAEA data, could be more interactive

### To Re-enable Cron Jobs (paid Vercel plan)
Add back to `vercel.json`:
```json
"crons": [
  { "path": "/api/cron/eia", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/nrc", "schedule": "*/30 * * * *" },
  { "path": "/api/cron/policy", "schedule": "0 */6 * * *" },
  { "path": "/api/cron/investments", "schedule": "0 */12 * * *" }
]
```

---

## 6. Key Technical Details

### Dual Codebase Sync
`backend/` and `api/` must stay in sync. After any change to these files, copy to `api/`:
- `database.py`, `seed_data.py`, `routers/enrichment.py`, `routers/investments.py`

### Investment Map Markers
Investments now have direct `lat`/`lng` fields. The MapView uses them first, falls back to enrichment entity coord lookup by company name. This fixed the ~60% marker dropout bug.

### Enrichment-Relevant Detection (PolicyView)
Keywords that tag a policy as enrichment-relevant:
```
enrichment, haleu, leu, fuel cycle, uranium, centrifuge, centrus, urenco,
orano, general matter, gaseous diffusion, gle, silex, fuel supply
```

### Seed Function
On DB cold start (missing tables or empty), `seed()` in `seed_data.py` populates everything. Called from `main.py` lifespan. To re-seed locally: delete `gridpulse.db`, restart backend.

---

## 7. Environment Variables

```env
# Required for live data (optional — app works without them using mocks/seed)
EIA_API_KEY=           # https://www.eia.gov/opendata/register.php (free)
NEWS_API_KEY=          # https://newsapi.org/register (free tier)
ANTHROPIC_API_KEY=     # For Claude AI news extraction (paid)

# Vercel-specific
POSTGRES_URL=          # Auto-set by Vercel Postgres addon
CRON_SECRET=           # Only needed if cron jobs re-enabled
```

---

## 8. Quick Start

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

## 9. Git Info

- **Remote:** https://github.com/es177/gridpulse.git
- **Branch:** main
- **Latest commits:**
  - `3fcc9e1` — feat: data overhaul + dedicated policy tracker page
  - `f373df3` — Update session checkpoint for 3/11/26
  - `15a49f3` — Remove Vercel cron jobs (free tier incompatible)
  - `174cf50` — 3/11/26
  - `4525022` — feat: GridPulse energy intelligence platform — full stack
