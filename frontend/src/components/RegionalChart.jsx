import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import useStore from '../store/useStore'

const REGION_FULL = {
  PJM: 'PJM Interconnection',
  MISO: 'Midcontinent ISO',
  ERCOT: 'ERCOT (Texas)',
  CAISO: 'California ISO',
  SPP: 'Southwest Power Pool',
  NYISO: 'New York ISO',
  ISONE: 'ISO New England',
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  return (
    <div className="bg-[#0e0e1a] border border-[#2a2a4a] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[11px] font-semibold text-gray-300 mb-0.5">{REGION_FULL[label] || label}</div>
      <div className="font-mono text-[15px] text-gray-100">
        {Math.round(v).toLocaleString()} <span className="text-gray-500 text-[10px]">MW</span>
      </div>
      <div className="font-mono text-[10px] text-gray-500 mt-0.5">
        {(v / 1000).toFixed(1)} GW
      </div>
    </div>
  )
}

export default function RegionalChart() {
  const gridData = useStore((s) => s.gridData)

  if (!gridData?.regions?.length) {
    return (
      <div className="gp-panel p-4 h-full flex items-center justify-center">
        <div className="gp-skeleton h-40 w-full" />
      </div>
    )
  }

  const data = gridData.regions.map((r) => {
    const totalMW = Object.values(r.fuels || {}).reduce((s, v) => s + v, 0)
    return { region: r.region, demand: Math.round(totalMW) }
  }).sort((a, b) => b.demand - a.demand)

  const maxVal = Math.max(...data.map(d => d.demand))

  return (
    <div className="gp-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="gp-panel-header">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          Regional Demand by ISO/RTO
        </div>
        <a
          href="https://www.eia.gov/electricity/gridmonitor/dashboard/electric_overview/US48/US48"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] font-mono text-gray-600 hover:text-blue-400 transition-colors"
        >
          SOURCE: EIA ↗
        </a>
      </div>
      <div style={{ height: 200 }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 4 }} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a32" vertical={false} />
            <XAxis
              dataKey="region"
              tick={{ fontSize: 9, fill: '#6b7280', fontFamily: '"JetBrains Mono", monospace' }}
              axisLine={{ stroke: '#1a1a32' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#4b5563', fontFamily: '"JetBrains Mono", monospace' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              width={32}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} />
            <Bar dataKey="demand" radius={[3, 3, 0, 0]} animationDuration={500}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={`rgba(59, 130, 246, ${0.35 + (entry.demand / maxVal) * 0.65})`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
