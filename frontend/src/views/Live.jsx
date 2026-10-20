import { useEffect, useMemo } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useRoute, setParam } from '../lib/router'
import { useNow } from '../lib/hooks'
import { gw, num, pct, time } from '../lib/format'
import { isLive, mixSummary } from '../lib/derive'
import { FUELS, FUEL_LABEL, displayMix } from '../lib/fuels'
import TimeChart from '../components/TimeChart'
import { Board, Tile, SourceTag, FuelLegend, MixBar, Tag, Empty, Skeleton, LoadState } from '../components/ui'
import IsoTable from '../components/IsoTable'

const gwFormat = v => `${num(v / 1000, 1)} GW`
// What each operator's "load" figure covers, in plain words.
const LOAD_MEANS = {
  caiso: 'Load is current demand across most of California.',
  ercot: 'Load is system demand for most of Texas.',
  spp: 'Load is actual load across the central US.',
  miso: 'Load is total load across the Midwest and parts of the South.',
  nyiso: 'Load is the sum of New York\'s 11 zones.',
  isone: 'Load is metered demand for the six New England states; rooftop solar is not included.',
}

function scrollToIso(key) {
  const el = document.getElementById(key)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 1600)
}

function focusIso(key) {
  setParam('iso', key)
  scrollToIso(key)
}

function SummaryTile({ isos, sources }) {
  return (
    <Tile flush label="Grid operators · live" hint="Six regional grid operators report every 5 minutes. The bar shows where each one's electricity comes from right now; click a row for its chart.">
      <IsoTable isos={isos} sources={sources} onSelect={focusIso} detail />
    </Tile>
  )
}

function useIsoChart(series) {
  return useMemo(() => {
    const points = series || []
    const hasMix = p => p.mix && Object.keys(p.mix).length > 0
    // Every interval stays on the axis; a missing reading is a gap, never a line drawn across it.
    if (points.filter(hasMix).length >= 2) {
      const span = points.slice(points.findIndex(hasMix))
      const mixes = span.map(p => (hasMix(p) ? displayMix(p.mix) : null))
      const fuels = FUELS.filter(f => mixes.some(m => (m?.[f] || 0) > 0))
      return {
        mode: 'mix',
        x: span.map(p => Date.parse(p.t)),
        series: fuels.map(f => ({ label: FUEL_LABEL[f], values: mixes.map(m => (m ? m[f] ?? 0 : null)), color: `var(--fuel-${f})` })),
      }
    }
    const span = points.slice(points.findIndex(p => typeof p.load_mw === 'number'))
    return { mode: 'load', x: span.map(p => Date.parse(p.t)), series: [{ label: 'Load', values: span.map(p => p.load_mw ?? null) }] }
  }, [series])
}

function IsoTile({ iso, meta }) {
  const now = useNow()
  const s = mixSummary(iso.mix)
  const chart = useIsoChart(iso.series)
  const label = <>{iso.iso} <span className="u">· {iso.name}</span></>
  return (
    <Tile span={6} id={iso.key} label={label} hint={`${LOAD_MEANS[iso.key] || ''} ${chart.mode === 'mix' ? 'The chart stacks each fuel\'s output over the hours the operator publishes.' : 'This operator publishes only its latest mix, so the chart shows load and the bar below shows the mix.'}`} meta={<>{!isLive(iso, now) && <Tag tone="warn">delayed</Tag>}<SourceTag meta={meta} showLabel={false} /><span>{time(iso.observed_at)}</span></>}>
      {!iso.mix && !iso.series?.length ? <Empty>no data</Empty> : <>
        <div className="kv">
          <div><span className="label">Load · {time(iso.load_at || iso.observed_at)}</span><b>{gw(iso.load_mw)}<small>GW</small></b></div>
          <div><span className="label">Renew.</span><b>{pct(s?.renewable)}</b></div>
          <div><span className="label">Largest</span><b>{s ? FUEL_LABEL[s.top] : '—'}</b></div>
          {iso.price && <div title={iso.price.label}><span className="label">Price</span><b>{num(iso.price.usd_mwh, 2)}<small>$/MWh</small></b></div>}
        </div>
        <div className="legend"><span>{chart.mode === 'mix' ? 'Generation by fuel' : 'Load'} · GW · from {time(chart.x.length ? new Date(chart.x[0]).toISOString() : null)}</span></div>
        {chart.x.length >= 2
          ? <TimeChart x={chart.x} series={chart.series} stacked={chart.mode === 'mix'} area={chart.mode === 'load'} height={170} format={gwFormat}
              ariaLabel={`${iso.iso} ${chart.mode === 'mix' ? 'generation by fuel' : 'load'} today`} />
          : <Empty>too few intervals today</Empty>}
        {iso.mix && <>
          {/* Operators without mix history get their current mix as a bar, so the load chart is not read as a fuel chart. */}
          <div className="legend"><span>{chart.mode === 'mix' ? 'GW' : 'Generation by fuel, GW'} at {time(iso.mix_at || iso.observed_at)}</span></div>
          {chart.mode === 'load' && <MixBar mix={iso.mix} height={10} />}
          <FuelLegend mix={iso.mix} />
        </>}
      </>}
    </Tile>
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
    <>
      <LoadState res={res} what="live" />
      {!ready ? <Board><Tile label="Operators"><Skeleton height={240} /></Tile></Board> : (
        <Board>
          <SummaryTile isos={isos} sources={sources} />
          {isos.map(i => <IsoTile key={i.key} iso={i} meta={sources[`iso_${i.key}`]} />)}
        </Board>
      )}
    </>
  )
}
