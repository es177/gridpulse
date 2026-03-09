import useStore from '../store/useStore'

// Simplified blue/red/white
const TYPE_COLORS = {
  legislation: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  executive_order: { bg: 'bg-blue-500/10', text: 'text-blue-300' },
  regulatory: { bg: 'bg-white/[0.06]', text: 'text-gray-300' },
  funding_announcement: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  funding: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  international: { bg: 'bg-white/[0.06]', text: 'text-gray-400' },
}

function formatAmount(usd) {
  if (!usd) return null
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`
  return `$${usd.toLocaleString()}`
}

export default function EventModal() {
  const event = useStore((s) => s.selectedEvent)
  const close = useStore((s) => s.setSelectedEvent)
  if (!event) return null

  const isPolicy = event._type === 'policy'
  const typeStyle = TYPE_COLORS[event.event_type] || { bg: 'bg-white/[0.06]', text: 'text-gray-400' }
  const amount = event.dollar_amount || event.amount_usd
  const entities = event.entities || []
  const investors = event.investors || []

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => close(null)}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-[#0e0e1a] border border-[#2a2a4a] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="h-0.5 bg-gradient-to-r from-blue-500 to-blue-700" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`gp-badge ${typeStyle.bg} ${typeStyle.text}`}>
                  {isPolicy ? (event.event_type || 'policy').replace(/_/g, ' ') : event.technology_type || 'investment'}
                </span>
                {event.sentiment && (
                  <span className={`text-[10px] font-mono ${event.sentiment === 'positive' ? 'text-blue-400' : event.sentiment === 'negative' ? 'text-red-400' : 'text-gray-500'}`}>
                    {event.sentiment === 'positive' ? '▲ POSITIVE' : event.sentiment === 'negative' ? '▼ NEGATIVE' : '● NEUTRAL'}
                  </span>
                )}
              </div>
              <h2 className="text-[15px] font-semibold text-gray-100 leading-snug">{event.title || event.summary}</h2>
            </div>
            <button onClick={() => close(null)} className="text-gray-500 hover:text-gray-300 text-lg leading-none p-1 -mt-1">✕</button>
          </div>

          <div className="flex items-center gap-4 mb-4 text-[11px] font-mono text-gray-500">
            {event.date && <span>{new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
            {amount && <span className="text-blue-400 font-semibold">{formatAmount(amount)}</span>}
            {event.company && <span className="text-gray-300">{event.company}</span>}
            {event.round_type && <span className="text-gray-500">{event.round_type.replace(/_/g, ' ')}</span>}
          </div>

          {event.summary && <p className="text-[13px] text-gray-300 leading-relaxed mb-4">{event.summary}</p>}

          {(entities.length > 0 || investors.length > 0) && (
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">{isPolicy ? 'Entities' : 'Investors'}</div>
              <div className="flex flex-wrap gap-1.5">
                {(isPolicy ? entities : investors).map((name, i) => (
                  <span key={i} className="px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded text-[11px] text-gray-400">{name}</span>
                ))}
              </div>
            </div>
          )}

          {/* Source attribution */}
          <div className="pt-3 border-t border-[#1a1a32] flex items-center justify-between">
            {event.source_url && !event.source_url.includes('example.com') ? (
              <a href={event.source_url} target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-blue-400 hover:text-blue-300 font-mono">VIEW SOURCE ↗</a>
            ) : (
              <span className="text-[10px] text-gray-600 font-mono">Source: Seeded data</span>
            )}
            <span className="text-[9px] text-gray-600 font-mono">
              {isPolicy ? 'via NewsAPI + Claude extraction' : 'via curated dataset'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
