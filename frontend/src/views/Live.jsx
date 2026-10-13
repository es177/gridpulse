import { useEffect, useMemo } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useRoute, setParam } from '../lib/router'
import { useNow } from '../lib/hooks'
import { gw, num, pct, time } from '../lib/format'
import { mixSummary } from '../lib/derive'
import { FUELS, FUEL_LABEL, displayMix } from '../lib/fuels'
import TimeChart from '../components/TimeChart'
import { Panel, SourceTag, MixBar, FuelLegend, Label, Empty, LoadState } from '../components/ui'
import './pages.css'

const gwFormat = v => `${num(v / 1000, 1)} GW`
const STALE_MS = 30 * 60_000
const LOAD_NOTE = {
  caiso: 'Load is current demand.',
  ercot: 'Load is system demand.',
  spp: 'Load is actual load.',
  miso: 'Load is total load.',
  nyiso: 'Load is the sum of 11 zone loads.',
  isone: 'Load is metered system load, excluding behind-the-meter solar.',
}
const IMPORTS = new Set(['caiso', 'miso', 'isone'])

const isStale = (iso, now) => !iso || now - Date.parse(iso) > STALE_MS

function scrollToIso(key) {
  const el = document.getElementById(key)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 1600)
}

function focusIso(key) {
  setParam('iso', key)
  scrollToIso(key)
}

function Delayed({ iso }) {
  const now = useNow()
  return isStale(iso, now) ? <Label tone="warn" title="No observation in the last 30 minutes">Delayed</Label> : null
}

function SummaryRow({ iso, meta }) {
  const now = useNow()
  const s = mixSummary(iso.mix)
  return (
    <tr className="clickable" onClick={() => focusIso(iso.key)}>
      <td><span className="source" style={{ color: 'var(--fg)', fontSize: 13 }}><SourceTag meta={meta} showLabel={false} />{iso.iso}</span></td>
      <td className="num">{gw(iso.load_mw)} <span className="subtle">GW</span></td>
      <td style={{ width: '30%' }}>{iso.mix ? <MixBar mix={iso.mix} /> : <span className="subtle">No data</span>}</td>
      <td className="num">{pct(s?.renewable)}</td>
      <td className="num hide-sm">{typeof iso.mix?.imports === 'number' ? <>{gw(iso.mix.imports)} <span className="subtle">GW</span></> : '—'}</td>
      <td className="num hide-sm">{iso.price ? <>${num(iso.price.usd_mwh, 2)} <span className="subtle">/MWh</span></> : '—'}</td>
      <td className={`num ${isStale(iso.observed_at, now) ? 'down' : 'muted'}`}>{time(iso.observed_at)}</td>
    </tr>
  )
}

function useIsoChart(series) {
  return useMemo(() => {
    const points = series || []
    const withMix = points.filter(p => p.mix && Object.keys(p.mix).length)
    if (withMix.length >= 2) {
      const mixes = withMix.map(p => displayMix(p.mix))
      const fuels = FUELS.filter(f => mixes.some(m => (m[f] || 0) > 0))
      return {
        mode: 'mix',
        x: withMix.map(p => Date.parse(p.t)),
        series: fuels.map(f => ({ label: FUEL_LABEL[f], values: mixes.map(m => m[f] ?? null), color: `var(--fuel-${f})` })),
      }
    }
    const loads = points.filter(p => typeof p.load_mw === 'number')
    return {
      mode: 'load',
      x: loads.map(p => Date.parse(p.t)),
      series: [{ label: 'Load', values: loads.map(p => p.load_mw), color: 'var(--series-1)' }],
    }
  }, [series])
}

function IsoPanel({ iso, meta }) {
  const s = mixSummary(iso.mix)
  const chart = useIsoChart(iso.series)
  const foot = `${LOAD_NOTE[iso.key] || ''}${IMPORTS.has(iso.key) ? ' Net imports reported.' : ''}`
  const title = (
    <>{iso.iso}<span className="title-sub">{iso.name}</span> <Delayed iso={iso.observed_at} /></>
  )
  return (
    <div id={iso.key} className="anchor">
      <Panel title={title} meta={<SourceTag meta={meta} name="Source" />} foot={foot}>
        {!iso.mix && !iso.series?.length ? <Empty>No data received from {iso.iso} yet.</Empty> : <>
          <div className="kv">
            <span>Load<b>{gw(iso.load_mw)}<small>GW</small></b></span>
            <span>Renewables<b>{pct(s?.renewable)}</b></span>
            <span>Largest<b style={{ fontFamily: 'var(--sans)' }}>{s ? FUEL_LABEL[s.top] : '—'}</b></span>
            {iso.price && <span title={iso.price.label}>Price<b>${num(iso.price.usd_mwh, 2)}<small>/MWh</small></b></span>}
            <span>As of<b>{time(iso.observed_at)}</b></span>
          </div>
          {chart.mode === 'load' && iso.mix && <p className="chart-note">Publishes only the latest mix. Chart shows load.</p>}
          {chart.x.length >= 2
            ? <TimeChart x={chart.x} series={chart.series} stacked={chart.mode === 'mix'} height={180} format={gwFormat}
                ariaLabel={`${iso.iso} ${chart.mode === 'mix' ? 'generation by fuel' : 'load'} today`} />
            : <Empty>Not enough intervals today to chart.</Empty>}
          {iso.mix && <div style={{ marginTop: 8 }}><FuelLegend mix={iso.mix} /></div>}
        </>}
      </Panel>
    </div>
  )
}

export default function Live() {
  const res = useResource('/api/live', EVERY.live)
  const { params } = useRoute()
  const isos = res.data?.isos || []
  const sources = res.data?.sources || {}
  const target = params.get('iso')
  const ready = isos.length > 0

  useEffect(() => {
    if (ready && target) scrollToIso(target)
  }, [ready, target])

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Live grid operators</h1>
        <p>Five-minute data from six US grid operators. PJM and the rest of the country are hourly on the <a href="#/grid">Grid</a> page.</p>
      </div>
      <LoadState res={res} what="operator data" />
      {!ready ? <div className="skeleton" style={{ height: 240 }} /> : <>
        <Panel title="Summary" flush>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Operator</th><th className="num">Load</th><th>Generation mix</th><th className="num">Renewables</th>
                <th className="num hide-sm">Net imports</th><th className="num hide-sm">Price</th><th className="num">Updated</th>
              </tr></thead>
              <tbody>{isos.map(i => <SummaryRow key={i.key} iso={i} meta={sources[`iso_${i.key}`]} />)}</tbody>
            </table>
          </div>
        </Panel>
        <div className="grid-2">
          {isos.map(i => <IsoPanel key={i.key} iso={i} meta={sources[`iso_${i.key}`]} />)}
        </div>
      </>}
    </div>
  )
}
