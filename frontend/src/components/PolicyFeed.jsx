import useStore from '../store/useStore'

// Simplified: blue for policy, red accents for urgency, white text
const TYPE_BADGE = {
  legislation: 'bg-blue-500/10 text-blue-400',
  executive_order: 'bg-blue-500/10 text-blue-300',
  regulatory: 'bg-white/[0.06] text-gray-300',
  funding_announcement: 'bg-blue-500/10 text-blue-400',
  funding: 'bg-blue-500/10 text-blue-400',
  international: 'bg-white/[0.06] text-gray-400',
}

const TECH_BADGE = {
  nuclear: 'bg-blue-500/10 text-blue-400',
  fusion: 'bg-blue-500/10 text-blue-300',
  solar: 'bg-white/[0.06] text-gray-300',
  wind: 'bg-white/[0.06] text-gray-300',
  geothermal: 'bg-red-500/10 text-red-400',
  hydrogen: 'bg-white/[0.06] text-gray-300',
  storage: 'bg-white/[0.06] text-gray-400',
  other: 'bg-white/[0.04] text-gray-500',
}

function formatAmount(usd) {
  if (!usd) return null
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`
  return `$${(usd / 1e3).toFixed(0)}K`
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return '1d'
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

export default function PolicyFeed() {
  const policyEvents = useStore((s) => s.policyEvents)
  const investments = useStore((s) => s.investments)
  const setSelectedEvent = useStore((s) => s.setSelectedEvent)

  const items = [
    ...policyEvents.map((e) => ({ ...e, _type: 'policy' })),
    ...investments.map((e) => ({ ...e, _type: 'investment', title: e.summary })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date))

  if (!items.length) {
    return (
      <div className="gp-panel p-4 h-full">
        <div className="gp-panel-header mb-3">Activity Feed</div>
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="gp-skeleton h-14 w-full" />)}</div>
      </div>
    )
  }

  return (
    <div className="gp-panel flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[#1a1a32]">
        <div className="gp-panel-header">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Activity Feed
        </div>
        <a href="https://newsapi.org/" target="_blank" rel="noopener noreferrer"
          className="text-[9px] font-mono text-gray-600 hover:text-blue-400 transition-colors">SOURCE: NEWSAPI + AI ↗</a>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {items.slice(0, 40).map((item, i) => {
          const isPolicy = item._type === 'policy'
          const amount = item.dollar_amount || item.amount_usd
          return (
            <button key={i} onClick={() => setSelectedEvent(item)}
              className="w-full text-left px-4 py-2.5 border-b border-white/[0.02] hover:bg-blue-500/[0.03] transition-colors group">
              <div className="flex items-center gap-2 mb-1">
                <span className={`gp-badge ${isPolicy ? TYPE_BADGE[item.event_type] || 'bg-white/[0.04] text-gray-400' : TECH_BADGE[item.technology_type] || 'bg-white/[0.04] text-gray-400'}`}>
                  {isPolicy ? (item.event_type || 'policy').replace(/_/g, ' ') : item.technology_type || 'deal'}
                </span>
                {amount && <span className="font-mono text-[10px] text-blue-400 font-semibold">{formatAmount(amount)}</span>}
                <span className="text-[10px] font-mono text-gray-600 ml-auto shrink-0">{timeAgo(item.date)}</span>
              </div>
              <div className="text-[12px] text-gray-400 leading-snug line-clamp-2 group-hover:text-gray-300 transition-colors">
                {item.title || item.summary}
              </div>
              {/* Source link */}
              {item.source_url && !item.source_url.includes('example.com') && (
                <div className="mt-1 text-[9px] font-mono text-gray-600 truncate">{new URL(item.source_url).hostname}</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
