import { useNow } from '../lib/hooks'
import { gw, num, pct, time } from '../lib/format'
import { isLive, mixSummary } from '../lib/derive'
import { FUEL_LABEL } from '../lib/fuels'
import { SourceTag, MixBar, U } from './ui'

/** One row per grid operator. detail adds net imports and price in place of the largest source. */
export default function IsoTable({ isos, sources, onSelect, detail = false }) {
  const now = useNow()
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>
          <th>ISO</th><th className="num">Load <U>GW</U></th><th style={{ width: '32%' }}>Mix</th>
          <th className="num hide-sm">Renew.</th>
          {detail
            ? <><th className="num hide-sm">Imports <U>GW</U></th><th className="num hide-sm">Price <U>$/MWh</U></th></>
            : <th className="hide-sm">Largest</th>}
          <th className="num">Time</th>
        </tr></thead>
        <tbody>
          {isos.map(iso => {
            const s = mixSummary(iso.mix)
            return (
              <tr key={iso.key} className="clickable" onClick={() => onSelect(iso.key)}>
                <td><span className="src iso"><SourceTag meta={sources[`iso_${iso.key}`]} showLabel={false} />{iso.iso}</span></td>
                <td className="num">{gw(iso.load_mw)}</td>
                <td>{iso.mix ? <MixBar mix={iso.mix} /> : <span className="subtle mono">—</span>}</td>
                <td className="num hide-sm">{pct(s?.renewable)}</td>
                {detail ? <>
                  <td className="num hide-sm">{typeof iso.mix?.imports === 'number' ? gw(iso.mix.imports) : '—'}</td>
                  <td className="num hide-sm">{iso.price ? num(iso.price.usd_mwh, 2) : '—'}</td>
                </> : <td className="hide-sm muted">{s ? FUEL_LABEL[s.top] : '—'}</td>}
                <td className={`num ${isLive(iso, now) ? 'subtle' : 'warn'}`}>{time(iso.observed_at)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
