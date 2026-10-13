import test from 'node:test'
import assert from 'node:assert/strict'
import { regionRows, mixSummary, liveTotals, reactorChanges, filterUnits, byDay, filterItems, toCSV } from '../frontend/src/lib/derive.js'
import { sourceState } from '../frontend/src/lib/status.js'
import { signed, date, month, gw, pct, ago } from '../frontend/src/lib/format.js'

const H = 3_600_000
const hour = n => new Date(Date.UTC(2026, 9, 12, 0) + n * H).toISOString().replace('.000Z', '+00:00')
const series = (fn, n = 30) => Array.from({ length: n }, (_, i) => ({ t: hour(i), ...fn(i) }))

test('region rows: latest hour, 24h peak, forecast error only for single areas, imports sign', () => {
  const pjm = series(i => ({ d: 1000 + i, df: 1000, ng: 900, ti: -50 }))
  const rows = regionRows([
    { id: 'US48', name: 'Lower 48', series: series(i => ({ d: 5000 + i, df: 4000 })), latest: { t: hour(29), d: 5029, df: 4000 } },
    { id: 'PJM', name: 'PJM', series: [...pjm, { t: hour(30), d: null, df: 1100 }], latest: pjm[29], latest_balance: { t: hour(5), ng: 900, ti: -50 } },
  ])
  assert.equal(rows[0].err, null)                   // Lower 48 forecast is a partial sum
  assert.equal(rows[1].err.toFixed(1), '2.9')        // 1029 vs 1000
  assert.equal(rows[1].peak, 1029)
  assert.equal(rows[1].min, 1006)                    // only the last 24 hours
  assert.equal(rows[1].next, 1100)
  assert.equal(rows[1].imports, 50)                  // negative interchange = net imports
  assert.equal(rows[1].spark.length, 30)             // forecast-only hours excluded
})

test('mix summary excludes imports and charging from shares', () => {
  const s = mixSummary({ gas: 50, wind: 30, solar: 20, imports: 40, storage: -10, oil: 0 })
  assert.equal(s.total, 100)
  assert.equal(s.renewable, 50)
  assert.equal(s.top, 'gas')
  assert.equal(mixSummary({}), null)
})

test('live totals ignore operators older than 30 minutes', () => {
  const now = Date.parse('2026-10-13T02:00:00Z')
  const totals = liveTotals([
    { observed_at: '2026-10-13T01:55:00Z', load_mw: 100, mix: { wind: 50, gas: 50 } },
    { observed_at: '2026-10-13T00:55:00Z', load_mw: 999, mix: { gas: 999 } },
  ], now)
  assert.equal(totals.count, 1)
  assert.equal(totals.load, 100)
  assert.equal(totals.summary.renewable, 50)
})

test('source state uses the viewer clock and observation precision', () => {
  const now = Date.parse('2026-10-13T02:00:00Z')
  const meta = { has_data: true, observed_at: '2026-10-13T01:00:00Z', stale_after: 4 * 3600, error: null }
  assert.equal(sourceState(meta, now), 'ok')
  assert.equal(sourceState({ ...meta, error: 'HTTP 429' }, now), 'degraded')
  assert.equal(sourceState({ ...meta, observed_at: '2026-10-12T20:00:00Z' }, now), 'stale')
  assert.equal(sourceState({ has_data: false, error: 'timeout' }, now), 'down')
  assert.equal(sourceState({ has_data: true, observed_at: null, fetched_at: '2026-10-13T01:59:00Z', stale_after: 60 }, now), 'ok')
  assert.equal(sourceState(undefined, now), 'pending')
})

test('reactor helpers', () => {
  const units = [
    { name: 'Vogtle 3', state: 'GA', operator: 'Southern', type: 'PWR', status: 'full', change: 0 },
    { name: 'Palo Verde 1', state: 'AZ', operator: 'APS', type: 'PWR', status: 'offline', change: -100 },
    { name: 'Hatch 2', state: 'GA', operator: 'Southern', type: 'BWR', status: 'reduced', change: -1 },
  ]
  assert.deepEqual(reactorChanges(units).map(u => u.name), ['Palo Verde 1', 'Hatch 2'])
  assert.deepEqual(filterUnits(units, { q: 'ga southern' }).map(u => u.name), ['Vogtle 3', 'Hatch 2'])
  assert.deepEqual(filterUnits(units, { status: 'offline' }).map(u => u.name), ['Palo Verde 1'])
})

test('feed grouping and filters', () => {
  const items = [
    { title: 'Reactor restart', summary: '', source: 'NRC News', published: '2026-10-12T15:00:00Z', tags: ['nuclear'] },
    { title: 'Capacity alert', summary: 'PJM', source: 'PJM Inside Lines', published: '2026-10-12T14:00:00Z', tags: ['grid'] },
    { title: 'Older', summary: '', source: 'NRC News', published: '2026-10-09T12:00:00Z', tags: [] },
  ]
  assert.equal(byDay(items).length, 2)
  assert.equal(filterItems(items, { source: 'NRC News' }).length, 2)
  assert.equal(filterItems(items, { tag: 'grid', q: 'pjm' }).length, 1)
})

test('formatting never invents values', () => {
  assert.equal(signed(2.345, 1, '%'), '+2.3%')
  assert.equal(signed(-1, 0), '−1')
  assert.equal(signed(null), '—')
  assert.equal(signed(-0.03, 1, '%'), '±0.0%')
  assert.equal(gw(undefined), '—')
  assert.equal(pct(NaN), '—')
  assert.equal(date('2026-10-09'), 'Oct 9')          // calendar dates do not shift by timezone
  assert.equal(month('2026-07'), 'July 2026')
  assert.equal(ago('2026-10-13T01:58:00Z', Date.parse('2026-10-13T02:00:00Z')), '2m ago')
  assert.equal(toCSV([{ a: 'x,y', b: null }], ['a', 'b']), 'a,b\n"x,y",')
})
