import useStore from '../store/useStore'
import KPICard from '../components/KPICard'
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

const DATA_SOURCES = [
  { name: 'EIA Grid Monitor', url: 'https://www.eia.gov/electricity/gridmonitor/', desc: 'Real-time fuel mix & regional demand', refresh: '5 min' },
  { name: 'NRC Reactor Status', url: 'https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/index.html', desc: 'Daily reactor power output', refresh: '30 min' },
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
          <KPICard icon="⚡" label="US Grid Demand" value={summary?.total_demand_gw} unit="GW" color="text-gray-100" sublabel="Real-time · EIA" />
          <KPICard icon="☢" label="Nuclear Share" value={summary?.nuclear_pct} unit="%" color="text-blue-400"
            sublabel={summary?.nuclear_mw ? `${(summary.nuclear_mw / 1000).toFixed(1)} GW · EIA` : '—'} />
          <KPICard icon="●" label="Reactors >90%" value={summary?.reactors_above_90}
            unit={summary?.total_reactors ? `/ ${summary.total_reactors}` : ''} color="text-blue-300" sublabel="NRC daily report" />
          <KPICard icon="$" label="Total Investment" value={summary?.total_investment_usd ? formatUSD(summary.total_investment_usd) : null}
            color="text-blue-400" sublabel="Curated + NewsAPI" />
          <button onClick={() => setActiveView('policy')} className="text-left cursor-pointer group/kpi">
            <KPICard icon="◆" label="Latest Policy"
              value={summary?.latest_policy?.title ? summary.latest_policy.title.slice(0, 28) + (summary.latest_policy.title.length > 28 ? '...' : '') : null}
              color="text-gray-200" sublabel="View all policies →" />
          </button>
          <KPICard icon="◷" label="Last Updated"
            value={summary?.timestamp ? new Date(summary.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null}
            color="text-gray-400" sublabel="UTC server time" />
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
