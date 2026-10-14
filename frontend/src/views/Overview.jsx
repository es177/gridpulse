import { useMemo } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useNow } from '../lib/hooks'
import { age, date, gw, num, pct, signed, time, when } from '../lib/format'
import { regionLabel, regionRows, liveTotals, mixSummary, reactorChanges } from '../lib/derive'
import { FUEL_LABEL } from '../lib/fuels'
import { navigate } from '../lib/router'
import TimeChart from '../components/TimeChart'
import { Board, Tile, Metrics, Metric, SourceTag, Spark, MixBar, Empty, Skeleton, LoadState, U } from '../components/ui'

const gwFormat = v => `${num(v / 1000, 0)} GW`
const gwTip = v => `${num(v / 1000, 1)} GW`

function Summary({ us, grid, live, fuel, reactors }) {
  const now = useNow()
  const isos = live.data?.isos || []
  const totals = liveTotals(isos, now)
  const latestFuel = fuel?.series?.at(-1)
  const nuclear = latestFuel ? mixSummary(latestFuel.mix)?.share.nuclear : null
  const fleet = reactors?.fleet
  return (
    <Metrics>
      <Metric label="US48 demand" value={us ? gw(us.d) : grid ? '—' : null} unit="GW"
        note={us && `${time(us.t)} · peak ${gw(us.peak, 0)}`} tip="Lower 48 hourly demand, EIA-930" />
      <Metric label="ISO load" value={totals.load != null ? gw(totals.load) : live.data ? '—' : null} unit="GW"
        note={`${totals.count}/${isos.length || 6} live`} tip="Sum of the six operators reporting in the last 30 minutes" />
      <Metric label="Renewables" value={totals.summary ? num(totals.summary.renewable, 1) : live.data ? '—' : null} unit="%"
        note="live ISOs" tip="Hydro, wind and solar share of live operator output" />
      <Metric label="Reactors full" value={fleet?.units ? `${fleet.full}/${fleet.units}` : reactors ? '—' : null}
        note={fleet && `NRC ${date(reactors.report_date)}`} tip="Units at 95% power or more in the latest NRC report" />
      <Metric label="Nuclear share" value={nuclear != null ? num(nuclear, 1) : fuel === null ? '—' : null} unit="%"
        note={latestFuel && `US48 · ${when(latestFuel.t)}`} tip="EIA publishes generation by fuel about a day after the hour" />
    </Metrics>
  )
}

function DemandChart({ region, meta, loaded }) {
  const { x, series } = useMemo(() => {
    const pts = region?.series || []
    // Demand only: the Lower 48 day-ahead forecast is a partial sum of reporting areas.
    return { x: pts.map(p => Date.parse(p.t)), series: [{ label: 'Demand', values: pts.map(p => p.d) }] }
  }, [region])
  return (
    <Tile span={8} label="Demand · US48 · 72h" meta={<SourceTag meta={meta} name="EIA-930" />}>
      {region ? <TimeChart x={x} series={series} area height={248} format={gwTip} axisFormat={gwFormat} ariaLabel="US Lower 48 hourly electricity demand" />
        : loaded ? <Empty>no data · retrying</Empty> : <div className="skeleton" style={{ height: 248 }} />}
    </Tile>
  )
}

function ReactorChanges({ res }) {
  const data = res.data
  const changes = reactorChanges(data?.units)
  const fleet = data?.fleet
  return (
    <Tile span={4} flush label="Reactor changes" meta={<SourceTag meta={data?.sources?.nrc_status} name="NRC" />}>
      {!data ? <Skeleton height={220} /> : (
        <ul className="rows">
          {changes.slice(0, 7).map(u => (
            <li key={u.name}>
              <a className="grow" href={`#/reactors?unit=${encodeURIComponent(u.name)}`}>{u.name}</a>
              <span className="mono subtle">{u.prev ?? '—'}→{u.today ?? '—'}</span>
              <span className={`mono ${u.change < 0 ? 'bad' : 'ok'}`} style={{ minWidth: '4ch', textAlign: 'right' }}>{signed(u.change, 0)}</span>
            </li>
          ))}
          {!changes.length && <li className="subtle mono">no changes</li>}
          {fleet && (
            <li className="more">
              <a href="#/reactors?status=offline">{fleet.offline} offline</a>
              <a href="#/reactors?status=reduced">{fleet.reduced} reduced</a>
              <a href="#/reactors" style={{ marginLeft: 'auto' }}>all {fleet.units} →</a>
            </li>
          )}
        </ul>
      )}
    </Tile>
  )
}

function Regions({ rows, meta }) {
  return (
    <Tile span={8} flush label="Regions" meta={<SourceTag meta={meta} name="EIA-930" />}>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Region</th><th className="num">Demand <U>GW</U></th>
            <th className="num" title="Actual vs day-ahead forecast for the same hour">vs fcst</th>
            <th className="num hide-sm">24h peak</th><th className="hide-sm">72h</th><th className="num">Hour</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="clickable" onClick={() => navigate(`/grid?r=${r.id}`)}>
                <td><a href={`#/grid?r=${r.id}`} onClick={e => e.stopPropagation()}>{regionLabel(r)}</a></td>
                <td className="num">{gw(r.d)}</td>
                <td className={`num ${r.err == null ? 'subtle' : Math.abs(r.err) >= 5 ? 'warn' : ''}`}>{signed(r.err, 1, '%')}</td>
                <td className="num hide-sm">{gw(r.peak)}</td>
                <td className="hide-sm"><Spark values={r.spark} width={120} /></td>
                <td className="num subtle">{time(r.t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tile>
  )
}

function Latest({ res }) {
  const now = useNow()
  const items = res.data?.items || []
  return (
    <Tile span={4} rows={2} flush label="Latest" meta={<a href="#/feed">feed →</a>}>
      {!res.data ? <Skeleton height={320} /> : items.length ? (
        <ul className="rows news">
          {items.slice(0, 9).map(i => (
            <li key={i.id}>
              <a className="title" href={i.url} target="_blank" rel="noreferrer">{i.title}</a>
              <div className="meta"><span>{i.source}</span><span>{age(i.published, now)}</span></div>
            </li>
          ))}
        </ul>
      ) : <Empty>no items</Empty>}
    </Tile>
  )
}

function LiveIsos({ isos, sources }) {
  const now = useNow()
  return (
    <Tile span={8} flush label="ISOs · 5 min" meta={<a href="#/live">live →</a>}>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>ISO</th><th className="num">Load <U>GW</U></th><th style={{ width: '34%' }}>Mix</th>
            <th className="num hide-sm">Renew.</th><th className="hide-sm">Top</th><th className="num">Time</th>
          </tr></thead>
          <tbody>
            {isos.map(i => {
              const s = mixSummary(i.mix)
              const fresh = i.observed_at && now - Date.parse(i.observed_at) < 30 * 60_000
              return (
                <tr key={i.key} className="clickable" onClick={() => navigate(`/live?iso=${i.key}`)}>
                  <td><span className="src" style={{ color: 'var(--fg)', fontSize: 13, fontFamily: 'var(--sans)' }}><SourceTag meta={sources[`iso_${i.key}`]} showLabel={false} />{i.iso}</span></td>
                  <td className="num">{gw(i.load_mw)}</td>
                  <td>{i.mix ? <MixBar mix={i.mix} /> : <span className="subtle mono">—</span>}</td>
                  <td className="num hide-sm">{pct(s?.renewable)}</td>
                  <td className="hide-sm muted">{s ? FUEL_LABEL[s.top] : '—'}</td>
                  <td className={`num ${fresh ? 'subtle' : 'warn'}`}>{time(i.observed_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Tile>
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

  return (
    <>
      <LoadState res={grid} what="grid" />
      <LoadState res={live} what="live" />
      <Board>
        <Summary us={us} grid={grid.data} live={live} fuel={grid.data && grid.data.fuel} reactors={reactors.data} />
        <DemandChart region={regions?.find(r => r.id === 'US48')} meta={grid.data?.sources?.eia_grid} loaded={!!grid.data} />
        <ReactorChanges res={reactors} />
        <Regions rows={rows} meta={grid.data?.sources?.eia_grid} />
        <Latest res={feed} />
        <LiveIsos isos={isos} sources={live.data?.sources || {}} />
      </Board>
    </>
  )
}
