import { useState, useMemo } from 'react'
import useStore from '../store/useStore'

/* ── category config ─────────────────────────────────── */
const CATEGORY_MAP = {
  funding_announcement: 'funding',
  legislation: 'legislation',
  executive_order: 'executive',
  regulatory: 'regulatory',
}

const CATEGORIES = [
  { id: 'all',         label: 'All' },
  { id: 'enrichment',  label: 'Enrichment & Fuel Cycle' },
  { id: 'funding',     label: 'Funding & Awards' },
  { id: 'legislation', label: 'Legislation' },
  { id: 'regulatory',  label: 'Licensing & Regulatory' },
  { id: 'executive',   label: 'Executive Orders' },
]

/* keywords that flag an event as enrichment-relevant */
const ENRICHMENT_KEYWORDS = [
  'enrichment', 'haleu', 'leu', 'fuel cycle', 'uranium',
  'centrifuge', 'centrus', 'urenco', 'orano', 'general matter',
  'gaseous diffusion', 'gle', 'silex', 'fuel supply',
]

/* ── helpers ──────────────────────────────────────────── */
function formatAmount(usd) {
  if (!usd) return null
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`
  return `$${(usd / 1e3).toFixed(0)}K`
}

function isEnrichmentRelevant(event) {
  const text = [
    event.title,
    event.summary,
    ...(event.entities || []),
  ].join(' ').toLowerCase()
  return ENRICHMENT_KEYWORDS.some((kw) => text.includes(kw))
}

function getCategory(event) {
  return CATEGORY_MAP[event.event_type] || 'regulatory'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function sourceHost(url) {
  try {
    if (url && !url.includes('example.com'))
      return new URL(url).hostname.replace('www.', '')
  } catch { /* ignore */ }
  return null
}

/* ── single policy card ──────────────────────────────── */
function PolicyCard({ event }) {
  const [expanded, setExpanded] = useState(false)
  const amount = event.dollar_amount || event.amount_usd
  const entities = event.entities || []
  const host = sourceHost(event.source_url)
  const enrichment = isEnrichmentRelevant(event)

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className={`gp-panel p-4 cursor-pointer transition-all duration-200 hover:border-blue-500/30
        ${expanded ? 'border-blue-500/30 bg-blue-500/[0.02]' : ''}`}
    >
      {/* Top row: date + badges + amount */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[11px] font-mono text-gray-500">{formatDate(event.date)}</span>

        <span className={`gp-badge ${
          event.event_type === 'funding_announcement' ? 'bg-blue-500/10 text-blue-400'
          : event.event_type === 'legislation' ? 'bg-blue-500/10 text-blue-300'
          : event.event_type === 'executive_order' ? 'bg-blue-500/10 text-blue-300'
          : 'bg-white/[0.06] text-gray-300'
        }`}>
          {(event.event_type || 'policy').replace(/_/g, ' ')}
        </span>

        {enrichment && (
          <span className="gp-badge bg-red-500/10 text-red-400">enrichment</span>
        )}

        {event.sentiment && (
          <span className={`text-[10px] font-mono font-semibold ${
            event.sentiment === 'positive' ? 'text-blue-400'
            : event.sentiment === 'negative' ? 'text-red-400'
            : 'text-gray-500'
          }`}>
            {event.sentiment === 'positive' ? '▲' : event.sentiment === 'negative' ? '▼' : '—'}
          </span>
        )}

        {amount && (
          <span className="ml-auto font-mono text-[12px] text-blue-400 font-semibold">{formatAmount(amount)}</span>
        )}
      </div>

      {/* Title */}
      <h3 className={`text-[13px] font-semibold leading-snug ${expanded ? 'text-gray-100' : 'text-gray-200 line-clamp-2'}`}>
        {event.title}
      </h3>

      {/* Summary — always visible (compact or full) */}
      {event.summary && event.summary !== event.title && (
        <p className={`text-[12px] text-gray-400 leading-relaxed mt-2 ${expanded ? '' : 'line-clamp-2'}`}>
          {event.summary}
        </p>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-3 animate-[fadeIn_200ms_ease-out]">
          {/* Entities */}
          {entities.length > 0 && (
            <div>
              <span className="text-[9px] uppercase tracking-wider text-gray-600 block mb-1">Entities</span>
              <div className="flex flex-wrap gap-1.5">
                {entities.map((e, i) => (
                  <span key={i} className="px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded text-[11px] text-gray-400">{e}</span>
                ))}
              </div>
            </div>
          )}

          {/* Source link */}
          <div className="flex items-center justify-between">
            {host ? (
              <a href={event.source_url} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600/10 border border-blue-500/20
                  text-[11px] font-mono text-blue-400 hover:bg-blue-600/20 hover:text-blue-300 transition-all">
                VIEW SOURCE — {host} ↗
              </a>
            ) : (
              <span className="text-[10px] text-gray-600 font-mono">Source: Seeded data</span>
            )}
            <span className="text-[9px] text-gray-600 font-mono">via NewsAPI + Claude extraction</span>
          </div>
        </div>
      )}

      {/* Compact source hint when collapsed */}
      {!expanded && host && (
        <div className="mt-2 flex items-center gap-2">
          <a href={event.source_url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] font-mono text-blue-400/60 hover:text-blue-400">
            {host} ↗
          </a>
          <span className="text-[9px] text-gray-700 ml-auto">Click to expand</span>
        </div>
      )}
    </div>
  )
}

/* ── main view ───────────────────────────────────────── */
export default function PolicyView() {
  const policyEvents = useStore((s) => s.policyEvents)
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')

  /* derive + filter */
  const filtered = useMemo(() => {
    let items = [...policyEvents].sort((a, b) => new Date(b.date) - new Date(a.date))

    // category filter
    if (activeCategory === 'enrichment') {
      items = items.filter(isEnrichmentRelevant)
    } else if (activeCategory !== 'all') {
      items = items.filter((e) => getCategory(e) === activeCategory)
    }

    // search
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((e) =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.summary || '').toLowerCase().includes(q) ||
        (e.entities || []).some((ent) => ent.toLowerCase().includes(q))
      )
    }

    return items
  }, [policyEvents, activeCategory, search])

  /* group by category for the "All" view */
  const grouped = useMemo(() => {
    if (activeCategory !== 'all') return null

    const groups = {}
    filtered.forEach((e) => {
      const catId = getCategory(e)
      const catMeta = CATEGORIES.find((c) => c.id === catId) || CATEGORIES[4]
      if (!groups[catId]) groups[catId] = { id: catId, label: catMeta.label, items: [] }
      groups[catId].items.push(e)
    })

    // fixed display order
    const order = ['funding', 'legislation', 'regulatory', 'executive']
    return order.map((id) => groups[id]).filter(Boolean)
  }, [filtered, activeCategory])

  /* enrichment-relevant count for the chip */
  const enrichmentCount = useMemo(
    () => policyEvents.filter(isEnrichmentRelevant).length,
    [policyEvents]
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header bar ────────────────────────────────── */}
      <div className="flex-none px-4 py-3 border-b border-[#1a1a32] bg-[#08080f]">
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-[14px] font-semibold text-gray-200 tracking-wide">
            Nuclear Policy Tracker
          </h1>
          <span className="text-[10px] font-mono text-gray-600">
            {policyEvents.length} events tracked
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1 text-[11px] font-medium rounded transition-all ${
                activeCategory === cat.id
                  ? cat.id === 'enrichment'
                    ? 'bg-red-600/20 text-red-300 border border-red-500/30'
                    : 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                  : 'text-gray-500 hover:text-gray-400 border border-transparent'
              }`}
            >
              {cat.label}
              {cat.id === 'enrichment' && (
                <span className="ml-1 text-[9px] opacity-60">{enrichmentCount}</span>
              )}
            </button>
          ))}

          <input
            type="text"
            placeholder="Search policies, entities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto max-w-xs bg-[#06060c] border border-[#1a1a32] rounded px-3 py-1.5
              text-[11px] text-gray-300 focus:outline-none focus:border-blue-500/40
              placeholder-gray-600 font-mono"
          />
          <span className="text-[10px] font-mono text-gray-600">{filtered.length} shown</span>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-[13px]">
            No policy events match your filters
          </div>
        ) : activeCategory === 'all' && grouped ? (
          /* Grouped view */
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* Enrichment-relevant callout at top */}
            {enrichmentCount > 0 && (
              <div className="gp-panel border-red-500/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-red-500/60" />
                  <h2 className="text-[12px] font-semibold uppercase tracking-wider text-red-400">
                    Enrichment & Fuel Cycle — Most Relevant
                  </h2>
                  <span className="text-[10px] font-mono text-gray-600">{enrichmentCount} events</span>
                </div>
                <div className="space-y-2">
                  {policyEvents
                    .filter(isEnrichmentRelevant)
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((event) => (
                      <PolicyCard key={event.id} event={event} />
                    ))}
                </div>
              </div>
            )}

            {/* Remaining categories */}
            {grouped.map((group) => (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500/50" />
                  <h2 className="text-[12px] font-semibold uppercase tracking-wider text-gray-400">
                    {group.label}
                  </h2>
                  <span className="text-[10px] font-mono text-gray-600">{group.items.length}</span>
                </div>
                <div className="space-y-2">
                  {group.items.map((event) => (
                    <PolicyCard key={event.id} event={event} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Flat filtered list */
          <div className="space-y-2 max-w-4xl mx-auto">
            {filtered.map((event) => (
              <PolicyCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────── */}
      <div className="flex-none px-4 pb-2">
        <div className="flex items-center gap-4 text-[9px] font-mono text-gray-600">
          <span>Sources:</span>
          <a href="https://www.nrc.gov/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">NRC ↗</a>
          <a href="https://www.energy.gov/ne" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">DOE Nuclear Energy ↗</a>
          <a href="https://www.congress.gov/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">Congress.gov ↗</a>
          <a href="https://www.whitehouse.gov/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">White House ↗</a>
          <span className="text-gray-700">| Extraction: Claude AI | {policyEvents.length} events tracked</span>
        </div>
      </div>
    </div>
  )
}
