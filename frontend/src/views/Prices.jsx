import { useEffect, useMemo, useState } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useRoute, setParam } from '../lib/router'
import { useSort } from '../lib/hooks'
import { num, signed, month } from '../lib/format'
import TimeChart from '../components/TimeChart'
import { Panel, Stat, SourceTag, Seg, Th, Empty, LoadState } from '../components/ui'
import './pages.css'

const SECTORS = [['res', 'Residential'], ['com', 'Commercial'], ['ind', 'Industrial'], ['all', 'All sectors']]
const SECTOR_LABEL = Object.fromEntries(SECTORS)
const centsFormat = v => `${num(v, 1)}¢`

function UsTrend({ history, sector }) {
  const { x, series } = useMemo(() => {
    const points = (history || []).filter(p => typeof p[sector] === 'number')
    return {
      x: points.map(p => Date.parse(`${p.period}-15T00:00:00Z`)),
      series: [{ label: `US ${SECTOR_LABEL[sector].toLowerCase()}`, values: points.map(p => p[sector]), color: 'var(--series-1)' }],
    }
  }, [history, sector])
  return (
    <Panel title={`US average, ${SECTOR_LABEL[sector].toLowerCase()}`}>
      {x.length >= 2
        ? <TimeChart x={x} series={series} height={160} format={centsFormat} ariaLabel="US average retail price by month" />
        : <Empty>Not enough months to chart.</Empty>}
      {x.length > 0 && x.length < 6 && <p className="chart-note" style={{ margin: '8px 0 0' }}>The current source returns only the latest month and the same month a year earlier.</p>}
    </Panel>
  )
}

export default function Prices() {
  const res = useResource('/api/prices', EVERY.prices)
  const { params } = useRoute()
  const sector = SECTOR_LABEL[params.get('sector')] ? params.get('sector') : 'res'
  const [q, setQ] = useState(params.get('q') || '')
  useEffect(() => { setParam('q', q) }, [q])

  const data = res.data?.prices
  const us = data?.us
  const rows = useMemo(() => (data?.rows || []).map(r => ({
    state: r.state, name: r.name, price: r[sector], yoy: r[`${sector}_yoy`],
    diff: typeof r[sector] === 'number' && typeof us?.[sector] === 'number' ? r[sector] - us[sector] : null,
  })), [data, sector, us])
  const terms = q.trim().toLowerCase()
  const visible = rows.filter(r => !terms || r.name.toLowerCase().includes(terms) || r.state.toLowerCase() === terms)
  const { sorted, sort, toggle } = useSort(visible, 'price', 'desc')
  const max = Math.max(0, ...visible.map(r => r.price ?? 0), us?.[sector] ?? 0) || 1
  const bar = v => (typeof v === 'number' ? <span className="bar-track"><span style={{ width: `${(v / max) * 100}%` }} /></span> : null)

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Retail electricity prices</h1>
        <p>{data ? `${month(data.period)} · average revenue per kWh sold, EIA` : 'Average revenue per kWh sold, EIA'}</p>
        <span className="spacer" />
        <SourceTag meta={res.data?.sources?.eia_prices} name="EIA" />
      </div>
      <LoadState res={res} what="prices" />
      <div className="stats">
        {SECTORS.map(([key, label]) => (
          <Stat key={key} label={`US ${label.toLowerCase()}`} value={us ? num(us[key], 2) : data === null ? '—' : null} unit="¢/kWh"
            sub={us && `${signed(us[`${key}_yoy`], 1, '%')} vs a year earlier`} />
        ))}
      </div>
      <div className="cols">
        <Panel title={`By state, ${SECTOR_LABEL[sector].toLowerCase()}`} flush
          foot="Monthly averages, about three months behind. Not a tariff or wholesale price.">
          <div style={{ padding: '12px 12px 0' }}>
            <div className="toolbar">
              <Seg label="Sector" options={SECTORS} value={sector} onChange={key => setParam('sector', key === 'res' ? null : key)} />
              <input className="input" type="search" data-search placeholder="Filter states" aria-label="Filter states"
                value={q} onChange={e => setQ(e.target.value)} />
              <span className="muted" style={{ fontSize: 12 }}>{visible.length} of {rows.length}</span>
            </div>
          </div>
          {!data ? <div className="skeleton" style={{ height: 320, margin: 12 }} /> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <Th k="name" sort={sort} onSort={toggle}>State</Th>
                  <Th k="price" sort={sort} onSort={toggle} num>¢/kWh</Th>
                  <Th k="yoy" sort={sort} onSort={toggle} num>Year over year</Th>
                  <Th k="diff" sort={sort} onSort={toggle} num className="hide-sm">vs US</Th>
                </tr></thead>
                <tbody>
                  {us && (
                    <tr className="pinned">
                      <td>United States</td>
                      <td className="num">{bar(us[sector])}{num(us[sector], 2)}</td>
                      <td className="num">{signed(us[`${sector}_yoy`], 1, '%')}</td>
                      <td className="num hide-sm subtle">—</td>
                    </tr>
                  )}
                  {sorted.map(r => (
                    <tr key={r.state}>
                      <td>{r.name} <span className="subtle">{r.state}</span></td>
                      <td className="num">{bar(r.price)}{num(r.price, 2)}</td>
                      <td className={`num ${r.yoy > 0 ? '' : 'muted'}`}>{signed(r.yoy, 1, '%')}</td>
                      <td className="num hide-sm">{signed(r.diff, 2, '¢')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!sorted.length && <Empty>No state matches “{q}”.</Empty>}
            </div>
          )}
        </Panel>
        <UsTrend history={data?.us_history} sector={sector} />
      </div>
    </div>
  )
}
