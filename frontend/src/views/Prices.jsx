import { useMemo } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useRoute, setParam } from '../lib/router'
import { useQueryText, useSort } from '../lib/hooks'
import { num, signed, month } from '../lib/format'
import TimeChart from '../components/TimeChart'
import { Board, Tile, Metrics, Metric, SourceTag, Seg, Th, Meter, Empty, Skeleton, LoadState, U } from '../components/ui'

const SECTORS = [['res', 'Residential'], ['com', 'Commercial'], ['ind', 'Industrial'], ['all', 'All sectors']]
const SECTOR_LABEL = Object.fromEntries(SECTORS)
const centsFormat = v => `${num(v, 1)}¢`

function UsTrend({ history, sector }) {
  const { x, series } = useMemo(() => {
    const points = (history || []).filter(p => typeof p[sector] === 'number')
    return {
      x: points.map(p => Date.parse(`${p.period}-15T00:00:00Z`)),
      series: [{ label: 'US', values: points.map(p => p[sector]) }],
    }
  }, [history, sector])
  return (
    <Tile span={4} label={<>US average · <b>{SECTOR_LABEL[sector]}</b></>} hint="The US average price by month.">
      <div className="stick">
        {x.length >= 2
          ? <TimeChart x={x} series={series} area height={180} format={centsFormat} ariaLabel="US average retail price by month" />
          : <Empty>too few months</Empty>}
      </div>
    </Tile>
  )
}

export default function Prices() {
  const res = useResource('/api/prices', EVERY.prices)
  const { params } = useRoute()
  const sector = SECTOR_LABEL[params.get('sector')] ? params.get('sector') : 'res'
  const [q, setQ, dq] = useQueryText(params)

  const data = res.data?.prices
  const us = data?.us
  const rows = useMemo(() => (data?.rows || []).map(r => ({
    state: r.state, name: r.name, price: r[sector], yoy: r[`${sector}_yoy`],
    diff: typeof r[sector] === 'number' && typeof us?.[sector] === 'number' ? r[sector] - us[sector] : null,
  })), [data, sector, us])
  const terms = dq.trim().toLowerCase()
  const visible = rows.filter(r => !terms || r.name.toLowerCase().includes(terms) || r.state.toLowerCase() === terms)
  const { sorted, sort, toggle } = useSort(visible, 'price', 'desc')
  const max = Math.max(0, ...visible.map(r => r.price ?? 0), us?.[sector] ?? 0) || 1

  return (
    <>
      <LoadState res={res} what="prices" />
      <div className="bar">
        <Seg label="Sector" options={SECTORS.map(([k, l]) => [k, l.toLowerCase()])} value={sector} onChange={key => setParam('sector', key === 'res' ? null : key)} />
        <input className="input" type="search" data-search placeholder="filter states" aria-label="Filter states"
          value={q} onChange={e => setQ(e.target.value)} />
        {data && <span className="count">{visible.length}/{rows.length}</span>}
      </div>
      <Board>
        <Metrics>
          {SECTORS.map(([key, label]) => (
            <Metric key={key} label={label} value={us ? num(us[key], 2) : data === null ? '—' : null} unit="¢/kWh"
              note={us && `${signed(us[`${key}_yoy`], 1, '%')} vs last year`} hint={key === 'res' ? 'US average price per kilowatt-hour for homes. A typical home uses about 900 kWh a month.' : undefined} />
          ))}
        </Metrics>
        <Tile span={8} flush label={<>By state · <b>{SECTOR_LABEL[sector]}</b>{data ? ` · ${month(data.period)}` : ''}</>}
          meta={<SourceTag meta={res.data?.sources?.eia_prices} name="EIA" />}
          hint="Average price paid per kilowatt-hour, from EIA's monthly survey, about three months behind. Not the rate on any specific plan.">
          {!data ? <Skeleton height={320} /> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <Th k="name" sort={sort} onSort={toggle}>State</Th>
                  <Th k="price" sort={sort} onSort={toggle} num>Price <U>¢/kWh</U></Th>
                  <Th k="yoy" sort={sort} onSort={toggle} num>vs last year</Th>
                  <Th k="diff" sort={sort} onSort={toggle} num className="hide-sm">vs US <U>¢</U></Th>
                </tr></thead>
                <tbody>
                  {us && (
                    <tr className="pinned">
                      <td>United States</td>
                      <td className="num"><Meter value={us[sector]} max={max} />{num(us[sector], 2)}</td>
                      <td className="num">{signed(us[`${sector}_yoy`], 1, '%')}</td>
                      <td className="num hide-sm subtle">—</td>
                    </tr>
                  )}
                  {sorted.map(r => (
                    <tr key={r.state}>
                      <td>{r.name} <span className="subtle mono">{r.state}</span></td>
                      <td className="num"><Meter value={r.price} max={max} />{num(r.price, 2)}</td>
                      <td className="num">{signed(r.yoy, 1, '%')}</td>
                      <td className="num hide-sm muted">{signed(r.diff, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!sorted.length && <Empty>no match</Empty>}
            </div>
          )}
        </Tile>
        <UsTrend history={data?.us_history} sector={sector} />
      </Board>
    </>
  )
}
