import { useMemo } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useNow } from '../lib/hooks'
import { gw, num, pct, signed, time, when, date } from '../lib/format'
import { regionRows, liveTotals, mixSummary, reactorChanges } from '../lib/derive'
import { FUEL_LABEL } from '../lib/fuels'
import { navigate } from '../lib/router'
import TimeChart from '../components/TimeChart'
import { Panel, Stat, SourceTag, Spark, MixBar, Ago, Empty, LoadState } from '../components/ui'

const gwFormat = v => `${num(v / 1000, 0)} GW`

function DemandChart({ region, meta, loaded }) {
  const { x, series } = useMemo(() => {
    const pts = region?.series || []
    return {
      x: pts.map(p => Date.parse(p.t)),
      // Demand only: the Lower 48 day-ahead forecast is a partial sum of reporting areas.
      series: [{ label: 'Demand', values: pts.map(p => p.d), color: 'var(--series-1)' }],
    }
  }, [region])
  return (
    <Panel title="Lower 48 demand, last 72 hours" meta={<SourceTag meta={meta} name="EIA-930" />}>
      {region ? <>
        <TimeChart x={x} series={series} height={240} format={gwFormat} ariaLabel="US Lower 48 hourly electricity demand" />
      </> : loaded ? <Empty>EIA demand data is unavailable right now. Retrying automatically.</Empty>
        : <div className="skeleton" style={{ height: 240 }} />}
    </Panel>
  )
}

function Regions({ rows, meta }) {
  return (
    <Panel title="Regions" flush meta={<SourceTag meta={meta} name="EIA-930" />}
      foot="Demand is the latest hour each operator has reported. Forecast error = actual vs. that hour's day-ahead forecast. Not shown for Lower 48, whose forecast omits non-reporting areas.">
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Region</th><th className="num">Demand</th><th className="num">vs forecast</th>
            <th className="num hide-sm">24h peak</th><th className="hide-sm">72 hours</th><th className="num">Hour</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="clickable" onClick={() => navigate(`/grid?r=${r.id}`)}>
                <td><a href={`#/grid?r=${r.id}`} onClick={e => e.stopPropagation()}>{r.name}</a></td>
                <td className="num">{gw(r.d)} <span className="subtle">GW</span></td>
                <td className={`num ${r.err == null ? 'subtle' : Math.abs(r.err) >= 5 ? 'down' : ''}`}>{signed(r.err, 1, '%')}</td>
                <td className="num hide-sm">{gw(r.peak)}</td>
                <td className="hide-sm"><Spark values={r.spark} width={120} /></td>
                <td className="num muted">{time(r.t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function LiveIsos({ isos, sources }) {
  const now = useNow()
  return (
    <Panel title="Grid operators, live" flush meta={<a href="#/live">5-minute data →</a>}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Operator</th><th className="num">Load</th><th style={{ width: '32%' }}>Generation mix</th><th className="num hide-sm">Renewables</th><th className="hide-sm">Largest</th><th className="num">Updated</th></tr></thead>
          <tbody>
            {isos.map(i => {
              const s = mixSummary(i.mix)
              const fresh = i.observed_at && now - Date.parse(i.observed_at) < 30 * 60_000
              return (
                <tr key={i.key} className="clickable" onClick={() => navigate(`/live?iso=${i.key}`)}>
                  <td><span className="source" style={{ color: 'var(--fg)', fontSize: 13 }}><SourceTag meta={sources[`iso_${i.key}`]} showLabel={false} />{i.iso}</span></td>
                  <td className="num">{gw(i.load_mw)} <span className="subtle">GW</span></td>
                  <td>{i.mix ? <MixBar mix={i.mix} /> : <span className="subtle">No data</span>}</td>
                  <td className="num hide-sm">{pct(s?.renewable)}</td>
                  <td className="hide-sm">{s ? FUEL_LABEL[s.top] : '—'}</td>
                  <td className={`num ${fresh ? 'muted' : 'down'}`}>{time(i.observed_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function ReactorChanges({ res }) {
  const data = res.data
  const changes = reactorChanges(data?.units)
  const fleet = data?.fleet
  return (
    <Panel title="Reactor changes" flush meta={<SourceTag meta={data?.sources?.nrc_status} name="NRC" />}
      foot={fleet && <span>Report {date(data.report_date)} · <a href="#/reactors?status=offline">{fleet.offline} offline</a> · <a href="#/reactors?status=reduced">{fleet.reduced} reduced</a></span>}>
      {!data ? <div className="skeleton" style={{ height: 120, margin: 12 }} /> : changes.length ? (
        <ul className="list">
          {changes.slice(0, 8).map(u => (
            <li key={u.name}>
              <a className="item-title" href={`#/reactors?q=${encodeURIComponent(u.name)}`}>{u.name}</a>
              <div className="item-meta">
                <span className="mono">{u.prev ?? '—'}% → {u.today ?? '—'}%</span>
                <span className={`mono ${u.change < 0 ? 'down' : 'up'}`}>{signed(u.change, 0)}</span>
                <span>{u.state}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty>No unit changed power since the previous report.</Empty>}
    </Panel>
  )
}

function Latest({ res }) {
  const items = res.data?.items || []
  return (
    <Panel title="Latest" flush meta={<a href="#/feed">All updates →</a>}>
      {!res.data ? <div className="skeleton" style={{ height: 200, margin: 12 }} /> : items.length ? (
        <ul className="list">
          {items.slice(0, 8).map(i => (
            <li key={i.id}>
              <a className="item-title" href={i.url} target="_blank" rel="noreferrer">{i.title}</a>
              <div className="item-meta"><span>{i.source}</span><Ago iso={i.published} /></div>
            </li>
          ))}
        </ul>
      ) : <Empty>No feed items available.</Empty>}
    </Panel>
  )
}

function Stats({ us, grid, live, fuel, reactors }) {
  const now = useNow()
  const isos = live.data?.isos || []
  const totals = liveTotals(isos, now)
  const latestFuel = fuel?.series?.at(-1)
  const nuclear = latestFuel ? mixSummary(latestFuel.mix)?.share.nuclear : null
  const fleet = reactors?.fleet
  return (
    <div className="stats">
      <Stat label="Lower 48 demand" value={us ? gw(us.d) : grid ? '—' : null} unit="GW" sub={us && `${time(us.t)} hour · 24h peak ${gw(us.peak, 0)} GW`} />
      <Stat label="Live operator load" value={totals.load != null ? gw(totals.load) : live.data ? '—' : null} unit="GW" sub={`${totals.count} of ${isos.length || 6} operators · 5-minute data`} />
      <Stat label="Renewables, live operators" value={totals.summary ? num(totals.summary.renewable, 1) : live.data ? '—' : null} unit="%" sub="Hydro, wind and solar share of output" />
      <Stat label="Reactors at full power" value={fleet?.units ? `${fleet.full}/${fleet.units}` : reactors ? '—' : null} sub={fleet && `Mean output ${num(fleet.mean_power, 1)}% · NRC ${date(reactors.report_date)}`} />
      <Stat label="Nuclear share, Lower 48" value={nuclear != null ? num(nuclear, 1) : fuel === null ? '—' : null} unit="%" sub={latestFuel && `EIA fuel data, ${when(latestFuel.t)}`} title="EIA publishes generation by fuel about one day after the hour." />
    </div>
  )
}

export default function Overview() {
  const grid = useResource('/api/grid', EVERY.grid)
  const live = useResource('/api/live', EVERY.live)
  const reactors = useResource('/api/reactors', EVERY.reactors)
  const feed = useResource('/api/feed', EVERY.feed)

  const regions = grid.data?.demand?.regions
  const rows = useMemo(() => regionRows(regions || []), [regions])
  const us = rows.find(r => r.id === 'US48')
  const isos = live.data?.isos || []
  const sources = live.data?.sources || {}

  return (
    <div className="stack">
      <LoadState res={grid} what="grid data" />
      <Stats us={us} grid={grid.data} live={live} fuel={grid.data && grid.data.fuel} reactors={reactors.data} />
      <div className="cols">
        <div className="stack">
          <DemandChart region={regions?.find(r => r.id === 'US48')} meta={grid.data?.sources?.eia_grid} loaded={!!grid.data} />
          <Regions rows={rows} meta={grid.data?.sources?.eia_grid} />
          <LiveIsos isos={isos} sources={sources} />
        </div>
        <div className="stack">
          <ReactorChanges res={reactors} />
          <Latest res={feed} />
        </div>
      </div>
    </div>
  )
}
