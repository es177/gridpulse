import { Fragment, Suspense, lazy, useEffect, useMemo, useRef } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useQueryText, useSort } from '../lib/hooks'
import { useRoute, setParam } from '../lib/router'
import { date, gw, num, signed } from '../lib/format'
import { filterUnits } from '../lib/derive'
import TimeChart from '../components/TimeChart'
import { Board, Tile, Metrics, Metric, SourceTag, Seg, Th, Spark, Meter, Empty, Skeleton, LoadState, U } from '../components/ui'

const ReactorMap = lazy(() => import('./ReactorMap'))

const TONE = { full: 'ok', reduced: 'warn', offline: 'bad', unknown: '' }
const pctFormat = v => `${num(v, 0)}%`
const COLUMNS = 9

function History({ dates, unit }) {
  const x = useMemo(() => dates.map(d => Date.parse(`${d}T12:00:00Z`)), [dates])
  const series = useMemo(() => [{ label: 'Power', values: unit.power }], [unit.power])
  return <TimeChart x={x} series={series} area height={150} yMin={0} format={pctFormat} ariaLabel={`${unit.name} reported power, last ${dates.length} reports`} />
}

function Detail({ unit, dates }) {
  return (
    <tr className="detail">
      <td colSpan={COLUMNS}>
        <History dates={dates} unit={unit} />
        <dl className="facts">
          <div><dt>Docket</dt><dd className="mono">{unit.docket || '—'}</dd></div>
          <div><dt>Thermal</dt><dd className="mono">{num(unit.mwt, 0)} MWt</dd></div>
          <div><dt>Nameplate</dt><dd className="mono">{num(unit.mwe, 0)} MWe</dd></div>
          <div><dt>Type</dt><dd>{unit.type || '—'}</dd></div>
          <div><dt>Operator</dt><dd>{unit.operator || '—'}</dd></div>
          <div><dt>NRC</dt><dd>{unit.url ? <a href={unit.url} target="_blank" rel="noreferrer">unit page ↗</a> : '—'}</dd></div>
        </dl>
      </td>
    </tr>
  )
}

function UnitTable({ rows, dates, openUnit, onToggle }) {
  const { sorted, sort, toggle } = useSort(rows, 'today', 'asc')
  const first = dates[0]
  const thisYear = dates.at(-1)?.slice(0, 4)
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>
          <Th k="name" sort={sort} onSort={toggle}>Unit</Th>
          <Th k="state" sort={sort} onSort={toggle}>State</Th>
          <Th k="type" sort={sort} onSort={toggle} className="hide-sm">Type</Th>
          <Th k="operator" sort={sort} onSort={toggle} className="hide-sm">Operator</Th>
          <Th k="today" sort={sort} onSort={toggle}>Power <U>%</U></Th>
          <Th k="change" sort={sort} onSort={toggle} num>Δ <U>pt</U></Th>
          <th className="hide-sm">30 reports</th>
          <Th k="avg30" sort={sort} onSort={toggle} num className="hide-sm">Avg <U>%</U></Th>
          <Th k="since" sort={sort} onSort={toggle}>Since</Th>
        </tr></thead>
        <tbody>
          {sorted.map(u => {
            const open = u.name === openUnit
            return (
              <Fragment key={u.name}>
                <tr id={`unit-${u.docket || u.name}`} className={`clickable${open ? ' open' : ''}`} tabIndex={0} aria-expanded={open}
                  onClick={() => onToggle(u.name)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(u.name) } }}>
                  <td className="strong">{u.name}</td>
                  <td className="mono muted">{u.state || '—'}</td>
                  <td className="hide-sm mono muted">{u.type || '—'}</td>
                  <td className="hide-sm muted" title={u.operator || undefined}>{u.operator ? (u.operator.length > 28 ? `${u.operator.slice(0, 27)}…` : u.operator) : '—'}</td>
                  <td className="mono"><Meter value={u.today} tone={TONE[u.status]} />{u.today ?? '—'}</td>
                  <td className={`num ${u.change < 0 ? 'bad' : u.change > 0 ? 'ok' : 'subtle'}`}>{u.change ? signed(u.change, 0) : u.change === 0 ? '0' : '—'}</td>
                  <td className="hide-sm"><Spark values={u.spark} min={0} max={100} width={110} /></td>
                  <td className="num hide-sm">{u.avg30 == null ? '—' : num(u.avg30, 0)}</td>
                  <td className="mono subtle">{u.since ? `${u.since === first ? '≥ ' : ''}${date(u.since, u.since.slice(0, 4) !== thisYear)}` : '—'}</td>
                </tr>
                {open && <Detail unit={u} dates={dates} />}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Reactors() {
  const res = useResource('/api/reactors', EVERY.reactors)
  const { params } = useRoute()
  const status = ['full', 'reduced', 'offline'].includes(params.get('status')) ? params.get('status') : 'all'
  const view = params.get('view') === 'map' ? 'map' : 'table'
  const openUnit = params.get('unit')
  const [q, setQ, dq] = useQueryText(params)

  const data = res.data
  const dates = data?.dates || []
  const units = data?.units
  const rows = useMemo(() => (units || [])
    .map(u => ({ ...u, spark: u.power.slice(-30) }))
    .sort((a, b) => (a.today ?? 101) - (b.today ?? 101) || a.name.localeCompare(b.name)), [units])
  const searched = useMemo(() => filterUnits(rows, { q: dq }), [rows, dq])
  const shown = useMemo(() => filterUnits(searched, { status }), [searched, status])
  const tally = s => searched.filter(u => u.status === s).length

  // Bring a unit opened from a link or the map into view once the table renders.
  const scrolled = useRef(null)
  useEffect(() => {
    if (view !== 'table' || !openUnit || !rows.length || scrolled.current === openUnit) return
    scrolled.current = openUnit
    const u = rows.find(r => r.name === openUnit)
    document.getElementById(`unit-${u?.docket || openUnit}`)?.scrollIntoView({ block: 'center' })
  }, [view, openUnit, rows])

  const fleet = data?.fleet
  const toggleUnit = name => setParam('unit', name === openUnit ? null : name)
  const openInTable = name => { scrolled.current = null; setParam('unit', name); setParam('view', null) }
  const meta = <SourceTag meta={data?.sources?.nrc_status} name="NRC" />

  return (
    <>
      <LoadState res={res} what="reactors" />
      <div className="bar">
        <input className="input" type="search" data-search value={q} onChange={e => setQ(e.target.value)}
          placeholder="filter reactors" aria-label="Filter reactors" />
        <Seg label="Power status" value={status} onChange={s => setParam('status', s === 'all' ? null : s)} options={[
          ['all', 'all', searched.length], ['full', 'full', tally('full')], ['reduced', 'reduced', tally('reduced')], ['offline', 'offline', tally('offline')],
        ]} />
        <Seg label="View" value={view} onChange={v => setParam('view', v === 'table' ? null : v)} options={[['table', 'table'], ['map', 'map']]} />
        {data && <span className="count">{shown.length}/{rows.length}</span>}
      </div>
      <Board>
        <Metrics>
          <Metric label="Reactors" value={fleet ? num(fleet.units) : null} note={data && `NRC ${date(data.report_date)}`}
            hint="Operating US power reactors in the regulator's daily report, published each business day." />
          <Metric label="Full power" value={fleet ? num(fleet.full) : null} note="95% or more" hint="Running at or near full licensed power." />
          <Metric label="Reduced" value={fleet ? num(fleet.reduced) : null} note="1–94%" tone={fleet?.reduced ? 'warn' : ''}
            hint="Running below full power, often while starting up, shutting down or for maintenance." />
          <Metric label="Offline" value={fleet ? num(fleet.offline) : null} note="0%" tone={fleet?.offline ? 'bad' : ''}
            hint="Not producing power, usually for refueling every 18–24 months." />
          <Metric label="Output" value={fleet ? gw(fleet.online_mw) : null} unit={fleet && `/ ${gw(fleet.capacity_mw)} GW`} note="estimated"
            hint="Reported percent power times each reactor's rated capacity, summed." />
          <Metric label="Changed" value={fleet ? num(fleet.changed) : null} note="since last report" hint="Reactors whose reported power changed since the previous report." />
        </Metrics>
        {view === 'map' ? (
          <Tile flush label="Map" meta={meta} hint="Each dot is a reactor, sized by capacity. Green is full power, amber reduced, red offline. Click a dot for details.">
            <Suspense fallback={<Skeleton height={420} />}>
              <ReactorMap units={shown} selected={openUnit} onSelect={name => setParam('unit', name)} onOpen={openInTable} />
            </Suspense>
          </Tile>
        ) : (
          <Tile flush label="Reactors" meta={meta} hint="Power is the percent of full licensed power reported each morning. Δ is the change since the previous report; Since is when the current level began. Click a row for a year of history.">
            {!data ? <Skeleton height={320} />
              : shown.length ? <UnitTable rows={shown} dates={dates} openUnit={openUnit} onToggle={toggleUnit} />
                : <Empty>no match · <button className="btn bare" type="button" onClick={() => { setQ(''); setParam('status', null) }}>clear</button></Empty>}
          </Tile>
        )}
      </Board>
    </>
  )
}
