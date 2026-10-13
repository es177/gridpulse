import { Fragment, Suspense, lazy, useEffect, useMemo, useRef } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useQueryText, useSort } from '../lib/hooks'
import { useRoute, setParam } from '../lib/router'
import { date, gw, num, signed } from '../lib/format'
import { filterUnits } from '../lib/derive'
import TimeChart from '../components/TimeChart'
import { Panel, Stat, SourceTag, Seg, Th, Spark, Empty, LoadState } from '../components/ui'
import './reactors.css'

const ReactorMap = lazy(() => import('./ReactorMap'))

const TONE = { full: 'ok', reduced: 'warn', offline: 'bad', unknown: '' }
const pctFormat = v => `${num(v, 0)}%`
const COLUMNS = 9

/** Search box state that mirrors ?q= without fighting the user's typing. */
function History({ dates, unit }) {
  const x = useMemo(() => dates.map(d => Date.parse(`${d}T12:00:00Z`)), [dates])
  const series = useMemo(() => [{ label: 'Power', values: unit.power, color: 'var(--series-1)' }], [unit.power])
  return <TimeChart x={x} series={series} height={160} yMin={0} format={pctFormat} ariaLabel={`${unit.name} reported power, last ${dates.length} reports`} />
}

function Detail({ unit, dates }) {
  return (
    <tr className="detail">
      <td colSpan={COLUMNS}>
        <History dates={dates} unit={unit} />
        <dl className="facts">
          <div><dt>Docket</dt><dd className="mono">{unit.docket || '—'}</dd></div>
          <div><dt>Licensed thermal</dt><dd className="mono">{num(unit.mwt, 0)} MWt</dd></div>
          <div><dt>Nameplate</dt><dd className="mono">{num(unit.mwe, 0)} MWe</dd></div>
          <div><dt>Type</dt><dd>{unit.type || '—'}</dd></div>
          <div><dt>Operator</dt><dd>{unit.operator || '—'}</dd></div>
          <div><dt>Source</dt><dd>{unit.url ? <a href={unit.url} target="_blank" rel="noreferrer">NRC unit page ↗</a> : '—'}</dd></div>
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
          <Th k="today" sort={sort} onSort={toggle}>Power</Th>
          <Th k="change" sort={sort} onSort={toggle} num>Δ</Th>
          <th className="hide-sm">Last 30 reports</th>
          <Th k="avg30" sort={sort} onSort={toggle} num className="hide-sm">30-report avg</Th>
          <Th k="since" sort={sort} onSort={toggle}>Since</Th>
        </tr></thead>
        <tbody>
          {sorted.map(u => {
            const open = u.name === openUnit
            return (
              <Fragment key={u.name}>
                <tr id={`unit-${u.docket || u.name}`} className={`clickable${open ? ' open' : ''}`} tabIndex={0} aria-expanded={open}
                  onClick={() => onToggle(u.name)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(u.name) } }}>
                  <td className="unit-name">{u.name}</td>
                  <td>{u.state || '—'}</td>
                  <td className="hide-sm">{u.type || '—'}</td>
                  <td className="hide-sm" title={u.operator || undefined}>{u.operator ? (u.operator.length > 28 ? `${u.operator.slice(0, 27)}…` : u.operator) : '—'}</td>
                  <td>
                    <span className="power" title={`${u.today ?? '—'}% reported power`}>
                      <span className="bar-track"><span className={TONE[u.status]} style={{ width: `${Math.max(u.today ?? 0, 0)}%` }} /></span>
                      <span className="mono">{u.today ?? '—'}%</span>
                    </span>
                  </td>
                  <td className={`num ${u.change < 0 ? 'down' : u.change > 0 ? 'up' : 'subtle'}`} title="Percentage points vs previous report">{u.change ? signed(u.change, 0) : u.change === 0 ? '0' : '—'}</td>
                  <td className="hide-sm"><Spark values={u.spark} min={0} max={100} width={110} /></td>
                  <td className="num hide-sm">{u.avg30 == null ? '—' : `${num(u.avg30, 0)}%`}</td>
                  <td className="mono muted">{u.since ? `${u.since === first ? '≥ ' : ''}${date(u.since, u.since.slice(0, 4) !== thisYear)}` : '—'}</td>
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

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Reactors</h1>
        <p>NRC daily power report · {date(data?.report_date, true)}</p>
        <span className="spacer" />
        <SourceTag meta={data?.sources?.nrc_status} name="NRC" />
      </div>
      <LoadState res={res} what="reactor status" />
      <div className="stats">
        <Stat label="Operating units" value={fleet ? num(fleet.units) : null} sub="In the latest NRC report" />
        <Stat label="At full power" value={fleet ? num(fleet.full) : null} sub="≥95% reported power" />
        <Stat label="Reduced" value={fleet ? num(fleet.reduced) : null} sub="1–94% reported power" />
        <Stat label="Offline" value={fleet ? num(fleet.offline) : null} sub="0% reported power" />
        <Stat label="Estimated output" value={fleet ? gw(fleet.online_mw) : null} unit={fleet && `of ${gw(fleet.capacity_mw)} GW`} sub="% power × nameplate MWe" />
        <Stat label="Changed" value={fleet ? num(fleet.changed) : null} sub="Since the previous report" />
      </div>
      <div>
        <div className="toolbar">
          <input className="input" type="search" data-search value={q} onChange={e => setQ(e.target.value)}
            placeholder="Filter by unit, state, operator, type or docket" aria-label="Filter reactors" />
          <Seg label="Power status" value={status} onChange={s => setParam('status', s === 'all' ? null : s)} options={[
            ['all', `All ${searched.length}`], ['full', `Full ${tally('full')}`], ['reduced', `Reduced ${tally('reduced')}`], ['offline', `Offline ${tally('offline')}`],
          ]} />
          <Seg label="View" value={view} onChange={v => setParam('view', v === 'table' ? null : v)} options={[['table', 'Table'], ['map', 'Map']]} />
          {data && <span className="muted" style={{ fontSize: 12 }}>{shown.length} of {rows.length} units</span>}
        </div>
        {view === 'map' ? (
          <Panel title="Map" flush meta={<span>Albers USA projection</span>}>
            <Suspense fallback={<div className="skeleton" style={{ height: 420, margin: 12 }} />}>
              <ReactorMap units={shown} selected={openUnit} onSelect={name => setParam('unit', name)} onOpen={openInTable} />
            </Suspense>
          </Panel>
        ) : (
          <Panel title="Units" flush meta={<span>Click a row for its {dates.length}-report history</span>}
            foot="Power is the percent of licensed thermal power reported each morning. Δ is the change in percentage points since the previous report.">
            {!data ? <div className="skeleton" style={{ height: 320, margin: 12 }} />
              : shown.length ? <UnitTable rows={shown} dates={dates} openUnit={openUnit} onToggle={toggleUnit} />
                : <Empty>No units match these filters. <button className="btn" type="button" onClick={() => { setQ(''); setParam('status', null) }}>Clear filters</button></Empty>}
          </Panel>
        )}
      </div>
    </div>
  )
}
