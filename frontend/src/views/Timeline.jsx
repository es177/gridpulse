import { useState, useMemo, useRef } from 'react'
import useStore from '../store/useStore'

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'policy', label: 'Policy' },
  { id: 'investment', label: 'Investment' },
]

function formatAmount(usd) {
  if (!usd) return null
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`
  return `$${(usd / 1e3).toFixed(0)}K`
}

function dedupeByTitle(items) {
  const seen = new Set()
  return items.filter((item) => {
    const key = (item.title || item.summary || '').toLowerCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function groupByMonth(items) {
  const groups = {}
  items.forEach((item) => {
    const d = new Date(item.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    if (!groups[key]) groups[key] = { key, label, items: [] }
    groups[key].items.push(item)
  })
  return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key))
}

function TimelineCard({ item, isExpanded, onToggle }) {
  const isPolicy = item._type === 'policy'
  const amount = item.dollar_amount || item.amount_usd
  const entities = item.entities || []
  const investors = item.investors || []
  const tags = isPolicy ? entities : investors

  // Source URL display
  let sourceHost = null
  try {
    if (item.source_url && !item.source_url.includes('example.com')) {
      sourceHost = new URL(item.source_url).hostname.replace('www.', '')
    }
  } catch {}

  return (
    <div
      className={`w-[280px] shrink-0 gp-panel p-3 cursor-pointer transition-all duration-200 hover:border-blue-500/30 ${isExpanded ? 'border-blue-500/30 bg-blue-500/[0.02]' : ''}`}
      onClick={onToggle}
    >
      {/* Date & type */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-mono text-gray-500">
          {item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
        </span>
        <span className={`gp-badge ${isPolicy ? 'bg-blue-500/10 text-blue-400' : 'bg-white/[0.06] text-gray-300'}`}>
          {isPolicy ? (item.event_type || 'policy').replace(/_/g, ' ') : item.technology_type || 'deal'}
        </span>
        {amount && <span className="ml-auto font-mono text-[10px] text-blue-400 font-semibold">{formatAmount(amount)}</span>}
      </div>

      {/* Title */}
      <h3 className={`text-[12px] font-medium leading-snug mb-2 ${isExpanded ? 'text-gray-100' : 'text-gray-300 line-clamp-2'}`}>
        {item.title || item.summary}
      </h3>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-white/[0.04] space-y-2 animate-[fadeIn_200ms_ease-out]">
          {/* Full summary if different from title */}
          {item.summary && item.title !== item.summary && (
            <p className="text-[11px] text-gray-400 leading-relaxed">{item.summary}</p>
          )}

          {/* Sentiment */}
          {item.sentiment && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-wider text-gray-600">Sentiment</span>
              <span className={`text-[10px] font-mono font-semibold ${
                item.sentiment === 'positive' ? 'text-blue-400' : item.sentiment === 'negative' ? 'text-red-400' : 'text-gray-500'
              }`}>
                {item.sentiment === 'positive' ? '▲ Positive' : item.sentiment === 'negative' ? '▼ Negative' : '— Neutral'}
              </span>
            </div>
          )}

          {/* Company (for investments) */}
          {item.company && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-wider text-gray-600">Company</span>
              <span className="text-[11px] text-gray-300">{item.company}</span>
            </div>
          )}

          {/* Round type */}
          {item.round_type && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-wider text-gray-600">Round</span>
              <span className="text-[11px] text-gray-400 font-mono">{item.round_type.replace(/_/g, ' ')}</span>
            </div>
          )}

          {/* Entity/investor tags */}
          {tags.length > 0 && (
            <div>
              <span className="text-[9px] uppercase tracking-wider text-gray-600 block mb-1">{isPolicy ? 'Entities' : 'Investors'}</span>
              <div className="flex flex-wrap gap-1">
                {tags.map((t, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-white/[0.04] rounded text-[10px] text-gray-400">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Source link */}
          <div className="pt-1.5 flex items-center gap-2">
            {sourceHost ? (
              <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-blue-400 hover:text-blue-300 font-mono">
                {sourceHost} ↗
              </a>
            ) : (
              <span className="text-[10px] text-gray-600 font-mono">Curated data</span>
            )}
            <span className="text-[9px] text-gray-600 font-mono ml-auto">
              {isPolicy ? 'NewsAPI + AI' : 'Tracked'}
            </span>
          </div>
        </div>
      )}

      {/* Expand hint */}
      {!isExpanded && (
        <div className="text-[9px] text-gray-600 mt-1">Click to expand</div>
      )}
    </div>
  )
}

export default function Timeline() {
  const policyEvents = useStore((s) => s.policyEvents)
  const investments = useStore((s) => s.investments)
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const scrollRef = useRef(null)

  const allItems = useMemo(() => {
    const items = [
      ...policyEvents.map((e) => ({ ...e, _type: 'policy', _id: `p-${e.id}` })),
      ...investments.map((e) => ({ ...e, _type: 'investment', _id: `i-${e.id}`, title: e.summary })),
    ]
    return dedupeByTitle(items).sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [policyEvents, investments])

  const filtered = useMemo(() => {
    let items = allItems
    if (activeCategory !== 'all') items = items.filter((i) => i._type === activeCategory)
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(i =>
        (i.title || '').toLowerCase().includes(q) || (i.summary || '').toLowerCase().includes(q) ||
        (i.company || '').toLowerCase().includes(q) || (i.entities || []).some(e => e.toLowerCase().includes(q))
      )
    }
    return items
  }, [allItems, activeCategory, search])

  const groups = useMemo(() => groupByMonth(filtered), [filtered])

  const scrollBy = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 600, behavior: 'smooth' })
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex-none px-4 py-3 border-b border-[#1a1a32] flex items-center gap-4 bg-[#08080f]">
        <div className="flex items-center gap-1">
          {CATEGORIES.map((cat) => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1 text-[11px] font-medium rounded transition-all ${
                activeCategory === cat.id
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                  : 'text-gray-500 hover:text-gray-400 border border-transparent'
              }`}>{cat.label}</button>
          ))}
        </div>
        <input type="text" placeholder="Search events, companies..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm bg-[#06060c] border border-[#1a1a32] rounded px-3 py-1.5 text-[11px] text-gray-300 focus:outline-none focus:border-blue-500/40 placeholder-gray-600 font-mono" />
        <div className="text-[10px] font-mono text-gray-600">{filtered.length} events (deduped)</div>
        {/* Scroll controls */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => scrollBy(-1)} className="px-2 py-1 text-gray-500 hover:text-gray-300 text-[14px]">←</button>
          <button onClick={() => scrollBy(1)} className="px-2 py-1 text-gray-500 hover:text-gray-300 text-[14px]">→</button>
        </div>
      </div>

      {/* Horizontal timeline */}
      <div className="flex-1 flex flex-col min-h-0 px-4 pt-4 pb-2">
        {groups.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-[13px]">No events match your filters</div>
        ) : (
          <>
            {/* Month labels (top rail) */}
            <div className="flex-none flex items-end overflow-hidden mb-0">
              <div ref={scrollRef} className="flex gap-0 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
                {/* Invisible sync scroll — handled by the main scroll below */}
              </div>
            </div>

            {/* Scrollable track */}
            <div className="flex-none h-px bg-[#1a1a32] relative mb-4">
              <div className="absolute left-0 w-4 h-px bg-gradient-to-r from-blue-500 to-transparent" />
              <div className="absolute right-0 w-4 h-px bg-gradient-to-l from-red-500 to-transparent" />
            </div>

            <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden pb-4" style={{ scrollbarWidth: 'thin' }}>
              <div className="flex gap-4 items-start h-full">
                {groups.map((group) => (
                  <div key={group.key} className="shrink-0">
                    {/* Month label */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500/50" />
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{group.label}</span>
                      <span className="text-[9px] font-mono text-gray-600">{group.items.length}</span>
                    </div>

                    {/* Cards in this month */}
                    <div className="flex gap-3 items-start">
                      {group.items.map((item) => (
                        <TimelineCard
                          key={item._id}
                          item={item}
                          isExpanded={expandedId === item._id}
                          onToggle={() => setExpandedId(expandedId === item._id ? null : item._id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Source footer */}
      <div className="flex-none px-4 pb-2">
        <div className="flex items-center gap-4 text-[9px] font-mono text-gray-600">
          <span>Sources:</span>
          <a href="https://newsapi.org/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">NewsAPI ↗</a>
          <a href="https://www.energy.gov/ne" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">DOE Nuclear Energy ↗</a>
          <a href="https://www.nrc.gov/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">NRC ↗</a>
          <span className="text-gray-700">| Extraction: Claude AI | Deduplication applied</span>
        </div>
      </div>
    </div>
  )
}
