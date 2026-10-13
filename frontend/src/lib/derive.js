// Pure calculations on API payloads. No React, so they are unit-tested directly.
import { displayMix, RENEWABLE } from './fuels.js'

const HOUR = 3_600_000
const isNum = v => typeof v === 'number' && Number.isFinite(v)

/** Latest demand, forecast error, 24h range and sparkline per EIA region. */
export function regionRows(regions = []) {
  return regions.map(r => {
    const latest = r.latest || {}
    const end = Date.parse(latest.t)
    const day = r.series.filter(p => isNum(p.d) && Date.parse(p.t) > end - 24 * HOUR && Date.parse(p.t) <= end)
    const peak = day.reduce((best, p) => (!best || p.d > best.d ? p : best), null)
    // US48 day-ahead forecasts are partial sums of reporting areas, so no error is shown.
    const err = r.id !== 'US48' && isNum(latest.df) && isNum(latest.d) && latest.df > 0
      ? (latest.d / latest.df - 1) * 100 : null
    const ahead = r.series.find(p => Date.parse(p.t) === end + HOUR)
    const balance = r.latest_balance
    return {
      id: r.id, name: r.name, t: latest.t, d: latest.d, df: latest.df, err,
      next: ahead && isNum(ahead.df) ? ahead.df : null,
      peak: peak?.d ?? null, peakT: peak?.t ?? null,
      min: day.length ? Math.min(...day.map(p => p.d)) : null,
      spark: r.series.filter(p => Date.parse(p.t) <= end).map(p => p.d ?? null),
      imports: balance && isNum(balance.ti) ? -balance.ti : null,
      balanceT: balance?.t ?? null,
    }
  })
}

/** Share of positive output by display fuel, plus renewable share. */
export function mixSummary(mix) {
  const m = displayMix(mix)
  const positive = Object.entries(m).filter(([k, v]) => v > 0 && k !== 'imports')
  const total = positive.reduce((s, [, v]) => s + v, 0)
  if (!total) return null
  const share = Object.fromEntries(positive.map(([k, v]) => [k, v / total * 100]))
  const top = positive.sort((a, b) => b[1] - a[1])[0][0]
  return { total, share, top, renewable: RENEWABLE.reduce((s, k) => s + (share[k] || 0), 0) }
}

/** ISOs whose latest observation is recent enough to call live. */
export function liveIsos(isos = [], now = Date.now(), maxAgeMin = 30) {
  return isos.filter(i => i.observed_at && now - Date.parse(i.observed_at) < maxAgeMin * 60_000)
}

/** Combined load and mix across live ISOs. */
export function liveTotals(isos, now) {
  const live = liveIsos(isos, now)
  const load = live.reduce((s, i) => s + (isNum(i.load_mw) ? i.load_mw : 0), 0)
  const mix = {}
  for (const i of live) for (const [k, v] of Object.entries(i.mix || {})) mix[k] = (mix[k] || 0) + v
  return { count: live.length, load: live.length ? load : null, summary: mixSummary(mix) }
}

/** Units whose power changed since the previous NRC report, largest change first. */
export function reactorChanges(units = []) {
  return units.filter(u => u.change).sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
}

export function filterUnits(units, { q = '', status = 'all' } = {}) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  return units.filter(u => (status === 'all' || u.status === status) &&
    terms.every(t => `${u.name} ${u.state || ''} ${u.operator || ''} ${u.type || ''} ${u.docket || ''}`.toLowerCase().includes(t)))
}

/** Group feed items by local calendar day, newest first. */
export function byDay(items) {
  const groups = []
  for (const item of items) {
    const key = new Date(item.published).toDateString()
    if (groups.at(-1)?.key !== key) groups.push({ key, date: item.published, items: [] })
    groups.at(-1).items.push(item)
  }
  return groups
}

export function filterItems(items, { q = '', source = '', tag = '' } = {}) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(i => (!source || i.source === source) && (!tag || i.tags?.includes(tag)) &&
    terms.every(t => `${i.title} ${i.summary || ''} ${i.source}`.toLowerCase().includes(t)))
}

export function counts(items, key) {
  const out = new Map()
  for (const i of items) for (const v of [].concat(i[key] || [])) out.set(v, (out.get(v) || 0) + 1)
  return [...out].sort((a, b) => b[1] - a[1])
}

export function toCSV(rows, columns) {
  const cell = v => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  return [columns.join(','), ...rows.map(r => columns.map(c => cell(r[c])).join(','))].join('\n')
}

export function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
