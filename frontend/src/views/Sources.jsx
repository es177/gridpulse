import { Fragment } from 'react'
import { useResource, useSources, EVERY } from '../lib/api'
import { useNow } from '../lib/hooks'
import { age, observed } from '../lib/format'
import { sourceState, STATE_LABEL } from '../lib/status'
import { Board, Tile, Banner, Skeleton } from '../components/ui'

const GROUPS = [
  ['Grid', name => name.startsWith('eia_')],
  ['Operators', name => name.startsWith('iso_')],
  ['Nuclear', name => name.startsWith('nrc_')],
  ['News', name => name === 'feeds'],
  ['World', name => name === 'wna'],
]

function short(seconds) {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 2 * 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

function SourceRow({ meta }) {
  const now = useNow()
  const state = sourceState(meta, now)
  return (
    <tr>
      <td><span className="src"><span className={`dot ${state}`} />{STATE_LABEL[state].toLowerCase()}</span></td>
      <td>{meta.url ? <a href={meta.url} target="_blank" rel="noreferrer">{meta.label} ↗</a> : meta.label}</td>
      <td className="muted hide-sm">{meta.cadence}</td>
      <td className="mono">{meta.observed_at ? observed(meta) : <span className="subtle">—</span>}</td>
      <td className="num muted">{meta.observed_at ? age(meta.observed_at, now) : '—'}</td>
      <td className="num subtle hide-sm" title="Marked stale after this long without a new observation">{short(meta.stale_after)}</td>
      <td className="num muted">{age(meta.fetched_at, now)}</td>
      <td className={meta.error ? 'mono warn' : 'mono subtle'}>{meta.error || '—'}</td>
    </tr>
  )
}

export default function Sources() {
  const resources = [
    useResource('/api/grid', EVERY.grid),
    useResource('/api/live', EVERY.live),
    useResource('/api/reactors', EVERY.reactors),
    useResource('/api/feed', EVERY.feed),
    useResource('/api/prices', EVERY.prices),
    useResource('/api/global', EVERY.world),
  ]
  const metas = useSources()
  const names = Object.keys(metas)
  const failed = resources.filter(r => r.error).length

  return (
    <>
      {failed > 0 && <Banner>{failed}/{resources.length} requests failed · showing last status</Banner>}
      <Board>
        <Tile flush label="Sources" meta={<span title="Status is computed in your browser from each source's newest observation">{names.length}</span>}>
          {!names.length ? <Skeleton height={320} /> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>State</th><th>Source</th><th className="hide-sm">Cadence</th>
                  <th>Observed</th><th className="num">Age</th><th className="num hide-sm">Stale at</th><th className="num">Fetched</th><th>Error</th>
                </tr></thead>
                <tbody>
                  {GROUPS.map(([group, match]) => {
                    const rows = names.filter(match)
                    if (!rows.length) return null
                    return (
                      <Fragment key={group}>
                        <tr className="group"><td colSpan={8} className="label">{group}</td></tr>
                        {rows.map(name => <SourceRow key={name} meta={metas[name]} />)}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Tile>
      </Board>
    </>
  )
}
