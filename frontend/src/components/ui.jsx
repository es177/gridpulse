import { useNow } from '../lib/hooks'
import { age, fullDate, num, observed, time } from '../lib/format'
import { sourceState, STATE_LABEL } from '../lib/status'
import { FUELS, FUEL_LABEL, displayMix, fuelVar } from '../lib/fuels'

/** A grid of tiles separated by hairlines. Spans are out of 12 columns. */
export function Board({ children }) {
  return <div className="board">{children}</div>
}

/** hint: one plain-language line, shown only in explain mode. */
export function Tile({ label, hint, meta, span = 12, rows, flush, id, className = '', children }) {
  const cls = ['tile', span !== 12 && `s${span}`, rows && `r${rows}`, className].filter(Boolean).join(' ')
  return (
    <section className={cls} id={id}>
      {label && (
        <header className="tile-head">
          <h2 className="tile-label">{label}</h2>
          {meta && <div className="tile-meta">{meta}</div>}
        </header>
      )}
      {hint && <p className="hint">{hint}</p>}
      <div className={flush ? 'tile-body flush' : 'tile-body'}>{children}</div>
    </section>
  )
}

export function Metrics({ children }) {
  return <section className="tile"><div className="metrics">{children}</div></section>
}

/** value: null while loading (skeleton), '—' when missing. */
export function Metric({ label, value, unit, note, hint, tone }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className={tone ? `metric-value ${tone}` : 'metric-value'}>
        {value ?? <span className="skeleton" style={{ display: 'inline-block', width: 72, height: 20 }} />}
        {unit && value != null && value !== '—' && <small>{unit}</small>}
      </div>
      <div className="metric-note">{note || ' '}</div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

/** Status dot, source name and age of its newest observation. Hover for the full record. */
export function SourceTag({ meta, name, showLabel = true }) {
  const now = useNow()
  const state = sourceState(meta, now)
  const stamp = meta?.observed_at || meta?.fetched_at
  const detail = meta ? [
    meta.label,
    `${STATE_LABEL[state]} · ${meta.cadence}`,
    meta.observed_at && `Observed ${meta.resolution === 'time' || !meta.resolution ? fullDate(meta.observed_at) : observed(meta)}`,
    meta.fetched_at && `Retrieved ${fullDate(meta.fetched_at)}`,
    meta.error && `Last attempt: ${meta.error}`,
  ].filter(Boolean).join('\n') : 'Waiting'
  const when = meta?.observed_at && (meta.resolution === 'day' || meta.resolution === 'month') ? observed(meta) : age(stamp, now)
  return (
    <span className="src" title={detail}>
      <span className={`dot ${state}`} aria-label={STATE_LABEL[state]} />
      {showLabel && <Ext href={meta?.url}>{name || meta?.label}</Ext>}
      {showLabel && stamp && <span>{when}</span>}
    </span>
  )
}

/** Link to an outside page; anything but an https URL renders as plain text. */
export function Ext({ href, className, children }) {
  return /^https:\/\//.test(href || '')
    ? <a className={className} href={href} target="_blank" rel="noreferrer">{children}</a>
    : <span className={className}>{children}</span>
}

export function Tag({ tone = '', children }) {
  return <span className={tone ? `tag ${tone}` : 'tag'}>{children}</span>
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function Banner({ children }) {
  return <div className="banner" role="status"><span className="dot warn" />{children}</div>
}

/** One line when a request failed: what, why, and what is on screen instead. */
export function LoadState({ res, what }) {
  if (!res.error) return null
  const kept = res.data && res.at ? ` · showing ${time(new Date(res.at).toISOString())}` : ' · retrying'
  return <Banner>{what}: {res.error}{kept}</Banner>
}

export function Skeleton({ height = 200 }) {
  return <div className="skeleton" style={{ height, margin: 12 }} />
}

export function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([key, text, count]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>
          {text}{count != null && <span className="n">{count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Th({ k, sort, onSort, children, num: numeric, className = '' }) {
  const active = sort.key === k
  return (
    <th className={`${numeric ? 'num' : ''} ${className}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)}>
        {children}{active && <span aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  )
}

/** Unit suffix inside an uppercase column head, kept in its own case. */
export const U = ({ children }) => <span className="u">{children}</span>

/** Proportion bar for table cells; tone is a status class. */
export function Meter({ value, max = 100, tone = '' }) {
  if (typeof value !== 'number') return <span className="meter" />
  return <span className="meter"><span className={tone} style={{ width: `${Math.min(Math.max(value / max, 0), 1) * 100}%` }} /></span>
}

/** Tiny line chart. Gaps (null) break the line instead of interpolating. */
export function Spark({ values = [], width = 96, height = 20, min, max }) {
  const known = values.filter(v => typeof v === 'number')
  if (known.length < 2) return <svg className="spark" width={width} height={height} aria-hidden="true" />
  const lo = min ?? Math.min(...known), hi = max ?? Math.max(...known)
  const span = hi - lo || 1
  const x = i => (i / (values.length - 1)) * (width - 3) + 1.5
  const y = v => height - 2 - ((v - lo) / span) * (height - 4)
  let d = '', pen = false, last = null
  values.forEach((v, i) => {
    if (typeof v !== 'number') { pen = false; return }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    pen = true
    last = [x(i), y(v)]
  })
  return (
    <svg className="spark" width={width} height={height} aria-hidden="true">
      <path d={d} />
      {last && <circle cx={last[0]} cy={last[1]} r="1.75" />}
    </svg>
  )
}

/** Horizontal stacked bar of positive output by fuel, 1px gaps between segments. */
export function MixBar({ mix, height = 8 }) {
  const m = displayMix(mix)
  const parts = FUELS.map(f => [f, Math.max(m[f] || 0, 0)]).filter(([, v]) => v > 0)
  const total = parts.reduce((s, [, v]) => s + v, 0)
  if (!total) return <div className="mixbar" style={{ height }} />
  return (
    <div className="mixbar" style={{ height }} role="img"
      aria-label={parts.map(([f, v]) => `${FUEL_LABEL[f]} ${num(v / total * 100)}%`).join(', ')}>
      {parts.map(([f, v]) => (
        <span key={f} style={{ flex: v, background: fuelVar(f) }} title={`${FUEL_LABEL[f]} ${num(v)} MW · ${num(v / total * 100, 1)}%`} />
      ))}
    </div>
  )
}

export function FuelLegend({ mix, scale = 1000, digits = 1 }) {
  const m = displayMix(mix)
  return (
    <div className="legend">
      {FUELS.filter(f => m[f] !== undefined && Math.abs(m[f]) >= 0.5).map(f => (
        <span key={f}><i style={{ background: fuelVar(f) }} />{FUEL_LABEL[f]} <b>{num(m[f] / scale, digits)}</b></span>
      ))}
    </div>
  )
}

/** Legend for line charts: [label, color, dashed]. */
export function LineLegend({ items }) {
  return (
    <div className="legend">
      {items.map(([label, color, dashed]) => (
        <span key={label}><i className={dashed ? 'dash' : 'line'} style={{ borderColor: color }} />{label}</span>
      ))}
    </div>
  )
}

export const Icon = {
  pulse: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      <path d="M2 12h5l2.5-6 4.5 12 3-8 1.5 2H22" />
    </svg>
  ),
  sync: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M13.5 6.5A5.5 5.5 0 0 0 3 5M2.5 9.5A5.5 5.5 0 0 0 13 11" /><path d="M3 2v3h3M13 14v-3h-3" />
    </svg>
  ),
  download: (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10" />
    </svg>
  ),
}
