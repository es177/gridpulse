export default function KPICard({ label, value, unit, sublabel, color = 'text-gray-100', icon, trend }) {
  const isLoading = value === null || value === undefined

  return (
    <div className="gp-panel px-4 py-3 min-w-0 group hover:border-[#2a2a4a] transition-colors duration-200">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-[11px] opacity-40">{icon}</span>}
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 truncate">
          {label}
        </span>
      </div>
      {isLoading ? (
        <div className="h-7 w-20 gp-skeleton mt-1" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className={`font-mono text-[22px] font-bold tabular-nums leading-none ${color}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {unit && <span className="text-[10px] font-mono text-gray-600">{unit}</span>}
          {trend !== undefined && trend !== null && (
            <span className={`text-[10px] font-mono font-semibold ml-0.5 ${
              trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-gray-600'
            }`}>
              {trend > 0 ? '▲' : trend < 0 ? '▼' : '–'}
            </span>
          )}
        </div>
      )}
      {sublabel && (
        <div className="text-[10px] text-gray-600 mt-0.5 font-mono truncate">{sublabel}</div>
      )}
    </div>
  )
}
