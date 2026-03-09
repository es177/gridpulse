import { useState, useMemo } from 'react'
import useStore from '../store/useStore'

function PowerBar({ pct }) {
  const color = pct > 90 ? 'bg-blue-500' : pct > 50 ? 'bg-blue-300' : pct > 0 ? 'bg-red-400' : 'bg-red-600'
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`font-mono text-[11px] tabular-nums w-9 text-right ${
        pct > 90 ? 'text-blue-400' : pct > 50 ? 'text-blue-300' : pct > 0 ? 'text-red-400' : 'text-red-500'
      }`}>
        {pct}%
      </span>
    </div>
  )
}

export default function ReactorTable() {
  const reactors = useStore((s) => s.reactors)
  const loading = useStore((s) => s.reactorLoading)
  const [sortField, setSortField] = useState('current_pct_power')
  const [sortDir, setSortDir] = useState('desc')
  const [filter, setFilter] = useState('')

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir(field === 'name' || field === 'state' ? 'asc' : 'desc') }
  }

  const sorted = useMemo(() => {
    let list = [...reactors]
    if (filter) {
      const q = filter.toLowerCase()
      list = list.filter(r =>
        r.name.toLowerCase().includes(q) || r.state?.toLowerCase().includes(q) || r.operator?.toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      let av = a[sortField], bv = b[sortField]
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      return av < bv ? (sortDir === 'asc' ? -1 : 1) : av > bv ? (sortDir === 'asc' ? 1 : -1) : 0
    })
    return list
  }, [reactors, sortField, sortDir, filter])

  const stats = useMemo(() => ({
    above90: reactors.filter(r => r.current_pct_power > 90).length,
    offline: reactors.filter(r => r.current_pct_power === 0).length,
    avg: reactors.length > 0 ? (reactors.reduce((s, r) => s + r.current_pct_power, 0) / reactors.length).toFixed(1) : 0,
  }), [reactors])

  if (loading) {
    return <div className="gp-panel p-4"><div className="gp-panel-header mb-4">Nuclear Fleet</div>
      <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="gp-skeleton h-7 w-full" />)}</div></div>
  }

  const SortHeader = ({ field, children, className = '' }) => (
    <th onClick={() => toggleSort(field)}
      className={`px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-500 cursor-pointer hover:text-gray-300 select-none whitespace-nowrap ${className}`}
    >{children}<span className="ml-0.5 text-blue-400/60">{sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span></th>
  )

  return (
    <div className="gp-panel flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[#1a1a32]">
        <div className="flex items-center gap-4">
          <div className="gp-panel-header"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />Nuclear Fleet</div>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="text-blue-400">{stats.above90} <span className="text-gray-600">online</span></span>
            <span className="text-gray-600">|</span>
            <span className="text-red-400">{stats.offline} <span className="text-gray-600">offline</span></span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-400">{stats.avg}% <span className="text-gray-600">avg</span></span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/index.html" target="_blank" rel="noopener noreferrer"
            className="text-[9px] font-mono text-gray-600 hover:text-blue-400 transition-colors">SOURCE: NRC ↗</a>
          <input type="text" placeholder="Search reactors..." value={filter} onChange={(e) => setFilter(e.target.value)}
            className="bg-[#06060c] border border-[#1a1a32] rounded px-2.5 py-1 text-[11px] text-gray-300 w-40 focus:outline-none focus:border-blue-500/40 placeholder-gray-600 font-mono" />
        </div>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full">
          <thead className="sticky top-0 bg-[#0e0e1a] z-10"><tr className="border-b border-[#1a1a32]">
            <SortHeader field="name">Unit</SortHeader><SortHeader field="state">ST</SortHeader>
            <SortHeader field="reactor_type">Type</SortHeader><SortHeader field="operator">Operator</SortHeader>
            <SortHeader field="mwt_licensed" className="text-right">MWt</SortHeader>
            <SortHeader field="current_pct_power" className="w-40">Output</SortHeader>
          </tr></thead>
          <tbody>{sorted.map((r) => (
            <tr key={r.id} className="border-b border-white/[0.02] hover:bg-blue-500/[0.03] transition-colors">
              <td className="px-3 py-1.5 text-[12px] font-medium text-gray-200 whitespace-nowrap">{r.name}</td>
              <td className="px-3 py-1.5 text-[11px] font-mono text-gray-500">{r.state}</td>
              <td className="px-3 py-1.5"><span className={`gp-badge ${r.reactor_type === 'PWR' ? 'bg-blue-500/10 text-blue-400' : 'bg-white/[0.06] text-gray-400'}`}>{r.reactor_type}</span></td>
              <td className="px-3 py-1.5 text-[11px] text-gray-500 max-w-[180px] truncate">{r.operator}</td>
              <td className="px-3 py-1.5 font-mono text-[11px] text-gray-400 text-right tabular-nums">{r.mwt_licensed?.toLocaleString()}</td>
              <td className="px-3 py-1.5 w-40"><PowerBar pct={r.current_pct_power} /></td>
            </tr>
          ))}</tbody>
        </table>
        {sorted.length === 0 && <div className="flex items-center justify-center py-12 text-gray-600 text-[12px]">No reactors match "{filter}"</div>}
      </div>
    </div>
  )
}
