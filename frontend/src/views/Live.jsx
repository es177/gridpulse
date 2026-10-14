import { useEffect, useMemo } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useRoute, setParam } from '../lib/router'
import { useNow } from '../lib/hooks'
import { gw, num, pct, time } from '../lib/format'
import { mixSummary } from '../lib/derive'
import { FUELS, FUEL_LABEL, displayMix } from '../lib/fuels'
import TimeChart from '../components/TimeChart'
import { Board, Tile, SourceTag, MixBar, FuelLegend, Tag, Empty, Skeleton, LoadState, U } from '../components/ui'

const gwFormat = v => `${num(v / 1000, 1)} GW`
const STALE_MS = 30 * 60_000
const LOAD_MEANS = {
  caiso: 'Current demand',
  ercot: 'System demand',
  spp: 'Actual load',
  miso: 'Total load',
  nyiso: 'Sum of 11 zone loads',
  isone: 'Metered system load, excluding behind-the-meter solar',
}

const isStale = (iso, now) => !iso || now - Date.parse(iso) > STALE_MS

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
  const now = useNow()
  return (
    <Tile flush label="Operators · 5 min">
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>ISO</th><th className="num">Load <U>GW</U></th><th style={{ width: '32%' }}>Mix</th><th className="num">Renew.</th>
            <th className="num hide-sm">Net imp. <U>GW</U></th><th className="num hide-sm">Price <U>$/MWh</U></th><th className="num">Time</th>
          </tr></thead>
          <tbody>
            {isos.map(iso => {
              const s = mixSummary(iso.mix)
              return (
                <tr key={iso.key} className="clickable" onClick={() => focusIso(iso.key)}>
                  <td><span className="src" style={{ color: 'var(--fg)', fontSize: 13, fontFamily: 'var(--sans)' }}><SourceTag meta={sources[`iso_${iso.key}`]} showLabel={false} />{iso.iso}</span></td>
                  <td className="num">{gw(iso.load_mw)}</td>
                  <td>{iso.mix ? <MixBar mix={iso.mix} /> : <span className="subtle mono">—</span>}</td>
                  <td className="num">{pct(s?.renewable)}</td>
                  <td className="num hide-sm">{typeof iso.mix?.imports === 'number' ? gw(iso.mix.imports) : '—'}</td>
                  <td className="num hide-sm">{iso.price ? num(iso.price.usd_mwh, 2) : '—'}</td>
                  <td className={`num ${isStale(iso.observed_at, now) ? 'warn' : 'subtle'}`}>{time(iso.observed_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Tile>
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
    return { mode: 'load', x: loads.map(p => Date.parse(p.t)), series: [{ label: 'Load', values: loads.map(p => p.load_mw) }] }
  }, [series])
}

function IsoTile({ iso, meta }) {
  const now = useNow()
  const s = mixSummary(iso.mix)
  const chart = useIsoChart(iso.series)
  const label = <>{iso.iso} <span className="u">· {iso.name}</span></>
  return (
    <Tile span={6} id={iso.key} label={label} meta={<>{isStale(iso.observed_at, now) && <Tag tone="warn">delayed</Tag>}<SourceTag meta={meta} showLabel={false} /><span>{time(iso.observed_at)}</span></>}>
      {!iso.mix && !iso.series?.length ? <Empty>no data</Empty> : <>
        <div className="kv">
          <div title={LOAD_MEANS[iso.key]}><span className="label">Load</span><b>{gw(iso.load_mw)}<small>GW</small></b></div>
          <div><span className="label">Renew.</span><b>{pct(s?.renewable)}</b></div>
          <div><span className="label">Top</span><b>{s ? FUEL_LABEL[s.top] : '—'}</b></div>
          {iso.price && <div title={iso.price.label}><span className="label">Price</span><b>{num(iso.price.usd_mwh, 2)}<small>$/MWh</small></b></div>}
        </div>
        {chart.x.length >= 2
          ? <TimeChart x={chart.x} series={chart.series} stacked={chart.mode === 'mix'} area={chart.mode === 'load'} height={170} format={gwFormat}
              ariaLabel={`${iso.iso} ${chart.mode === 'mix' ? 'generation by fuel' : 'load'} today`} />
          : <Empty>too few intervals today</Empty>}
        {chart.mode === 'load' && <div className="legend"><span>load · mix history not published</span></div>}
        {iso.mix && <FuelLegend mix={iso.mix} />}
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
