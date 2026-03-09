# GridPulse - Session Checkpoint
> **Date:** 2026-03-09
> **Status:** In active development — features partially complete, 3 items stalled mid-implementation

---

## 1. Current Architecture

```
GridPulse/
├── backend/                    # Local dev FastAPI server
│   ├── main.py                 # FastAPI app + WebSocket + lifespan
│   ├── database.py             # SQLAlchemy models (SQLite: gridpulse.db)
│   ├── scheduler.py            # APScheduler: EIA(5m), NRC(30m), Policy(6h), Investment(12h)
│   ├── seed_data.py            # Seed: 94 reactors, 12 enrichment entities (incl. General Matter)
│   ├── requirements.txt        # fastapi, uvicorn, sqlalchemy, httpx, apscheduler, websockets
│   ├── scrapers/
│   │   ├── eia.py              # EIA Grid Monitor API (fuel mix + regional demand)
│   │   ├── nrc.py              # NRC reactor power status scraper
│   │   ├── news.py             # NewsAPI + Claude AI extraction (policy & investment)
│   │   └── rss.py              # *** NEW, NOT INTEGRATED *** RSS feed scraper (5 feeds)
│   └── routers/
│       ├── grid.py             # /api/grid/current, /api/grid/history
│       ├── reactors.py         # /api/reactors
│       ├── enrichment.py       # /api/enrichment
│       ├── policy.py           # /api/policy
│       └── investments.py      # /api/investments
│
├── api/                        # Vercel serverless deployment (mirrors backend)
│   ├── index.py                # Main FastAPI app with cron endpoints
│   ├── database.py             # Dual-mode: SQLite (local) / Postgres (Vercel)
│   ├── seed_data.py            # Copy of backend seed data
│   ├── requirements.txt        # includes psycopg2-binary for Postgres
│   ├── scrapers/               # Copies of eia.py, nrc.py, news.py (NO rss.py yet)
│   └── routers/                # Copies of all router files
│
├── frontend/                   # React 18 + Vite 5 + Tailwind 3 + Zustand 4
│   ├── package.json            # react, recharts, react-leaflet, leaflet, zustand
│   ├── src/
│   │   ├── App.jsx             # 4 tabs: Dashboard, Timeline, Map, Global
│   │   ├── main.jsx            # Entry point
│   │   ├── index.css           # Tailwind + custom gp-* utility classes
│   │   ├── store/useStore.js   # Zustand store: all state + fetch functions
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
└── vercel.json                 # Build config, API rewrites, 4 cron jobs, 1024MB/60s function limit
```

**Tech Stack:**
- **Backend:** Python 3.9+ / FastAPI / SQLAlchemy / APScheduler / httpx
- **Frontend:** React 18 / Vite 5 / Zustand 4 / Recharts / React-Leaflet / Tailwind 3
- **Database:** SQLite (local dev) / Postgres (Vercel production via `POSTGRES_URL` env)
- **Deployment:** Vercel (serverless Python functions + static React build)
- **Theme:** Dark Palantir/Bloomberg aesthetic, red/blue/white color palette

---

## 2. What's Working

### Backend (Local Dev)
- [x] FastAPI server starts with lifespan (init_db + seed + initial EIA/NRC sync)
- [x] EIA Grid Monitor scraper — fetches real-time US fuel generation mix
- [x] NRC reactor power status scraper — updates 94 reactors from daily NRC reports
- [x] NewsAPI + Claude AI extraction for policy events and investments
- [x] APScheduler running 4 jobs on intervals
- [x] WebSocket `/ws/grid` with ping/pong heartbeat and broadcast loop
- [x] Seed data loads 94 reactors, 12 enrichment entities (including General Matter), investments, policy events
- [x] All 5 API routers serving data correctly

### Frontend
- [x] **Dashboard tab** — KPI strip (demand, nuclear share, reactors, investment, last update), FuelMixChart donut, RegionalChart bars, ReactorTable (sortable, searchable), PolicyFeed sidebar, Data Sources footer
- [x] **Timeline tab** — Horizontal L-to-R scrollable timeline, grouped by month, expandable cards with sentiment/source/entities, search + category filters
- [x] **Map tab** — Dark CartoDB basemap, reactor CircleMarkers color-coded by power output, enrichment entity markers, investment markers, layer toggles, legend, stats overlay, source links in popups
- [x] **Global tab** — 10 country cards (US, FR, CN, RU, GB, IN, KR, JP, CA, PK), comparison table for selected countries, sortable by 5 metrics, bar visualizations, capability tags, IAEA PRIS sourcing
- [x] Zustand store fetches all data on mount + 120s refresh cycle
- [x] WebSocket auto-fallback: WS on localhost, REST polling (30s) on production
- [x] Pong handling fix (prevents JSON.parse error on "pong" text)
- [x] Red/blue/white color palette applied across all components
- [x] Source attribution links on most panels (EIA, NRC, NewsAPI, IAEA PRIS)

### Vercel Deployment Structure
- [x] `/api/index.py` — Serverless FastAPI with all routers + cron endpoints + health check
- [x] `/api/database.py` — Dual-mode engine (auto-detects `POSTGRES_URL`)
- [x] `vercel.json` — Build config, rewrites, 4 cron schedules, function config
- [x] CORS allows `*.vercel.app` via regex

---

## 3. What's Broken or Incomplete

### CRITICAL — Stalled Features (User's Last 3 Requests)

#### 3a. News Tab — NOT BUILT
**Status:** RSS scraper written but not integrated anywhere
- `backend/scrapers/rss.py` (lines 1-184) — **EXISTS but orphaned**
  - Fetches from 5 RSS feeds (World Nuclear News, DOE, NRC, Google News x2)
  - Has relevance filtering, deduplication, `_generate_why_matters()`
  - Uses `httpx.AsyncClient` and `xml.etree.ElementTree`
- **Missing pieces:**
  - No backend API endpoint for RSS news (no `/api/news/rss` route)
  - No integration in `backend/scheduler.py` — RSS is not on any cron schedule
  - `rss.py` NOT copied to `/api/scrapers/` — Vercel deployment won't have it
  - No RSS cron endpoint in `/api/index.py`
  - No `vercel.json` cron entry for RSS
  - No frontend `NewsFeed.jsx` view — the tab doesn't exist in `App.jsx`
  - No `fetchNews` function in `store/useStore.js`
  - No `newsItems` state in store
  - Dashboard `PolicyFeed.jsx` doesn't link/expand to a News tab
  - User wanted: own tab + expandable from dashboard + "why this matters" + cross-checked sources

#### 3b. Timeline Order — WRONG DIRECTION
**Status:** One-line fix, not applied yet
- `frontend/src/views/Timeline.jsx`, **line 162:**
  ```js
  // CURRENT (old-to-new — user says hard to read):
  return dedupeByTitle(items).sort((a, b) => new Date(a.date) - new Date(b.date))

  // NEEDED (new-to-old):
  return dedupeByTitle(items).sort((a, b) => new Date(b.date) - new Date(a.date))
  ```
- `frontend/src/views/Timeline.jsx`, **line 36** — `groupByMonth` also sorts ascending:
  ```js
  // CURRENT:
  return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key))

  // NEEDED:
  return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key))
  ```

#### 3c. Source + Timestamp Metadata — PARTIALLY DONE
**Status:** Some components have source links, but none show "data date" or "last updated"
- **Has source links:** FuelMixChart (EIA), RegionalChart (EIA), ReactorTable (NRC), MapView popups, GlobalCompare (IAEA PRIS), PolicyFeed (NewsAPI), EventModal, Dashboard footer, Timeline footer
- **Missing on all components:**
  - When the data was collected (data date)
  - When last refreshed/updated (last sync timestamp)
  - The backend `/api/stats/summary` returns a `timestamp` field but only KPICard "Last Updated" uses it
  - Individual components don't show their own refresh timestamps

### Non-Critical Issues

- **`KPICard.jsx` line 22-24:** Still references `text-emerald-400` for positive trends — should be blue per palette
- **No git repository initialized** — nothing committed yet
- **No `.env.example`** — env vars (`NEWSAPI_KEY`, `ANTHROPIC_API_KEY`, `POSTGRES_URL`, `CRON_SECRET`) not documented
- **No `README.md`** with setup instructions
- **Vercel deployment not tested** — structure exists but never deployed
- **`api/scrapers/` missing `rss.py`** — needs copy from backend

---

## 4. Next Immediate Steps (Priority Order)

### P0 — Quick Wins (< 5 min each)
1. **Reverse Timeline order** — 2-line change in `frontend/src/views/Timeline.jsx` (lines 36 and 162), swap sort directions to newest-first

2. **Fix KPICard trend color** — `frontend/src/components/KPICard.jsx` line 23, change `text-emerald-400` to `text-blue-400`

### P1 — News Tab (biggest feature gap)
3. **Integrate RSS scraper into backend:**
   - Add `backend/routers/news_rss.py` — new router with `GET /api/news/rss`
   - Wire `fetch_rss_feeds()` into `backend/scheduler.py` (every 15 min)
   - Copy `rss.py` to `api/scrapers/rss.py`
   - Add RSS cron endpoint to `api/index.py`
   - Add `{"path": "/api/cron/rss", "schedule": "*/15 * * * *"}` to `vercel.json`

4. **Build `frontend/src/views/NewsFeed.jsx`:**
   - Full-page news feed with expandable cards
   - Each card: title, source name + link, published date, description, "Why This Matters" section
   - Auto-refresh every 60s
   - Search/filter by source and keywords
   - Add `fetchNews` + `newsItems` to `store/useStore.js`
   - Add `{ id: 'news', label: 'News' }` to VIEWS in `App.jsx`

5. **Update Dashboard PolicyFeed** — Add "View All >" button that switches to News tab via `setActiveView('news')`

### P2 — Source Timestamps
6. **Add last-updated metadata to API responses:**
   - Each endpoint should return `data_as_of` and `last_synced_at` fields
   - Frontend components display this as `"Data from: Mar 9, 2026 · Updated: 2 min ago"`

---

## 5. Blocking Issues / Decisions Needed

| Issue | Decision Needed | Impact |
|-------|----------------|--------|
| **NewsAPI key** | Is `NEWSAPI_KEY` set in `.env`? If not, policy/investment scraping silently fails | Medium — existing data is seed-only |
| **Anthropic API key** | Is `ANTHROPIC_API_KEY` set? Claude extraction won't work without it | Medium — news won't be structured |
| **Vercel Postgres** | Need to provision Vercel Postgres and set `POSTGRES_URL` before deploy | Blocker for Vercel deploy |
| **RSS feed reliability** | Google News RSS may block server-side requests; need fallback or proxy | Could limit News tab content |
| **X.com / Twitter** | User requested pulling from X.com — Twitter API requires paid access ($100/mo Basic) | User decision: skip X or budget for API |
| **Data freshness** | Some seed data (investments, policy) is static from initial build — need live API keys to get real updates | Affects credibility of "live" claim |

---

## 6. Key Files to Review Next Session

### Must-touch files (for stalled work):
| File | Why |
|------|-----|
| `frontend/src/views/Timeline.jsx` | Lines 36, 162 — reverse sort order |
| `backend/scrapers/rss.py` | Exists but orphaned — needs integration |
| `frontend/src/store/useStore.js` | Add `newsItems`, `fetchNews` state + function |
| `frontend/src/App.jsx` | Add News tab to VIEWS array |
| `backend/main.py` | Include new news router |
| `api/index.py` | Add RSS cron endpoint |
| `vercel.json` | Add RSS cron schedule |

### Create new:
| File | Purpose |
|------|---------|
| `frontend/src/views/NewsFeed.jsx` | Full News tab view |
| `backend/routers/news_rss.py` | RSS news API endpoint |
| `api/scrapers/rss.py` | Copy of backend RSS scraper for Vercel |
| `.env.example` | Document required environment variables |

### Reference files (read, don't change):
| File | Why |
|------|-----|
| `backend/scheduler.py` | Understand existing cron pattern to add RSS job |
| `frontend/src/components/PolicyFeed.jsx` | Model for News tab compact view |
| `frontend/src/components/EventModal.jsx` | Model for expanded news card design |
| `backend/database.py` | Check if NewsRaw model needs update for RSS data |

---

## 7. Git Commit Suggestions

**No git repo exists yet.** Initialize and commit in stages:

### Commit 1 — Initial full project
```
git init
git add -A
git commit -m "feat: GridPulse energy intelligence platform

Full-stack app with FastAPI backend and React frontend.
- Dashboard with real-time EIA grid data and NRC reactor status
- Interactive map with reactor sites, enrichment facilities, investments
- Horizontal timeline for policy events and investment deals
- Global nuclear comparison tab (10 countries, IAEA PRIS data)
- Vercel serverless deployment structure with cron jobs
- Palantir-style dark theme with red/blue/white palette

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### Commit 2 — After fixing Timeline + stalled items
```
git commit -m "fix: reverse timeline to newest-first, integrate RSS news feed

- Timeline now displays events from newest to oldest
- RSS scraper integrated with 5 nuclear/energy news feeds
- New News tab with 'why this matters' analysis and source links
- Dashboard activity feed links to expanded News view
- Source timestamps added to all data components

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 8. Environment Variables Required

```env
# .env (backend)
NEWSAPI_KEY=           # https://newsapi.org/ — free tier: 100 req/day
ANTHROPIC_API_KEY=     # For Claude AI news extraction
EIA_API_KEY=           # Optional — EIA Grid Monitor works without key

# Vercel Environment (set in dashboard)
POSTGRES_URL=          # Vercel Postgres connection string
CRON_SECRET=           # Shared secret for cron endpoint auth
NEWSAPI_KEY=           # Same as above
ANTHROPIC_API_KEY=     # Same as above
```

---

## 9. Quick Start (for next session)

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
