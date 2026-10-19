import { useMemo } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useRoute, setParam } from '../lib/router'
import { gw, num, signed, time, when } from '../lib/format'
import { regionLabel, regionRows, toCSV, download } from '../lib/derive'
import { FUELS, FUEL_LABEL, displayMix } from '../lib/fuels'
import TimeChart from '../components/TimeChart'
import { Board, Tile, Metrics, Metric, SourceTag, Seg, LoadState, FuelLegend, LineLegend, Empty, Icon } from '../components/ui'
import reference from '../data/reference.json'

const gwAxis = v => `${num(v / 1000, 0)} GW`
const gwTip = v => `${num(v / 1000, 1)} GW`
const gwSigned = v => `${signed(v / 1000, 1)} GW`

function DemandTile({ region, meta }) {
  const partial = region.id === 'US48'  // its forecast sums only the areas that have reported
  const { x, series } = useMemo(() => {
    const pts = region.series
    return {
      x: pts.map(p => Date.parse(p.t)),
      series: [
        { label: 'Demand', values: pts.map(p => p.d), width: 2 },
        ...(partial ? [] : [{ label: 'Forecast', values: pts.map(p => p.df), color: 'var(--fg-2)', dash: true, width: 1.25 }]),
        { label: 'Net generation', values: pts.map(p => p.ng), color: 'var(--fg-3)', width: 1.25 },
      ],
    }
  }, [region, partial])
  return (
    <Tile label={<>Demand · <b>{regionLabel(region)}</b> · 3 days</>} meta={<SourceTag meta={meta} name="EIA-930" />}
      hint={`Demand is electricity used; net generation is electricity produced inside the region, published about a day later. The gap is traded with neighbors.${partial ? ' No US forecast is drawn because it leaves out areas that have not reported.' : ' The dashed line is the day-ahead forecast.'}`}>
      <LineLegend items={[['Demand', 'var(--fg)'], ...(partial ? [] : [['Forecast', 'var(--fg-2)', true]]), ['Net generation', 'var(--fg-3)']]} />
      <TimeChart x={x} series={series} height={280} format={gwTip} axisFormat={gwAxis} ariaLabel={`${region.name} hourly demand${partial ? '' : ', forecast'} and net generation`} />
    </Tile>
  )
}

function ImportsTile({ region }) {
  const { x, series, any } = useMemo(() => {
    const pts = region.series.filter(p => typeof p.ti === 'number')
    return { any: pts.length > 0, x: pts.map(p => Date.parse(p.t)), series: [{ label: 'Net imports', values: pts.map(p => -p.ti) }] }
  }, [region])
  return (
    <Tile span={6} label={<>Net imports · <b>{regionLabel(region)}</b></>} hint="Above zero the region buys power from its neighbors; below zero it sells to them.">
      {any ? <TimeChart x={x} series={series} area height={160} format={gwSigned} ariaLabel={`${region.name} hourly net imports`} />
        : <Empty>no interchange reported</Empty>}
    </Tile>
  )
}

function ReferenceTile() {
  return (
    <Tile span={6} flush label="Reference" hint="Fixed figures from published reports for context. They do not update automatically; hover a row for detail."
      meta={<span>static · {reference.reviewed}</span>}>
      <div className="table-wrap">
        <table>
          <tbody>
            {reference.items.map(r => (
              <tr key={r.label} title={r.detail}>
                <td className="wrap" style={{ minWidth: 180, padding: '6px 12px' }}>{r.label}</td>
                <td className="num strong">{r.value}</td>
                <td className="hide-sm subtle mono"><a href={r.url} target="_blank" rel="noreferrer">{r.source} ↗</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tile>
  )
}

function FuelTile({ fuel, meta }) {
  const { x, series } = useMemo(() => {
    const pts = fuel?.series || []
    const mixes = pts.map(p => displayMix(p.mix))
    const present = FUELS.filter(f => mixes.some(m => (m[f] || 0) > 0))
    return {
      x: pts.map(p => Date.parse(p.t)),
      series: present.map(f => ({ label: FUEL_LABEL[f], values: mixes.map(m => m[f] ?? null), color: `var(--fuel-${f})` })),
    }
  }, [fuel])
  const latest = fuel?.series?.at(-1)
  return (
    <Tile label="US generation by fuel" meta={<SourceTag meta={meta} name="EIA-930" />}
      hint="Where US electricity comes from, hour by hour, about a day behind. Solar rises at midday; gas usually covers the evening peak.">
      {latest ? <>
        <TimeChart x={x} series={series} stacked height={240} format={gwAxis} ariaLabel="US Lower 48 hourly generation by fuel" />
        <div className="legend"><span>GW at {when(latest.t)}</span></div>
        <FuelLegend mix={latest.mix} />
      </> : fuel === null ? <Empty>no data · retrying</Empty> : <div className="skeleton" style={{ height: 240 }} />}
    </Tile>
  )
}

export default function Grid() {
  const res = useResource('/api/grid', EVERY.grid)
  const { params } = useRoute()
  const regions = res.data?.demand?.regions
  const rows = useMemo(() => regionRows(regions || []), [regions])
  const id = params.get('r') || 'US48'
  // Accept EIA codes (CISO) and operator names (caiso) in the URL.
  const region = regions?.find(r => r.id === id || r.name.toLowerCase() === id.toLowerCase()) || regions?.[0]
  const row = rows.find(r => r.id === region?.id)
  const sources = res.data?.sources || {}
  const us48 = row?.id === 'US48'

  const exportCSV = () => {
    const data = region.series.map(p => ({ hour_utc: p.t, region: region.id, demand_mw: p.d, forecast_mw: p.df, net_generation_mw: p.ng, interchange_mw: p.ti }))
    download(`gridpulse-${region.id}-hourly.csv`, toCSV(data, Object.keys(data[0])))
  }

  return (
    <>
      <LoadState res={res} what="grid" />
      <div className="bar">
        <Seg label="Region" value={region?.id} onChange={v => setParam('r', v === 'US48' ? null : v)}
          options={(regions || []).map(r => [r.id, regionLabel(r)])} />
        <span className="grow" />
        {region && <button className="btn" type="button" onClick={exportCSV}>{Icon.download}csv</button>}
      </div>
      <Board>
        {row ? <>
          <Metrics>
            <Metric label="Demand" value={gw(row.d)} unit="GW" note={time(row.t)} hint="Electricity used in the latest reported hour." />
            <Metric label="Forecast" value={us48 ? '—' : gw(row.df)} unit="GW"
              note={us48 ? 'not available' : row.err == null ? '—' : `actual ${signed(row.err, 1, '%')}`}
              hint={us48 ? 'Not shown for the whole US: the total leaves out areas that have not reported.' : 'What the operator predicted a day ahead for the same hour.'} />
            <Metric label="Next hour" value={us48 || row.next == null ? '—' : gw(row.next)} unit="GW" note={us48 ? 'not available' : row.next == null ? 'not published' : 'forecast'}
              hint="The day-ahead forecast for the coming hour." />
            <Metric label="24h range" value={`${gw(row.min, 0)}–${gw(row.peak, 0)}`} unit="GW" note={row.peakT && `peak ${time(row.peakT)}`}
              hint="Lowest and highest hourly demand over the past day." />
            <Metric label="Net imports" value={row.imports == null ? '—' : signed(row.imports / 1000, 1)} unit="GW"
              note={row.balanceT ? when(row.balanceT) : 'not reported'} hint="Power bought from neighbors (+) or sold to them (−). Published about a day after demand." />
          </Metrics>
          <DemandTile region={region} meta={sources.eia_grid} />
          <ImportsTile region={region} />
          <ReferenceTile />
        </> : <Tile label="Demand">{res.data ? <Empty>no data · retrying</Empty> : <div className="skeleton" style={{ height: 320 }} />}</Tile>}
        <FuelTile fuel={res.data?.fuel} meta={sources.eia_fuel} />
      </Board>
    </>
  )
}
