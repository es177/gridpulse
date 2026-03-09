import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import useStore from '../store/useStore'

// Simplified red/blue/white palette
const FUEL_COLORS = {
  nuclear: '#3b82f6',   // blue-500
  solar: '#f5f5f5',     // near-white
  wind: '#93c5fd',      // blue-300
  gas: '#ef4444',       // red-500
  coal: '#7f1d1d',      // red-900
  hydro: '#60a5fa',     // blue-400
  oil: '#b91c1c',       // red-700
  other: '#6b7280',     // gray-500
}

const FUEL_LABELS = {
  nuclear: 'Nuclear',
  solar: 'Solar',
  wind: 'Wind',
  gas: 'Nat Gas',
  coal: 'Coal',
  hydro: 'Hydro',
  oil: 'Oil',
  other: 'Other',
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="bg-[#0e0e1a] border border-[#2a2a4a] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[11px] font-semibold" style={{ color: d.payload.fill }}>{d.name}</div>
      <div className="font-mono text-[13px] text-gray-200 mt-0.5">{d.value.toLocaleString()} <span className="text-gray-500 text-[10px]">MW</span></div>
      <div className="font-mono text-[10px] text-gray-500">{d.payload.percent}% of mix</div>
    </div>
  )
}

export default function FuelMixChart() {
  const gridData = useStore((s) => s.gridData)

  if (!gridData?.national_fuel_mix) {
    return (
      <div className="gp-panel p-4 h-full flex items-center justify-center">
        <div className="gp-skeleton h-40 w-40 rounded-full" />
      </div>
    )
  }

  const fuelMix = gridData.national_fuel_mix
  const total = Object.values(fuelMix).reduce((sum, v) => sum + v, 0)

  const data = Object.entries(fuelMix)
    .filter(([key]) => key !== 'all')
    .map(([fuel, value]) => ({
      name: FUEL_LABELS[fuel] || fuel,
      value: Math.round(value),
      fill: FUEL_COLORS[fuel] || '#4b5563',
      percent: total > 0 ? ((value / total) * 100).toFixed(1) : '0',
      fuel,
    }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="gp-panel p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="gp-panel-header">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Fuel Generation Mix
        </div>
        <a
          href="https://www.eia.gov/electricity/gridmonitor/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] font-mono text-gray-600 hover:text-blue-400 transition-colors"
          title="View source data at EIA"
        >
          SOURCE: EIA ↗
        </a>
      </div>

      {/* Chart with explicit height */}
      <div style={{ height: 200 }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="50%"
              outerRadius="82%"
              paddingAngle={2}
              dataKey="value"
              animationDuration={700}
              stroke="none"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <text x="50%" y="46%" textAnchor="middle" className="fill-gray-200 text-[16px] font-mono font-bold">
              {(total / 1000).toFixed(0)}
            </text>
            <text x="50%" y="57%" textAnchor="middle" className="fill-gray-500 text-[9px]">
              GW TOTAL
            </text>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-2 space-y-0.5">
        {data.map((d) => (
          <div key={d.fuel} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: d.fill }} />
            <span className="text-[10px] text-gray-500 flex-1 truncate">{d.name}</span>
            <span className="text-[10px] font-mono text-gray-400 tabular-nums">{d.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
