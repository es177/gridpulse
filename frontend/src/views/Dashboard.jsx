import { useState } from 'react'
import useStore from '../store/useStore'
import FuelMixChart from '../components/FuelMixChart'
import RegionalChart from '../components/RegionalChart'
import ReactorTable from '../components/ReactorTable'
import PolicyFeed from '../components/PolicyFeed'

function formatUSD(n) {
  if (!n) return '$0'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${n.toLocaleString()}`
}

/* ── Expandable KPI Card ─────────────────────────────── */
function KPICardExpand({ icon, label, value, unit, color = 'text-gray-100', sublabel, detail, onClick }) {
  const [open, setOpen] = useState(false)
  const isLoading = value === null || value === undefined

  const handleClick = () => {
    if (onClick) { onClick(); return }
    if (detail) setOpen(!open)
  }

  return (
    <div className="relative">
      <div
        onClick={handleClick}
        className={`gp-panel px-4 py-3 min-w-0 transition-all duration-200
          ${detail || onClick ? 'cursor-pointer hover:border-blue-500/30' : ''}
          ${open ? 'border-blue-500/30 bg-blue-500/[0.02] rounded-b-none' : 'hover:border-[#2a2a4a]'}`}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {icon && <span className="text-[11px] opacity-40">{icon}</span>}
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 truncate">{label}</span>
          {detail && (
            <span className={`ml-auto text-[9px] font-mono transition-colors ${open ? 'text-blue-400' : 'text-gray-700'}`}>
              {open ? '▾' : 'ⓘ'}
            </span>
          )}
        </div>
        {isLoading ? (
          <div className="h-7 w-20 gp-skeleton mt-1" />
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className={`font-mono text-[22px] font-bold tabular-nums leading-none ${color}`}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
            {unit && <span className="text-[10px] font-mono text-gray-600">{unit}</span>}
          </div>
        )}
        {sublabel && (
          <div className="text-[10px] text-gray-600 mt-0.5 font-mono truncate">{sublabel}</div>
        )}
      </div>

      {/* Expandable detail panel */}
      {open && detail && (
        <div className="absolute left-0 right-0 top-full z-50 gp-panel rounded-t-none border-t-0 border-blue-500/30 bg-[#0a0a14] px-4 py-3 shadow-2xl animate-[fadeIn_150ms_ease-out]"
          style={{ minWidth: '280px' }}>
          {/* Source */}
          <div className="mb-2">
            <div className="text-[9px] uppercase tracking-wider text-gray-600 mb-0.5">Source</div>
            {detail.sourceUrl ? (
              <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-blue-400 hover:text-blue-300 font-mono">
                {detail.source} ↗
              </a>
            ) : (
              <span className="text-[11px] text-gray-300 font-mono">{detail.source}</span>
            )}
          </div>

          {/* Methodology */}
          <div className="mb-2">
            <div className="text-[9px] uppercase tracking-wider text-gray-600 mb-0.5">Methodology</div>
            <p className="text-[11px] text-gray-400 leading-relaxed">{detail.methodology}</p>
          </div>

          {/* Accuracy / Update frequency */}
          <div className="flex items-center gap-4">
            {detail.refresh && (
              <div>
                <div className="text-[9px] uppercase tracking-wider text-gray-600 mb-0.5">Refresh</div>
                <span className="text-[10px] text-gray-400 font-mono">{detail.refresh}</span>
              </div>
            )}
            {detail.accuracy && (
              <div>
                <div className="text-[9px] uppercase tracking-wider text-gray-600 mb-0.5">Accuracy</div>
                <span className="text-[10px] text-gray-400 font-mono">{detail.accuracy}</span>
              </div>
            )}
            {detail.coverage && (
              <div>
                <div className="text-[9px] uppercase tracking-wider text-gray-600 mb-0.5">Coverage</div>
                <span className="text-[10px] text-gray-400 font-mono">{detail.coverage}</span>
              </div>
            )}
          </div>

          {/* Extra notes */}
          {detail.note && (
            <div className="mt-2 pt-2 border-t border-white/[0.04] text-[10px] text-gray-500 leading-relaxed">
              {detail.note}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── KPI detail configs ──────────────────────────────── */
const KPI_DETAILS = {
  gridDemand: {
    source: 'EIA Hourly Electric Grid Monitor (Form EIA-930)',
    sourceUrl: 'https://www.eia.gov/electricity/gridmonitor/',
    methodology: 'Hourly demand for the contiguous US (US48), reported directly by balancing authorities to EIA via Form EIA-930. Aggregated across all Lower 48 balancing authorities. Updated hourly with a ~1-hour lag. Measured in megawatts, displayed in GW.',
    refresh: 'Hourly (~1-hour lag)',
    accuracy: 'Official EIA data',
    coverage: 'All Lower 48 balancing authorities (US48 aggregate)',
    note: 'Demand fluctuates with time of day — peaks ~4-7 PM ET. When no EIA API key is configured, mock data calibrated to 2024-2025 EIA historical averages is used.',
  },
  nuclearShare: {
    source: 'EIA Hourly Electric Grid Monitor (Form EIA-930)',
    sourceUrl: 'https://www.eia.gov/electricity/gridmonitor/',
    methodology: 'Nuclear generation MW divided by total generation MW across all reporting regions. Expressed as percentage of total grid output.',
    refresh: 'Every 5 min',
    accuracy: 'Official EIA data',
    coverage: '93 US commercial reactor units',
    note: 'The US nuclear fleet of 93 units at 54 plants provides ~18-19% of electricity (EIA 2023: 18.6%). This is baseload power — reactors run continuously except during refueling outages (typically every 18-24 months). Seed data tracks 86 of 93 units.',
  },
  reactors: {
    source: 'NRC Power Reactor Status Report',
    sourceUrl: 'https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/index.html',
    methodology: 'Count of NRC-licensed commercial reactors reporting >90% power output. Total reflects units in seeded database. Status from NRC daily pipe-delimited report.',
    refresh: 'Daily (NRC)',
    accuracy: 'Official NRC data',
    coverage: '86 of 93 US units tracked',
    note: 'Reactors below 90% are typically in scheduled refueling, coast-down, or responding to grid conditions. A few units may be offline for maintenance. When the NRC feed is unavailable, realistic mock status is used.',
  },
  investment: {
    source: 'Curated dataset + NewsAPI extraction',
    sourceUrl: 'https://newsapi.org/',
    methodology: 'Sum of all tracked clean energy investments including venture rounds, DOE loan guarantees, and SPAC mergers. Curated from public announcements and verified against primary sources.',
    refresh: 'Manual curation + 12hr news sync',
    accuracy: 'Verified sources',
    coverage: '2022-2026 (20 deals)',
    note: 'Includes private VC (X-energy $1.2B, Kairos $500M, CFS $1.8B, Oklo $307M), DOE loans (Holtec Palisades $1.52B), and fusion (Helion $500M, TAE $250M). DOE enrichment contracts tracked separately under Policy. All amounts from public announcements.',
  },
  lastUpdated: {
    source: 'Server UTC clock',
    methodology: 'Timestamp of the most recent API response from the backend. Data is seeded on startup using EIA and NRC mock profiles calibrated to 2024-2025 historical averages when API keys are not configured.',
    refresh: 'Every 2 min (polling)',
    accuracy: 'Server time',
    note: 'Frontend polls all API endpoints every 2 minutes. The Refresh button triggers an immediate re-fetch of all data.',
  },
}

const DATA_SOURCES = [
  { name: 'EIA Grid Monitor', url: 'https://www.eia.gov/electricity/gridmonitor/', desc: 'Real-time fuel mix & regional demand', refresh: '5 min' },
  { name: 'NRC Reactor Status', url: 'https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/', desc: 'Daily reactor power output', refresh: '30 min' },
  { name: 'NewsAPI', url: 'https://newsapi.org/', desc: 'Policy & investment news articles', refresh: '6 hr' },
  { name: 'Claude AI', url: 'https://anthropic.com/', desc: 'Structured extraction from news', refresh: 'On ingest' },
  { name: 'Curated Dataset', url: null, desc: 'Enrichment entities, reactor fleet, seed investments', refresh: 'Manual' },
]

export default function Dashboard() {
  const summary = useStore((s) => s.summary)
  const setActiveView = useStore((s) => s.setActiveView)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* KPI Strip */}
      <div className="flex-none px-3 pt-3 pb-2">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <KPICardExpand
            icon="⚡" label="US Grid Demand"
            value={summary?.total_demand_gw} unit="GW"
            color="text-gray-100"
            sublabel="Real-time · EIA"
            detail={KPI_DETAILS.gridDemand}
          />
          <KPICardExpand
            icon="☢" label="Nuclear Share"
            value={summary?.nuclear_pct} unit="%"
            color="text-blue-400"
            sublabel={summary?.nuclear_mw ? `${(summary.nuclear_mw / 1000).toFixed(1)} GW · EIA` : '—'}
            detail={KPI_DETAILS.nuclearShare}
          />
          <KPICardExpand
            icon="●" label="Reactors >90%"
            value={summary?.reactors_above_90}
            unit={summary?.total_reactors ? `/ ${summary.total_reactors}` : ''}
            color="text-blue-300"
            sublabel="NRC daily report"
            detail={KPI_DETAILS.reactors}
          />
          <KPICardExpand
            icon="$" label="Total Investment"
            value={summary?.total_investment_usd ? formatUSD(summary.total_investment_usd) : null}
            color="text-blue-400"
            sublabel="Curated + NewsAPI"
            detail={KPI_DETAILS.investment}
          />
          <KPICardExpand
            icon="◆" label="Latest Policy"
            value={summary?.latest_policy?.title ? summary.latest_policy.title.slice(0, 28) + (summary.latest_policy.title.length > 28 ? '...' : '') : null}
            color="text-gray-200"
            sublabel="View all policies →"
            onClick={() => setActiveView('timeline')}
          />
          <KPICardExpand
            icon="◷" label="Last Updated"
            value={summary?.timestamp ? new Date(summary.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null}
            color="text-gray-400"
            sublabel="UTC server time"
            detail={KPI_DETAILS.lastUpdated}
          />
        </div>
      </div>

      {/* Main grid */}
      <div className="flex-1 min-h-0 px-3 pb-1 grid grid-cols-12 gap-2">
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-2 min-h-0 overflow-auto">
          <FuelMixChart />
          <RegionalChart />
        </div>
        <div className="col-span-12 lg:col-span-6 min-h-0">
          <ReactorTable />
        </div>
        <div className="col-span-12 lg:col-span-3 min-h-0">
          <PolicyFeed />
        </div>
      </div>

      {/* Data sources footer */}
      <div className="flex-none px-3 pb-2">
        <div className="gp-panel px-4 py-2 flex items-center gap-6 overflow-x-auto">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 shrink-0">Data Sources</span>
          {DATA_SOURCES.map((src) => (
            <div key={src.name} className="flex items-center gap-2 shrink-0">
              {src.url ? (
                <a href={src.url} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-mono text-blue-400/70 hover:text-blue-400 transition-colors">
                  {src.name} ↗
                </a>
              ) : (
                <span className="text-[10px] font-mono text-gray-500">{src.name}</span>
              )}
              <span className="text-[9px] text-gray-600 font-mono">({src.refresh})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
