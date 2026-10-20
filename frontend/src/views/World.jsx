import { useMemo, useRef } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useRoute, setParam } from '../lib/router'
import { useQueryText, useSort } from '../lib/hooks'
import { gw, num, date, signed } from '../lib/format'
import { toCSV, download } from '../lib/derive'
import { FUEL_LABEL, fuelVar } from '../lib/fuels'
import TimeChart from '../components/TimeChart'
import { Board, Tile, Metrics, Metric, SourceTag, Seg, Th, Meter, MixBar, LineLegend, Empty, Skeleton, LoadState, U, Icon } from '../components/ui'

const MAX = 6                       // one validated color per selection slot
const slotVar = slot => `var(--cmp-${slot + 1})`
const MIX = ['nuclear', 'coal', 'gas', 'hydro', 'wind', 'solar', 'other']
const share = (y, keys) => (y?.gen ? keys.reduce((s, k) => s + (y[k] || 0), 0) / y.gen * 100 : null)

// Yearly measures for the trend chart: [key, label, value of a year row, tooltip format, axis format].
const TRENDS = [
  ['share', 'Nuclear share', y => y.share, v => `${num(v, 1)}%`, v => `${num(v)}%`],
  ['nuclear', 'Nuclear TWh', y => y.nuclear, v => `${num(v, 1)} TWh`, v => num(v)],
  ['gen', 'Generation TWh', y => y.gen, v => `${num(v, 0)} TWh`, v => num(v)],
  ['clean', 'Hydro, wind, solar %', y => share(y, ['hydro', 'wind', 'solar']), v => `${num(v, 1)}%`, v => `${num(v)}%`],
  ['carbon', 'gCO₂/kWh', y => y.carbon, v => `${num(v, 0)} g/kWh`, v => num(v)],
  ['per_capita', 'kWh per person', y => y.per_capita, v => `${num(v, 0)} kWh`, v => num(v)],
]

/** Selected ISO3 codes from ?c=, with colors that stay with a country when others are added or removed. */
function useSelection(params) {
  const selected = (params.get('c') || '').split(',').filter(Boolean).slice(0, MAX)
  const slots = useRef(new Map())
  for (const code of [...slots.current.keys()]) if (!selected.includes(code)) slots.current.delete(code)
  for (const code of selected) {
    if (slots.current.has(code)) continue
    const used = new Set(slots.current.values())
    let slot = 0
    while (used.has(slot)) slot++
    slots.current.set(code, slot)
  }
  const set = codes => setParam('c', codes.length ? codes.join(',') : null)
  const toggle = code => set(selected.includes(code) ? selected.filter(c => c !== code) : [...selected, code].slice(0, MAX))
  return { selected, slotOf: code => slots.current.get(code), toggle, set }
}

function Compare({ picks, meta, wnaYear, onClear }) {
  const { params } = useRoute()
  const trend = TRENDS.find(t => t[0] === params.get('m')) || TRENDS[0]
  // Electricity rows compare one year that every selected country has.
  const year = Math.min(...picks.map(p => p.years.at(-1)?.year ?? Infinity))
  const at = p => p.years.find(y => y.year === year)
  const before = p => p.years.find(y => y.year === year - 10)

  const rows = [
    ['Operable reactors', p => num(p.wna?.operable)],
    ['Net capacity, GWe', p => gw(p.wna?.operable_mwe)],
    ['Under construction', p => num(p.wna?.construction)],
    ['Construction, GWe gross', p => gw(p.wna?.construction_mwe)],
    ['Planned', p => num(p.wna?.planned)],
    ['Proposed', p => num(p.wna?.proposed)],
    [`Nuclear share, % net (WNA ${wnaYear ?? ''})`, p => (typeof p.wna?.share_pct === 'number' ? `${p.wna.share_approx ? '≈' : ''}${num(p.wna.share_pct, 1)}` : '—')],
    ['Uranium required, tU per year', p => num(p.wna?.uranium_t)],
    [`Generation, TWh (Ember ${year})`, p => num(at(p)?.gen, 0)],
    [`Nuclear, TWh (Ember ${year})`, p => num(at(p)?.nuclear, 1)],
    [`Nuclear share, % (Ember ${year})`, p => num(at(p)?.share, 1)],
    [`Nuclear share change since ${year - 10}, pts (Ember)`, p => signed(at(p)?.share != null && before(p)?.share != null ? at(p).share - before(p).share : null, 1)],
    [`Hydro, wind, solar, % (Ember ${year})`, p => num(share(at(p), ['hydro', 'wind', 'solar']), 1)],
    [`Coal and gas, % (Ember ${year})`, p => num(share(at(p), ['coal', 'gas']), 1)],
    [`Carbon intensity, gCO₂/kWh (Ember ${year})`, p => num(at(p)?.carbon, 0)],
    [`Electricity per person, kWh (Ember ${year})`, p => num(at(p)?.per_capita, 0)],
  ]

  const chart = useMemo(() => {
    const years = [...new Set(picks.flatMap(p => p.years.map(y => y.year)))].sort((a, b) => a - b)
    return {
      x: years.map(y => Date.UTC(y, 6, 1)),
      series: picks.map(p => {
        const byYear = new Map(p.years.map(y => [y.year, trend[2](y)]))
        return { label: p.name, values: years.map(y => byYear.get(y) ?? null), color: slotVar(p.slot), width: 2 }
      }),
    }
  }, [picks, trend])

  const exportCSV = () => {
    const out = picks.flatMap(p => p.years.map(y => ({ country: p.name, iso3: p.code, ...y })))
    download(`gridpulse-${picks.map(p => p.code).join('-')}.csv`,
      toCSV(out, ['country', 'iso3', 'year', 'gen', 'nuclear', 'coal', 'gas', 'hydro', 'wind', 'solar', 'other', 'share', 'carbon', 'per_capita']))
  }

  return <>
    <Tile flush label={`Compare · ${picks.length} countries`}
      meta={<><button className="btn bare" type="button" onClick={exportCSV}>{Icon.download}csv</button><button className="btn bare" type="button" onClick={onClear}>clear</button></>}
      hint="Fleet rows come from the World Nuclear Association table. Electricity rows are yearly figures from Ember and the Energy Institute via Our World in Data, for the latest year all selected countries have.">
      <div className="table-wrap">
        <table className="compare">
          <thead><tr>
            <th />
            {picks.map(p => <th key={p.code} className="num"><span className="swatch" style={{ background: slotVar(p.slot) }} /><U>{p.name}</U></th>)}
          </tr></thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}><td className="muted">{label}</td>{picks.map(p => <td key={p.code} className="num">{value(p)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tile>
    <Tile span={8} label={<>Trend · <b>{trend[1]}</b></>} meta={<SourceTag meta={meta} name="Ember via OWID" />}
      hint="One line per selected country, one point per year.">
      <div className="bar" style={{ marginBottom: 10 }}>
        <Seg label="Measure" value={trend[0]} onChange={m => setParam('m', m === 'share' ? null : m)} options={TRENDS.map(([k, label]) => [k, label.toLowerCase()])} />
      </div>
      <LineLegend items={picks.map(p => [p.name, slotVar(p.slot)])} />
      <TimeChart x={chart.x} series={chart.series} height={260} format={trend[3]} axisFormat={trend[4]}
        ariaLabel={`${trend[1]} by year for ${picks.map(p => p.name).join(', ')}`} />
    </Tile>
    <Tile span={4} label={`Electricity mix · ${year}`} meta={<SourceTag meta={meta} name="Ember via OWID" />}
      hint="Each country's generation by source in the same year. Other is oil, bioenergy and other renewables.">
      <div className="mixrows">
        {picks.map(p => {
          const y = at(p)
          return [
            <span key={`${p.code}-n`} className="name"><span className="swatch" style={{ background: slotVar(p.slot) }} />{p.name}</span>,
            y ? <MixBar key={`${p.code}-b`} mix={Object.fromEntries(MIX.map(f => [f, y[f] ?? 0]))} height={10} unit="TWh" />
              : <span key={`${p.code}-b`} className="subtle mono">—</span>,
            <span key={`${p.code}-t`} className="mono subtle">{y ? `${num(y.gen, 0)} TWh` : ''}</span>,
          ]
        })}
      </div>
      <div className="legend" style={{ marginTop: 12 }}>
        {MIX.map(f => <span key={f}><i style={{ background: fuelVar(f) }} />{FUEL_LABEL[f]}</span>)}
      </div>
    </Tile>
  </>
}

export default function World() {
  const res = useResource('/api/global', EVERY.world)
  const { params } = useRoute()
  const [q, setQ, dq] = useQueryText(params)
  const { selected, slotOf, toggle, set } = useSelection(params)

  const data = res.data?.world
  const mix = res.data?.mix
  const world = data?.world
  const countries = useMemo(() => data?.countries || [], [data])
  const terms = dq.trim().toLowerCase()
  const visible = countries.filter(c => !terms || c.name.toLowerCase().includes(terms))
  const { sorted, sort, toggle: sortBy } = useSort(visible, 'operable_mwe', 'desc')
  const max = Math.max(1, ...countries.map(c => c.operable_mwe ?? 0))
  const operating = countries.filter(c => c.operable > 0).length
  const missing = data === null ? '—' : null

  const byCode = useMemo(() => {
    const out = new Map(countries.filter(c => c.iso3).map(c => [c.iso3, c]))
    if (world) out.set('WLD', { ...world, name: 'World', iso3: 'WLD' })
    return out
  }, [countries, world])
  const picks = selected
    .filter(code => byCode.has(code) && mix?.countries?.[code]?.years?.length)
    .map(code => ({ code, slot: slotOf(code), name: byCode.get(code).name, wna: byCode.get(code), years: mix.countries[code].years }))
  const top5 = [...countries].filter(c => c.iso3).sort((a, b) => (b.operable_mwe ?? 0) - (a.operable_mwe ?? 0)).slice(0, 5).map(c => c.iso3)

  const row = (c, total = false) => {
    const code = total ? 'WLD' : c.iso3
    const on = selected.includes(code)
    return (
      <tr key={total ? 'WLD' : c.name} className={`${code ? 'clickable' : ''}${total ? ' pinned' : ''}`} onClick={code ? () => toggle(code) : undefined}>
        <td className="pick" onClick={e => e.stopPropagation()}>
          {code && <input type="checkbox" checked={on} disabled={!on && selected.length >= MAX}
            onChange={() => toggle(code)} aria-label={`Compare ${total ? 'World' : c.name}`} />}
        </td>
        <td>{on && <span className="swatch" style={{ background: slotVar(slotOf(code)) }} />}{total ? 'World' : c.name}</td>
        <td className="num">{num(c.operable)}</td>
        <td className="num">{!total && <Meter value={c.operable_mwe} max={max} />}{gw(c.operable_mwe)}</td>
        <td className="num">{num(c.construction)}</td>
        <td className="num">{num(c.planned)}</td>
        <td className="num hide-sm">{num(c.proposed)}</td>
        <td className="num">{typeof c.share_pct === 'number' ? `${c.share_approx ? '≈' : ''}${num(c.share_pct, 1)}` : '—'}</td>
        <td className="num hide-sm">{num(c.generation_twh, 1)}</td>
      </tr>
    )
  }

  return (
    <>
      <LoadState res={res} what="world" />
      <div className="bar">
        <input className="input" type="search" data-search placeholder="filter countries" aria-label="Filter countries"
          value={q} onChange={e => setQ(e.target.value)} />
        {data && <span className="count">{visible.length}/{countries.length}</span>}
        <span className="grow" />
        <span className="count">{selected.length ? `${selected.length}/${MAX} selected` : 'tick countries to compare'}</span>
        {selected.length < 2 && data && <button className="btn" type="button" onClick={() => set(top5)}>compare top 5</button>}
      </div>
      <Board>
        <Metrics>
          <Metric label="Operable" value={world ? num(world.operable) : missing} note={world && `${gw(world.operable_mwe, 0)} GWe net`} hint="Reactors able to run, including some not producing right now." />
          <Metric label="Building" value={world ? num(world.construction) : missing} note={world && `${gw(world.construction_mwe, 0)} GWe gross`} />
          <Metric label="Planned" value={world ? num(world.planned) : missing} note={world && `${gw(world.planned_mwe, 0)} GWe gross`} />
          <Metric label="Countries" value={data ? num(operating) : null} note={data && `of ${countries.length} listed`} hint="Countries with at least one operable reactor." />
        </Metrics>
        {picks.length >= 2 && <Compare picks={picks} meta={res.data?.sources?.owid} wnaYear={data?.generation_year} onClear={() => set([])} />}
        {picks.length === 1 && <Tile label="Compare"><Empty>{picks[0].name} selected · tick another country</Empty></Tile>}
        <Tile flush label={<>By country{data ? ` · table ${date(data.updated, true)}` : ''}</>} meta={<SourceTag meta={res.data?.sources?.wna} name="WNA" />}
          hint="Nuclear power by country from the World Nuclear Association. Share is nuclear's part of that country's electricity. Tick rows to compare them.">
          {!data ? <Skeleton height={320} /> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th className="pick" />
                  <Th k="name" sort={sort} onSort={sortBy}>Country</Th>
                  <Th k="operable" sort={sort} onSort={sortBy} num>Operable</Th>
                  <Th k="operable_mwe" sort={sort} onSort={sortBy} num>Net <U>GWe</U></Th>
                  <Th k="construction" sort={sort} onSort={sortBy} num>Building</Th>
                  <Th k="planned" sort={sort} onSort={sortBy} num>Planned</Th>
                  <Th k="proposed" sort={sort} onSort={sortBy} num className="hide-sm">Proposed</Th>
                  <Th k="share_pct" sort={sort} onSort={sortBy} num>Share <U>%</U></Th>
                  <Th k="generation_twh" sort={sort} onSort={sortBy} num className="hide-sm"><U>TWh {data.generation_year ?? ''}</U></Th>
                </tr></thead>
                <tbody>
                  {sorted.map(c => row(c))}
                  {world && !terms && row(world, true)}
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
