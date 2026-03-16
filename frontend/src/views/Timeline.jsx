import { useState, useMemo, useRef } from 'react'
import useStore from '../store/useStore'

/* ── shared config ──────────────────────────────────── */
const TIMELINE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'policy', label: 'Policy' },
  { id: 'investment', label: 'Investment' },
]

const POLICY_CATEGORIES = [
  { id: 'all',         label: 'All Policies' },
  { id: 'enrichment',  label: 'Enrichment & Fuel Cycle' },
  { id: 'funding',     label: 'Funding & Awards' },
  { id: 'legislation', label: 'Legislation' },
  { id: 'regulatory',  label: 'Licensing & Regulatory' },
  { id: 'executive',   label: 'Executive Orders' },
]

const CATEGORY_MAP = {
  funding_announcement: 'funding',
  legislation: 'legislation',
  executive_order: 'executive',
  regulatory: 'regulatory',
}

const ENRICHMENT_KEYWORDS = [
  'enrichment', 'haleu', 'leu', 'fuel cycle', 'uranium',
  'centrifuge', 'centrus', 'urenco', 'orano', 'general matter',
  'gaseous diffusion', 'gle', 'silex', 'fuel supply',
]

/* ── helpers ─────────────────────────────────────────── */
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

function isEnrichmentRelevant(event) {
  const text = [event.title, event.summary, ...(event.entities || [])].join(' ').toLowerCase()
  return ENRICHMENT_KEYWORDS.some((kw) => text.includes(kw))
}

function getCategory(event) {
  return CATEGORY_MAP[event.event_type] || 'regulatory'
}

function sourceHost(url) {
  try {
    if (url && !url.includes('example.com'))
      return new URL(url).hostname.replace('www.', '')
  } catch { /* ignore */ }
  return null
}

/* ── timeline card (compact, horizontal scroll) ──────── */
function TimelineCard({ item, isExpanded, onToggle }) {
  const isPolicy = item._type === 'policy'
  const amount = item.dollar_amount || item.amount_usd
  const entities = item.entities || []
  const investors = item.investors || []
  const tags = isPolicy ? entities : investors
  const host = sourceHost(item.source_url)

  return (
    <div
      className={`w-[260px] shrink-0 gp-panel p-3 cursor-pointer transition-all duration-200 hover:border-blue-500/30 ${isExpanded ? 'border-blue-500/30 bg-blue-500/[0.02]' : ''}`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-mono text-gray-500">
          {item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
        </span>
        <span className={`gp-badge text-[9px] ${isPolicy ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
          {isPolicy ? (item.event_type || 'policy').replace(/_/g, ' ') : 'investment'}
        </span>
        {amount && <span className="ml-auto font-mono text-[10px] text-blue-400 font-semibold">{formatAmount(amount)}</span>}
      </div>

      <h3 className={`text-[11px] font-medium leading-snug mb-1 ${isExpanded ? 'text-gray-100' : 'text-gray-300 line-clamp-2'}`}>
        {item.title || item.summary}
      </h3>

      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-white/[0.04] space-y-1.5 animate-[fadeIn_200ms_ease-out]">
          {item.summary && item.title !== item.summary && (
            <p className="text-[10px] text-gray-400 leading-relaxed">{item.summary}</p>
          )}
          {item.sentiment && (
            <span className={`text-[9px] font-mono font-semibold ${
              item.sentiment === 'positive' ? 'text-blue-400' : item.sentiment === 'negative' ? 'text-red-400' : 'text-gray-500'
            }`}>
              {item.sentiment === 'positive' ? '▲ Positive' : item.sentiment === 'negative' ? '▼ Negative' : '— Neutral'}
            </span>
          )}
          {item.company && (
            <div className="text-[10px]"><span className="text-gray-600">Company: </span><span className="text-gray-300">{item.company}</span></div>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 4).map((t, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-white/[0.04] rounded text-[9px] text-gray-400">{t}</span>
              ))}
              {tags.length > 4 && <span className="text-[9px] text-gray-600">+{tags.length - 4}</span>}
            </div>
          )}
          <div className="pt-1">
            {host ? (
              <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[9px] text-blue-400 hover:text-blue-300 font-mono">
                {host} ↗
              </a>
            ) : (
              <span className="text-[9px] text-gray-600 font-mono">Curated data</span>
            )}
          </div>
        </div>
      )}

      {!isExpanded && (
        <div className="text-[8px] text-gray-600 mt-1">Click to expand</div>
      )}
    </div>
  )
}

/* ── policy card (vertical list, more detail) ────────── */
function PolicyCard({ event }) {
  const [expanded, setExpanded] = useState(false)
  const amount = event.dollar_amount || event.amount_usd
  const entities = event.entities || []
  const host = sourceHost(event.source_url)
  const enrichment = isEnrichmentRelevant(event)

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className={`gp-panel p-3 cursor-pointer transition-all duration-200 hover:border-blue-500/30
        ${expanded ? 'border-blue-500/30 bg-blue-500/[0.02]' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-[10px] font-mono text-gray-500">
          {event.date ? new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
        </span>
        <span className={`gp-badge text-[9px] ${
          event.event_type === 'funding_announcement' ? 'bg-blue-500/10 text-blue-400'
          : event.event_type === 'legislation' ? 'bg-purple-500/10 text-purple-400'
          : event.event_type === 'executive_order' ? 'bg-amber-500/10 text-amber-400'
          : 'bg-white/[0.06] text-gray-300'
        }`}>
          {(event.event_type || 'policy').replace(/_/g, ' ')}
        </span>
        {enrichment && (
          <span className="gp-badge text-[9px] bg-red-500/10 text-red-400">enrichment</span>
        )}
        {event.sentiment && (
          <span className={`text-[9px] font-mono font-semibold ${
            event.sentiment === 'positive' ? 'text-blue-400' : event.sentiment === 'negative' ? 'text-red-400' : 'text-gray-500'
          }`}>
            {event.sentiment === 'positive' ? '▲' : event.sentiment === 'negative' ? '▼' : '—'}
          </span>
        )}
        {amount && (
          <span className="ml-auto font-mono text-[11px] text-blue-400 font-semibold">{formatAmount(amount)}</span>
        )}
      </div>

      <h3 className={`text-[12px] font-semibold leading-snug ${expanded ? 'text-gray-100' : 'text-gray-200 line-clamp-2'}`}>
        {event.title}
      </h3>

      {event.summary && event.summary !== event.title && (
        <p className={`text-[11px] text-gray-400 leading-relaxed mt-1.5 ${expanded ? '' : 'line-clamp-2'}`}>
          {event.summary}
        </p>
      )}

      {expanded && (
        <div className="mt-2.5 pt-2.5 border-t border-white/[0.04] space-y-2 animate-[fadeIn_200ms_ease-out]">
          {entities.length > 0 && (
            <div>
              <span className="text-[9px] uppercase tracking-wider text-gray-600 block mb-1">Entities</span>
              <div className="flex flex-wrap gap-1">
                {entities.map((e, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded text-[10px] text-gray-400">{e}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            {host ? (
              <a href={event.source_url} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/10 border border-blue-500/20
                  text-[10px] font-mono text-blue-400 hover:bg-blue-600/20 hover:text-blue-300 transition-all">
                VIEW SOURCE — {host} ↗
              </a>
            ) : (
              <span className="text-[9px] text-gray-600 font-mono">Source: Curated data</span>
            )}
          </div>
        </div>
      )}

      {!expanded && host && (
        <div className="mt-1.5 flex items-center gap-2">
          <a href={event.source_url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[9px] font-mono text-blue-400/60 hover:text-blue-400">
            {host} ↗
          </a>
          <span className="text-[8px] text-gray-700 ml-auto">Click to expand</span>
        </div>
      )}
    </div>
  )
}

/* ── main combined view ──────────────────────────────── */
export default function Timeline() {
  const policyEvents = useStore((s) => s.policyEvents)
  const investments = useStore((s) => s.investments)

  // Timeline state
  const [timelineFilter, setTimelineFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const scrollRef = useRef(null)

  // Policy section state
  const [policyCategory, setPolicyCategory] = useState('all')

  /* ── timeline data ── */
  const allItems = useMemo(() => {
    const items = [
      ...policyEvents.map((e) => ({ ...e, _type: 'policy', _id: `p-${e.id}` })),
      ...investments.map((e) => ({ ...e, _type: 'investment', _id: `i-${e.id}`, title: e.summary })),
    ]
    return dedupeByTitle(items).sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [policyEvents, investments])

  const filteredTimeline = useMemo(() => {
    let items = allItems
    if (timelineFilter !== 'all') items = items.filter((i) => i._type === timelineFilter)
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(i =>
        (i.title || '').toLowerCase().includes(q) || (i.summary || '').toLowerCase().includes(q) ||
        (i.company || '').toLowerCase().includes(q) || (i.entities || []).some(e => e.toLowerCase().includes(q))
      )
    }
    return items
  }, [allItems, timelineFilter, search])

  const groups = useMemo(() => groupByMonth(filteredTimeline), [filteredTimeline])

  /* ── policy data ── */
  const filteredPolicies = useMemo(() => {
    let items = [...policyEvents].sort((a, b) => new Date(b.date) - new Date(a.date))
    if (policyCategory === 'enrichment') {
      items = items.filter(isEnrichmentRelevant)
    } else if (policyCategory !== 'all') {
      items = items.filter((e) => getCategory(e) === policyCategory)
    }
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((e) =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.summary || '').toLowerCase().includes(q) ||
        (e.entities || []).some((ent) => ent.toLowerCase().includes(q))
      )
    }
    return items
  }, [policyEvents, policyCategory, search])

  const enrichmentCount = useMemo(
    () => policyEvents.filter(isEnrichmentRelevant).length,
    [policyEvents]
  )

  const scrollBy = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 600, behavior: 'smooth' })
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Shared filter bar ─────────────────────────── */}
      <div className="flex-none px-4 py-2.5 border-b border-[#1a1a32] bg-[#08080f]">
        <div className="flex items-center gap-3">
          {/* Timeline type filter */}
          <div className="flex items-center gap-1">
            {TIMELINE_FILTERS.map((cat) => (
              <button key={cat.id} onClick={() => setTimelineFilter(cat.id)}
                className={`px-2.5 py-1 text-[10px] font-medium rounded transition-all ${
                  timelineFilter === cat.id
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                    : 'text-gray-500 hover:text-gray-400 border border-transparent'
                }`}>{cat.label}</button>
            ))}
          </div>

          <div className="w-px h-4 bg-[#1a1a32]" />

          {/* Search */}
          <input type="text" placeholder="Search events, companies, policies..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-xs bg-[#06060c] border border-[#1a1a32] rounded px-2.5 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500/40 placeholder-gray-600 font-mono" />

          <span className="text-[9px] font-mono text-gray-600">{filteredTimeline.length} events</span>

          {/* Scroll controls */}
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => scrollBy(-1)} className="px-1.5 py-0.5 text-gray-500 hover:text-gray-300 text-[13px]">←</button>
            <button onClick={() => scrollBy(1)} className="px-1.5 py-0.5 text-gray-500 hover:text-gray-300 text-[13px]">→</button>
          </div>
        </div>
      </div>

      {/* ── Scrollable content area ───────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">

        {/* ── TIMELINE SECTION (horizontal scroll) ────── */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Chronological Timeline</h2>
            <div className="flex-1 h-px bg-[#1a1a32]" />
          </div>

          {groups.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-gray-600 text-[12px]">No events match your filters</div>
          ) : (
            <>
              <div className="h-px bg-[#1a1a32] relative mb-3">
                <div className="absolute left-0 w-4 h-px bg-gradient-to-r from-blue-500 to-transparent" />
                <div className="absolute right-0 w-4 h-px bg-gradient-to-l from-blue-500/30 to-transparent" />
              </div>

              <div ref={scrollRef} className="overflow-x-auto pb-3" style={{ scrollbarWidth: 'thin' }}>
                <div className="flex gap-3 items-start">
                  {groups.map((group) => (
                    <div key={group.key} className="shrink-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{group.label}</span>
                        <span className="text-[8px] font-mono text-gray-600">{group.items.length}</span>
                      </div>
                      <div className="flex gap-2 items-start">
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

        {/* ── Divider ─────────────────────────────────── */}
        <div className="mx-4 border-t border-[#1a1a32]" />

        {/* ── POLICY TRACKER SECTION (vertical list) ──── */}
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-center gap-2 mb-2.5">
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Nuclear Policy Tracker</h2>
            <span className="text-[9px] font-mono text-gray-600">{policyEvents.length} tracked</span>
            <div className="flex-1 h-px bg-[#1a1a32]" />
          </div>

          {/* Policy category filters */}
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {POLICY_CATEGORIES.map((cat) => (
              <button key={cat.id} onClick={() => setPolicyCategory(cat.id)}
                className={`px-2.5 py-1 text-[10px] font-medium rounded transition-all ${
                  policyCategory === cat.id
                    ? cat.id === 'enrichment'
                      ? 'bg-red-600/20 text-red-300 border border-red-500/30'
                      : 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                    : 'text-gray-500 hover:text-gray-400 border border-transparent'
                }`}>
                {cat.label}
                {cat.id === 'enrichment' && enrichmentCount > 0 && (
                  <span className="ml-1 text-[8px] opacity-60">{enrichmentCount}</span>
                )}
              </button>
            ))}
            <span className="ml-auto text-[9px] font-mono text-gray-600">{filteredPolicies.length} shown</span>
          </div>

          {/* Policy list */}
          {filteredPolicies.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-gray-600 text-[12px]">
              No policy events match your filters
            </div>
          ) : (
            <div className="space-y-2 max-w-4xl">
              {filteredPolicies.map((event) => (
                <PolicyCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────── */}
      <div className="flex-none px-4 py-1.5 border-t border-[#1a1a32] bg-[#08080f]">
        <div className="flex items-center gap-4 text-[8px] font-mono text-gray-600">
          <span>Sources:</span>
          <a href="https://www.energy.gov/ne" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">DOE Nuclear Energy ↗</a>
          <a href="https://www.nrc.gov/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">NRC ↗</a>
          <a href="https://www.congress.gov/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">Congress.gov ↗</a>
          <a href="https://www.whitehouse.gov/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">White House ↗</a>
          <span className="text-gray-700">| Deduplication applied</span>
        </div>
      </div>
    </div>
  )
}
