import { useEffect, useMemo, useState } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useRoute, setParam } from '../lib/router'
import { useSort } from '../lib/hooks'
import { gw, num, date } from '../lib/format'
import { Panel, Stat, SourceTag, Th, Empty, LoadState } from '../components/ui'
import './pages.css'

export default function World() {
  const res = useResource('/api/global', EVERY.world)
  const { params } = useRoute()
  const [q, setQ] = useState(params.get('q') || '')
  useEffect(() => { setParam('q', q) }, [q])

  const data = res.data?.world
  const world = data?.world
  const countries = useMemo(() => data?.countries || [], [data])
  const terms = q.trim().toLowerCase()
  const visible = countries.filter(c => !terms || c.name.toLowerCase().includes(terms))
  const { sorted, sort, toggle } = useSort(visible, 'operable_mwe', 'desc')
  const max = Math.max(1, ...countries.map(c => c.operable_mwe ?? 0))
  const operating = countries.filter(c => c.operable > 0).length

  const cells = (c, total) => (
    <>
      <td className="num">{num(c.operable)}</td>
      <td className="num">
        {!total && typeof c.operable_mwe === 'number' && <span className="bar-track"><span style={{ width: `${(c.operable_mwe / max) * 100}%` }} /></span>}
        {gw(c.operable_mwe)}
      </td>
      <td className="num">{num(c.construction)}</td>
      <td className="num">{num(c.planned)}</td>
      <td className="num hide-sm">{num(c.proposed)}</td>
      <td className="num">{typeof c.share_pct === 'number' ? `${c.share_approx ? '≈' : ''}${num(c.share_pct, 1)}%` : '—'}</td>
      <td className="num hide-sm">{num(c.generation_twh, 1)}</td>
    </>
  )

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>World nuclear fleet</h1>
        <p>World Nuclear Association{data ? ` · generation year ${data.generation_year ?? '—'} · table updated ${date(data.updated, true)}` : ''}</p>
        <span className="spacer" />
        <SourceTag meta={res.data?.sources?.wna} name="WNA" />
      </div>
      <LoadState res={res} what="the world fleet table" />
      <div className="stats">
        <Stat label="Operable reactors" value={world ? num(world.operable) : data === null ? '—' : null} sub={world && `${gw(world.operable_mwe, 0)} GWe net`} />
        <Stat label="Under construction" value={world ? num(world.construction) : data === null ? '—' : null} sub={world && `${gw(world.construction_mwe, 0)} GWe gross`} />
        <Stat label="Planned" value={world ? num(world.planned) : data === null ? '—' : null} sub={world && `${gw(world.planned_mwe, 0)} GWe gross`} />
        <Stat label="Countries with operable units" value={data ? num(operating) : null} sub={data && `${countries.length} countries listed`} />
      </div>
      <Panel title="By country" flush foot="Operable includes units not currently generating. Construction and planned capacity are gross MWe.">
        <div style={{ padding: '12px 12px 0' }}>
          <div className="toolbar">
            <input className="input" type="search" data-search placeholder="Filter countries" aria-label="Filter countries"
              value={q} onChange={e => setQ(e.target.value)} />
            <span className="muted" style={{ fontSize: 12 }}>{visible.length} of {countries.length}</span>
          </div>
        </div>
        {!data ? <div className="skeleton" style={{ height: 320, margin: 12 }} /> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <Th k="name" sort={sort} onSort={toggle}>Country</Th>
                <Th k="operable" sort={sort} onSort={toggle} num>Operable</Th>
                <Th k="operable_mwe" sort={sort} onSort={toggle} num>Net GWe</Th>
                <Th k="construction" sort={sort} onSort={toggle} num>Building</Th>
                <Th k="planned" sort={sort} onSort={toggle} num>Planned</Th>
                <Th k="proposed" sort={sort} onSort={toggle} num className="hide-sm">Proposed</Th>
                <Th k="share_pct" sort={sort} onSort={toggle} num>Share of generation</Th>
                <Th k="generation_twh" sort={sort} onSort={toggle} num className="hide-sm">{`TWh ${data.generation_year ?? ''}`}</Th>
              </tr></thead>
              <tbody>
                {sorted.map(c => <tr key={c.name}><td>{c.name}</td>{cells(c, false)}</tr>)}
                {world && !terms && <tr className="pinned"><td>World</td>{cells(world, true)}</tr>}
              </tbody>
            </table>
            {!sorted.length && <Empty>No country matches “{q}”.</Empty>}
          </div>
        )}
      </Panel>
    </div>
  )
}
