import { useMemo } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useRoute, setParam } from '../lib/router'
import { gw, num, signed, time, when } from '../lib/format'
import { regionRows, toCSV, download } from '../lib/derive'
import { FUELS, FUEL_LABEL, displayMix } from '../lib/fuels'
import TimeChart from '../components/TimeChart'
import { Panel, Stat, SourceTag, Seg, Label, LoadState, FuelLegend, Empty, Icon } from '../components/ui'
import reference from '../data/reference.json'

const gwAxis = v => `${num(v / 1000, 0)} GW`
const gwTip = v => `${num(v / 1000, 1)} GW`
const gwSigned = v => `${signed(v / 1000, 1)} GW`

function DemandPanel({ region, meta }) {
  const partial = region.id === 'US48'  // its forecast sums only the areas that have reported
  const { x, series } = useMemo(() => {
    const pts = region.series
    return {
      x: pts.map(p => Date.parse(p.t)),
      series: [
        { label: 'Demand', values: pts.map(p => p.d), color: 'var(--series-1)' },
        ...(partial ? [] : [{ label: 'Day-ahead forecast', values: pts.map(p => p.df), color: 'var(--fg-subtle)', dash: true, width: 1.5 }]),
        { label: 'Net generation', values: pts.map(p => p.ng), color: 'var(--series-3)', width: 1.5 },
      ],
    }
  }, [region, partial])
  return (
    <Panel title={`${region.name}: demand and generation`} meta={<SourceTag meta={meta} name="EIA-930" />}
      foot={`Hourly averages. Net generation and interchange are published about a day after demand, so their lines end earlier.${partial ? ' The Lower 48 forecast is not drawn because it omits areas that have not reported.' : ''}`}>
      <TimeChart x={x} series={series} height={260} format={gwTip} axisFormat={gwAxis} ariaLabel={`${region.name} hourly demand${partial ? '' : ', forecast'} and net generation`} />
      <div className="legend" style={{ marginTop: 8 }}>
        <span><i className="line" style={{ background: 'var(--series-1)' }} />Demand</span>
        {!partial && <span><i className="dash" style={{ borderColor: 'var(--fg-subtle)' }} />Day-ahead forecast</span>}
        <span><i className="line" style={{ background: 'var(--series-3)' }} />Net generation</span>
      </div>
    </Panel>
  )
}

function ImportsPanel({ region }) {
  const { x, series, any } = useMemo(() => {
    const pts = region.series.filter(p => typeof p.ti === 'number')
    return {
      any: pts.length > 0,
      x: pts.map(p => Date.parse(p.t)),
      series: [{ label: 'Net imports', values: pts.map(p => -p.ti), color: 'var(--series-2)' }],
    }
  }, [region])
  return (
    <Panel title="Net imports" foot="Positive: the region draws power from neighbors. Negative: it exports. EIA total interchange with the sign reversed.">
      {any ? <TimeChart x={x} series={series} height={140} format={gwSigned} ariaLabel={`${region.name} hourly net imports`} />
        : <Empty>No interchange reported for this region in the window.</Empty>}
    </Panel>
  )
}

function FuelPanel({ fuel, meta }) {
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
    <Panel title="Lower 48 generation by fuel" meta={<SourceTag meta={meta} name="EIA-930" />}
      foot="EIA publishes generation by fuel about one day after the hour. Storage charging is not stacked.">
      {latest ? <>
        <TimeChart x={x} series={series} stacked height={240} format={gwAxis} ariaLabel="US Lower 48 hourly generation by fuel" />
        <div style={{ marginTop: 8 }}>
          <div className="subtle" style={{ fontSize: 12, marginBottom: 4 }}>Hour ending {when(latest.t)}</div>
          <FuelLegend mix={latest.mix} />
        </div>
      </> : fuel === null ? <Empty>EIA fuel data is unavailable right now. Retrying automatically.</Empty>
        : <div className="skeleton" style={{ height: 240 }} />}
    </Panel>
  )
}

function ReferencePanel() {
  return (
    <Panel title="Outlook reference" flush meta={<Label title="Copied from published reports; not refreshed automatically">Not live · reviewed {reference.reviewed}</Label>}
      foot={reference.note}>
      <div className="table-wrap">
        <table>
          <tbody>
            {reference.items.map(r => (
              <tr key={r.label}>
                <td className="wrap" style={{ minWidth: 200 }}>{r.label}<div className="subtle" style={{ fontSize: 12 }}>{r.detail}</div></td>
                <td className="num" style={{ fontWeight: 600 }}>{r.value}</td>
                <td className="hide-sm"><a href={r.url} target="_blank" rel="noreferrer">{r.source}</a><div className="subtle" style={{ fontSize: 12 }}>{r.published}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export default function Grid() {
  const res = useResource('/api/grid', EVERY.grid)
  const { params } = useRoute()
  const regions = res.data?.demand?.regions
  const rows = useMemo(() => regionRows(regions || []), [regions])
  const id = params.get('r') || 'US48'
  const region = regions?.find(r => r.id === id) || regions?.[0]
  const row = rows.find(r => r.id === region?.id)
  const sources = res.data?.sources || {}

  const exportCSV = () => {
    const data = region.series.map(p => ({ hour_utc: p.t, region: region.id, demand_mw: p.d, forecast_mw: p.df, net_generation_mw: p.ng, interchange_mw: p.ti }))
    download(`gridpulse-${region.id}-hourly.csv`, toCSV(data, Object.keys(data[0])))
  }

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Grid</h1>
        <p>Hourly demand and supply by region from EIA Form 930</p>
        <span className="spacer" />
        <SourceTag meta={sources.eia_grid} name="EIA-930" />
      </div>
      <LoadState res={res} what="grid data" />
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <Seg label="Region" value={region?.id} onChange={v => setParam('r', v === 'US48' ? null : v)}
          options={(regions || []).map(r => [r.id, r.name])} />
        <span className="spacer" style={{ flex: 1 }} />
        {region && <button className="btn" type="button" onClick={exportCSV}>{Icon.download}Download CSV</button>}
      </div>
      {row ? <>
        <div className="stats">
          <Stat label="Demand" value={gw(row.d)} unit="GW" sub={`Hour ending ${time(row.t)}`} />
          <Stat label="Day-ahead forecast" value={row.id === 'US48' ? '—' : gw(row.df)} unit={row.id === 'US48' ? '' : 'GW'}
            sub={row.id === 'US48' ? 'Not summed for Lower 48' : row.err == null ? 'Same hour' : `Actual ${signed(row.err, 1, '%')} vs forecast`} />
          <Stat label="Next hour forecast" value={row.next == null ? '—' : gw(row.next)} unit={row.next == null ? '' : 'GW'} sub={row.id === 'US48' ? 'Not summed for Lower 48' : row.next == null ? 'Not published yet' : 'Day-ahead, reported by operator'} />
          <Stat label="24h range" value={`${gw(row.min, 0)}–${gw(row.peak, 0)}`} unit="GW" sub={row.peakT && `Peak at ${time(row.peakT)}`} />
          <Stat label="Net imports" value={row.imports == null ? '—' : signed(row.imports / 1000, 1)} unit={row.imports == null ? '' : 'GW'} sub={row.balanceT ? `Hour ending ${when(row.balanceT)}` : 'Not reported'} />
        </div>
        <DemandPanel region={region} meta={sources.eia_grid} />
        <div className="grid-2">
          <ImportsPanel region={region} />
          <ReferencePanel />
        </div>
      </> : res.data ? <Panel title="Demand"><Empty>EIA demand data is unavailable right now. Retrying automatically.</Empty></Panel>
        : !res.error && <div className="skeleton" style={{ height: 320 }} />}
      <FuelPanel fuel={res.data?.fuel} meta={sources.eia_fuel} />
    </div>
  )
}
