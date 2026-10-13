import { useMemo } from 'react'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import us from 'us-atlas/states-10m.json'
import { num, signed } from '../lib/format'

// Standard Albers USA frame for a 975×610 canvas; computed once per page load.
const W = 975, H = 610
const projection = geoAlbersUsa().scale(1300).translate([W / 2, H / 2])
const path = geoPath(projection)
const LAND = path(feature(us, us.objects.nation))
const BORDERS = path(mesh(us, us.objects.states, (a, b) => a !== b))

// Draw order: problems on top so they are never hidden under full-power units.
const LAYER = { full: 0, unknown: 1, reduced: 2, offline: 3 }
const STATUS_LABEL = { full: 'Full', reduced: 'Reduced', offline: 'Offline', unknown: 'Unknown' }

/** Project units; spread co-located units (multi-unit sites) on a small ring. */
function place(units) {
  const sites = new Map()
  for (const u of units) {
    if (typeof u.lat !== 'number' || typeof u.lng !== 'number') continue
    const p = projection([u.lng, u.lat])
    if (!p) continue
    const key = `${Math.round(p[0] / 4)},${Math.round(p[1] / 4)}`
    if (!sites.has(key)) sites.set(key, { p, units: [] })
    sites.get(key).units.push(u)
  }
  const out = []
  for (const { p, units: group } of sites.values()) {
    const ring = group.length > 1 ? 3 + group.length : 0
    group.forEach((u, i) => {
      const a = (2 * Math.PI * i) / group.length - Math.PI / 2
      out.push({ u, x: p[0] + ring * Math.cos(a), y: p[1] + ring * Math.sin(a), r: 2.5 + Math.sqrt(u.mwe || 900) / 8 })
    })
  }
  return out.sort((a, b) => LAYER[a.u.status] - LAYER[b.u.status])
}

export default function ReactorMap({ units, selected, onSelect, onOpen }) {
  const dots = useMemo(() => place(units), [units])
  const unplaced = units.length - dots.length
  const counts = units.reduce((c, u) => ({ ...c, [u.status]: (c[u.status] || 0) + 1 }), {})
  const pick = units.find(u => u.name === selected)
  return (
    <div className="map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${dots.length} reactor units colored by reported power status`}>
        <path className="land" d={LAND} />
        <path className="borders" d={BORDERS} />
        {dots.map(({ u, x, y, r }) => (
          <circle key={u.name} cx={x.toFixed(1)} cy={y.toFixed(1)} r={r.toFixed(1)}
            className={`${u.status}${u.name === selected ? ' active' : ''}`}
            onClick={() => onSelect(u.name === selected ? null : u.name)}>
            <title>{`${u.name} — ${u.today ?? '—'}% (${STATUS_LABEL[u.status] || u.status})`}</title>
          </circle>
        ))}
      </svg>
      <div className="map-foot">
        <div className="legend">
          {['full', 'reduced', 'offline', 'unknown'].filter(s => counts[s]).map(s => (
            <span key={s}><span className={`dot ${s === 'full' ? 'ok' : s === 'reduced' ? 'stale' : s === 'offline' ? 'down' : ''}`} />{STATUS_LABEL[s]} <b>{counts[s]}</b></span>
          ))}
          {unplaced > 0 && <span className="subtle">{unplaced} without coordinates</span>}
          <span className="subtle">Circle size ∝ nameplate MWe · click a unit</span>
        </div>
        {pick && (
          <div className="map-card">
            <div>
              <b>{pick.name}</b> <span className="muted">{pick.state}</span>
              <div className="item-meta">
                <span className="mono">{pick.today ?? '—'}%</span>
                <span className={`mono ${pick.change < 0 ? 'down' : pick.change > 0 ? 'up' : 'subtle'}`}>{signed(pick.change, 0)} pt</span>
                <span>{num(pick.mwe, 0)} MWe</span>
                <span>{pick.operator || '—'}</span>
              </div>
            </div>
            <button className="btn" type="button" onClick={() => onOpen(pick.name)}>Open in table</button>
          </div>
        )}
      </div>
    </div>
  )
}
