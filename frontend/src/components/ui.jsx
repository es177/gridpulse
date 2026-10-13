import { useNow } from '../lib/hooks'
import { ago, fullDate, num, observed } from '../lib/format'
import { sourceState, STATE_LABEL } from '../lib/status'
import { FUELS, FUEL_LABEL, displayMix, fuelVar } from '../lib/fuels'

export function Panel({ title, meta, foot, flush, children, id }) {
  return (
    <section className="panel" id={id}>
      <header className="panel-head">
        <h2>{title}</h2>
        {meta && <div className="meta">{meta}</div>}
      </header>
      <div className={flush ? 'panel-body flush' : 'panel-body'}>{children}</div>
      {foot && <div className="panel-foot">{foot}</div>}
    </section>
  )
}

export function Stat({ label, value, unit, sub, title }) {
  return (
    <div className="stat" title={title}>
      <div className="stat-label">{label}</div>
      <div className="stat-value num">{value ?? <span className="skeleton" style={{ display: 'inline-block', width: 72, height: 22 }} />}{unit && value != null && <small>{unit}</small>}</div>
      <div className="stat-sub">{sub || ' '}</div>
    </div>
  )
}

export function Ago({ iso }) {
  const now = useNow()
  return iso ? <time dateTime={iso} title={fullDate(iso)}>{ago(iso, now)}</time> : <span>—</span>
}

/** Status dot + short label + observation age. Hover for the full record. */
export function SourceTag({ meta, name, showLabel = true }) {
  const now = useNow()
  const state = sourceState(meta, now)
  const stamp = meta?.observed_at || meta?.fetched_at
  const detail = meta ? [
    meta.label,
    `${STATE_LABEL[state]} · ${meta.cadence}`,
    meta.observed_at && `Observed ${meta.resolution === 'time' || !meta.resolution ? fullDate(meta.observed_at) : observed(meta)}`,
    meta.fetched_at && `Retrieved ${fullDate(meta.fetched_at)}`,
    meta.error && `Last attempt failed: ${meta.error}`,
  ].filter(Boolean).join('\n') : 'Waiting for data'
  return (
    <span className="source" title={detail}>
      <span className={`dot ${state}`} aria-label={STATE_LABEL[state]} />
      {showLabel && (meta?.url ? <a href={meta.url} target="_blank" rel="noreferrer">{name || meta.label}</a> : <span>{name || meta?.label}</span>)}
      {showLabel && stamp && <span className="mono">{meta.observed_at && (meta.resolution === 'day' || meta.resolution === 'month') ? observed(meta) : ago(stamp, now)}</span>}
    </span>
  )
}

export function Label({ tone = '', children, title }) {
  return <span className={`label ${tone}`} title={title}>{children}</span>
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function Notice({ children }) {
  return <div className="notice" role="status"><span className="dot stale" style={{ marginTop: 6 }} /><div>{children}</div></div>
}

/** Fetch error banner shown only when we have nothing or the last refresh failed. */
export function LoadState({ res, what }) {
  if (res.error && res.data) return <Notice>Could not refresh {what} ({res.error}). Showing the last data received.</Notice>
  if (res.error) return <Notice>Could not load {what} ({res.error}). Retrying automatically.</Notice>
  return null
}

export function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>
      ))}
    </div>
  )
}

export function Th({ k, sort, onSort, children, num: numeric, className = '' }) {
  const active = sort.key === k
  return (
    <th className={`${numeric ? 'num' : ''} ${className}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)}>
        {children}<span className="arrow">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  )
}

/** Tiny line chart. Gaps (null) break the line instead of interpolating. */
export function Spark({ values = [], width = 96, height = 22, min, max, accent }) {
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
    <svg className={`spark${accent ? ' accent' : ''}`} width={width} height={height} aria-hidden="true">
      <path d={d} />
      {last && <circle cx={last[0]} cy={last[1]} r="2" />}
    </svg>
  )
}

/** Horizontal stacked bar of positive output by fuel, 2px gaps between segments. */
export function MixBar({ mix, height = 10 }) {
  const m = displayMix(mix)
  const parts = FUELS.map(f => [f, Math.max(m[f] || 0, 0)]).filter(([, v]) => v > 0)
  const total = parts.reduce((s, [, v]) => s + v, 0)
  if (!total) return <div className="mixbar" style={{ height }} />
  return (
    <div className="mixbar" style={{ height }} role="img"
      aria-label={parts.map(([f, v]) => `${FUEL_LABEL[f]} ${num(v / total * 100)}%`).join(', ')}>
      {parts.map(([f, v]) => (
        <span key={f} style={{ flex: v, background: fuelVar(f) }} title={`${FUEL_LABEL[f]}: ${num(v)} MW (${num(v / total * 100, 1)}%)`} />
      ))}
    </div>
  )
}

export function FuelLegend({ mix, unit = 'GW', scale = 1000, digits = 1 }) {
  const m = displayMix(mix)
  return (
    <div className="legend">
      {FUELS.filter(f => m[f] !== undefined && Math.abs(m[f]) >= 0.5).map(f => (
        <span key={f}><i style={{ background: fuelVar(f) }} />{FUEL_LABEL[f]} <b>{num(m[f] / scale, digits)}</b>{unit && <span className="subtle">{unit}</span>}</span>
      ))}
    </div>
  )
}

export const Icon = {
  pulse: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12h4l2.5-6 4.5 12 3-8 1.5 2H22" />
    </svg>
  ),
  sync: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M13.5 6.5A5.5 5.5 0 0 0 3 5M2.5 9.5A5.5 5.5 0 0 0 13 11" /><path d="M3 2v3h3M13 14v-3h-3" />
    </svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10" />
    </svg>
  ),
}
