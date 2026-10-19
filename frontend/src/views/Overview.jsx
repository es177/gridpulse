import { useMemo } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useNow } from '../lib/hooks'
import { age, date, gw, num, pct, signed, time, when } from '../lib/format'
import { regionLabel, regionRows, liveTotals, mixSummary, reactorChanges } from '../lib/derive'
import { FUEL_LABEL } from '../lib/fuels'
import { navigate } from '../lib/router'
import TimeChart from '../components/TimeChart'
import { Board, Tile, Metrics, Metric, SourceTag, Spark, Ext, Empty, Skeleton, LoadState, U } from '../components/ui'
import IsoTable from '../components/IsoTable'

const gwFormat = v => `${num(v / 1000, 0)} GW`
const gwTip = v => `${num(v / 1000, 1)} GW`

function Summary({ us, grid, live, fuel, reactors }) {
  const now = useNow()
  const isos = live?.isos || []
  const totals = liveTotals(isos, now)
  const latestFuel = fuel?.series?.at(-1)
  const nuclear = latestFuel ? mixSummary(latestFuel.mix)?.share.nuclear : null
  const fleet = reactors?.fleet
  return (
    <Metrics>
      <Metric label="US demand" value={us ? gw(us.d) : grid ? '—' : null} unit="GW"
        note={us && `${time(us.t)} · peak ${gw(us.peak, 0)}`}
        hint="Electricity in use across the lower 48 states, hourly. 1 GW is roughly one large power plant." />
      <Metric label="Live load" value={totals.load != null ? gw(totals.load) : live ? '—' : null} unit="GW"
        note={`${totals.count}/${isos.length || 6} grid operators`}
        hint="Demand reported every 5 minutes by six grid operators that cover about half the country." />
      <Metric label="Renewables" value={totals.summary ? num(totals.summary.renewable, 1) : live ? '—' : null} unit="%"
        note="hydro · wind · solar"
        hint="Share of those operators' electricity coming from hydro, wind and solar right now." />
      <Metric label="Reactors at full power" value={fleet?.units ? `${fleet.full}/${fleet.units}` : reactors ? '—' : null}
        note={fleet && `NRC ${date(reactors.report_date)}`}
        hint="US nuclear units at 95% power or more in the regulator's daily report. Some are always down for refueling." />
      <Metric label="Nuclear share" value={nuclear != null ? num(nuclear, 1) : fuel === null ? '—' : null} unit="%"
        note={latestFuel && when(latestFuel.t)}
        hint="Nuclear's share of all US generation in the latest hour EIA has published, about a day behind." />
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
    <Tile span={8} label="US demand · 3 days" meta={<SourceTag meta={meta} name="EIA-930" />}
      hint="Hourly electricity use. The daily wave follows people waking, working and sleeping; peaks come late in the day.">
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
    <Tile span={4} flush label="Reactor changes" meta={<SourceTag meta={data?.sources?.nrc_status} name="NRC" />}
      hint="Reactors whose power changed since the previous daily report, in percent of full power. Big drops are usually refueling or a shutdown.">
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
    <Tile span={8} flush label="Regions" meta={<SourceTag meta={meta} name="EIA-930" />}
      hint="Demand by grid region. vs forecast compares actual use with the operator's day-ahead prediction for that hour.">
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Region</th><th className="num">Demand <U>GW</U></th>
            <th className="num">vs forecast</th>
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
    <Tile span={4} rows={2} flush label="Latest" meta={<a href="#/feed">feed →</a>} hint="Newest news and regulator notices.">
      {!res.data ? <Skeleton height={320} /> : items.length ? (
        <ul className="rows news">
          {items.slice(0, 9).map(i => (
            <li key={i.id}>
              <Ext className="title" href={i.url}>{i.title}</Ext>
              <div className="meta"><span>{i.source}</span><span>{age(i.published, now)}</span></div>
            </li>
          ))}
        </ul>
      ) : <Empty>no items</Empty>}
    </Tile>
  )
}

function LiveIsos({ isos, sources }) {
  return (
    <Tile span={8} flush label="Grid operators · live" meta={<a href="#/live">live →</a>}
      hint="Each operator runs the grid for its region. The bar shows where its electricity comes from right now.">
      <IsoTable isos={isos} sources={sources} onSelect={key => navigate(`/live?iso=${key}`)} />
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
        <Summary us={us} grid={grid.data} live={live.data} fuel={grid.data && grid.data.fuel} reactors={reactors.data} />
        <DemandChart region={regions?.find(r => r.id === 'US48')} meta={grid.data?.sources?.eia_grid} loaded={!!grid.data} />
        <ReactorChanges res={reactors} />
        <Regions rows={rows} meta={grid.data?.sources?.eia_grid} />
        <Latest res={feed} />
        <LiveIsos isos={isos} sources={live.data?.sources || {}} />
      </Board>
    </>
  )
}
