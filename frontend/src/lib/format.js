// Formatting. Missing values always render as an em dash, never as zero.
const DASH = '—'
const finite = n => typeof n === 'number' && Number.isFinite(n)

export function num(n, digits = 0) {
  if (!finite(n)) return DASH
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
export const gw = (mw, digits = 1) => (finite(mw) ? num(mw / 1000, digits) : DASH)
export const pct = (n, digits = 0) => (finite(n) ? `${num(n, digits)}%` : DASH)
export function signed(n, digits = 1, unit = '') {
  if (!finite(n)) return DASH
  const rounded = Number(n.toFixed(digits))   // never show −0.0
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${num(Math.abs(rounded), digits)}${unit}`
}

export function ago(iso, now = Date.now()) {
  if (!iso) return DASH
  const s = Math.round((now - Date.parse(iso)) / 1000)
  if (!Number.isFinite(s)) return DASH
  if (s < -60) return 'in future'
  if (s < 60) return `${Math.max(s, 0)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400 * 2) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/** Age without the suffix, for tight spaces: "4m", "2h". */
export const age = (iso, now = Date.now()) => ago(iso, now).replace(' ago', '')

// Times use a 24-hour clock in the viewer's timezone.
const fmt = opts => new Intl.DateTimeFormat('en-US', opts)
const H23 = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
const clock = fmt(H23)
const dayTime = fmt({ month: 'short', day: 'numeric', ...H23 })
const dayOnly = fmt({ month: 'short', day: 'numeric' })
const dayYear = fmt({ month: 'short', day: 'numeric', year: 'numeric' })
const monthShort = fmt({ month: 'short', year: '2-digit' })
const full = fmt({ year: 'numeric', month: 'short', day: 'numeric', ...H23, timeZoneName: 'short' })
const valid = iso => iso && Number.isFinite(Date.parse(iso))
export const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'

/** Axis tick labels: clock times within a day, dates across days, months across months. */
export function tick(seconds, step) {
  const d = new Date(seconds * 1000)
  if (step >= 360 * 86400) return String(d.getUTCFullYear())
  if (step >= 28 * 86400) return monthShort.format(d)
  if (step >= 86400 || (d.getHours() === 0 && d.getMinutes() === 0)) return dayOnly.format(d)
  return clock.format(d)
}

export const time = iso => (valid(iso) ? clock.format(new Date(iso)) : DASH)
export const when = iso => (valid(iso) ? dayTime.format(new Date(iso)) : DASH)
export const fullDate = iso => (valid(iso) ? full.format(new Date(iso)) : DASH)
// Calendar dates (YYYY-MM-DD) are not instants; format them without a timezone shift.
export function date(ymd, withYear = false) {
  if (!ymd) return DASH
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  const value = new Date(y, m - 1, d || 1)
  return (withYear ? dayYear : dayOnly).format(value)
}
export function month(ym) {
  if (!ym) return DASH
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

/** A source's newest observation at the precision the source reports it. */
export function observed(meta) {
  const iso = meta?.observed_at
  if (!iso) return DASH
  if (meta.resolution === 'year') return iso.slice(0, 4)
  if (meta.resolution === 'month') return month(iso.slice(0, 7))
  if (meta.resolution === 'day') return date(iso.slice(0, 10))
  return when(iso)
}
