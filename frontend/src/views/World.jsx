import { useEffect, useMemo, useState } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useRoute, setParam } from '../lib/router'
import { useSort } from '../lib/hooks'
import { gw, num, date } from '../lib/format'
import { Board, Tile, Metrics, Metric, SourceTag, Th, Meter, Empty, Skeleton, LoadState, U } from '../components/ui'

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
  const missing = data === null ? '—' : null

  const cells = (c, total) => (
    <>
      <td className="num">{num(c.operable)}</td>
      <td className="num">{!total && <Meter value={c.operable_mwe} max={max} />}{gw(c.operable_mwe)}</td>
      <td className="num">{num(c.construction)}</td>
      <td className="num">{num(c.planned)}</td>
      <td className="num hide-sm">{num(c.proposed)}</td>
      <td className="num">{typeof c.share_pct === 'number' ? `${c.share_approx ? '≈' : ''}${num(c.share_pct, 1)}` : '—'}</td>
      <td className="num hide-sm">{num(c.generation_twh, 1)}</td>
    </>
  )

  return (
    <>
      <LoadState res={res} what="world" />
      <div className="bar">
        <input className="input" type="search" data-search placeholder="filter countries" aria-label="Filter countries"
          value={q} onChange={e => setQ(e.target.value)} />
        {data && <span className="count">{visible.length}/{countries.length}</span>}
      </div>
      <Board>
        <Metrics>
          <Metric label="Operable" value={world ? num(world.operable) : missing} note={world && `${gw(world.operable_mwe, 0)} GWe net`} hint="Reactors able to run, including some not producing right now." />
          <Metric label="Building" value={world ? num(world.construction) : missing} note={world && `${gw(world.construction_mwe, 0)} GWe gross`} />
          <Metric label="Planned" value={world ? num(world.planned) : missing} note={world && `${gw(world.planned_mwe, 0)} GWe gross`} />
          <Metric label="Countries" value={data ? num(operating) : null} note={data && `of ${countries.length} listed`} hint="Countries with at least one operable reactor." />
        </Metrics>
        <Tile flush label={<>By country{data ? ` · table ${date(data.updated, true)}` : ''}</>} meta={<SourceTag meta={res.data?.sources?.wna} name="WNA" />}
          hint="Nuclear power by country from the World Nuclear Association. Share is nuclear's part of that country's electricity.">
          {!data ? <Skeleton height={320} /> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <Th k="name" sort={sort} onSort={toggle}>Country</Th>
                  <Th k="operable" sort={sort} onSort={toggle} num>Operable</Th>
                  <Th k="operable_mwe" sort={sort} onSort={toggle} num>Net <U>GWe</U></Th>
                  <Th k="construction" sort={sort} onSort={toggle} num>Building</Th>
                  <Th k="planned" sort={sort} onSort={toggle} num>Planned</Th>
                  <Th k="proposed" sort={sort} onSort={toggle} num className="hide-sm">Proposed</Th>
                  <Th k="share_pct" sort={sort} onSort={toggle} num>Share <U>%</U></Th>
                  <Th k="generation_twh" sort={sort} onSort={toggle} num className="hide-sm"><U>TWh {data.generation_year ?? ''}</U></Th>
                </tr></thead>
                <tbody>
                  {sorted.map(c => <tr key={c.name}><td>{c.name}</td>{cells(c, false)}</tr>)}
                  {world && !terms && <tr className="pinned"><td>World</td>{cells(world, true)}</tr>}
                </tbody>
              </table>
              {!sorted.length && <Empty>no match</Empty>}
            </div>
          )}
        </Tile>
      </Board>
    </>
  )
}
