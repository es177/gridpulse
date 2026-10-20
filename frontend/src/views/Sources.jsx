import { Fragment } from 'react'
import { useResource, useSources, EVERY } from '../lib/api'
import { useNow } from '../lib/hooks'
import { age, observed } from '../lib/format'
import { sourceState, STATE_LABEL } from '../lib/status'
import { Board, Tile, Banner, Ext, Tag, Skeleton } from '../components/ui'

const GROUPS = [
  ['Grid', name => name.startsWith('eia_')],
  ['Operators', name => name.startsWith('iso_')],
  ['Nuclear', name => name.startsWith('nrc_')],
  ['News', name => name === 'feeds'],
  ['World', name => name === 'wna' || name === 'owid'],
]

// How every number gets here, in order.
const PIPELINE = [
  ['Fetch', 'The server requests each upstream endpoint listed below once its copy is older than the source\'s refresh interval and someone is using the site. A weekly job also refreshes every source.'],
  ['Parse', 'A parser written for each publisher turns the response into numbers: JSON APIs, CSV and text files, RSS feeds and a few HTML tables.'],
  ['Check', 'A response is rejected when required fields, row counts, units or value ranges are wrong. Nothing is estimated or filled in.'],
  ['Keep', 'A rejected or failed fetch leaves the last good copy in place, and the source shows as retrying or stale above.'],
  ['Serve', 'The API returns the cached data with each source\'s observation time, when it was downloaded, and whether this server downloaded it or loaded it from the startup snapshot. Your browser decides what counts as current.'],
]

// Public JSON routes; no key needed.
const ROUTES = [
  ['/api/grid', 'EIA hourly demand, forecast, net generation and interchange by region for 72 hours; US48 generation by fuel for 96 hours'],
  ['/api/live', 'Six grid operators: latest load, fuel mix and price, plus today in 15-minute points'],
  ['/api/reactors', 'Every operating US reactor with a year of NRC daily power readings'],
  ['/api/feed', 'Filtered news and NRC plant events with links to the originals'],
  ['/api/prices', 'Average retail electricity price by state and sector'],
  ['/api/global', 'World Nuclear Association fleet table and yearly electricity by source per country'],
  ['/api/status', 'Every source: observation time, fetch time, refresh interval and last error'],
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
      <td><Ext href={meta.url}>{meta.label}{meta.url ? ' ↗' : ''}</Ext></td>
      <td className="muted hide-sm">{meta.cadence}</td>
      <td className="mono">{meta.observed_at ? observed(meta) : <span className="subtle">—</span>}</td>
      <td className="num muted">{meta.observed_at ? age(meta.observed_at, now) : '—'}</td>
      <td className="num subtle hide-sm" title="Marked stale after this long without a new observation">{short(meta.stale_after)}</td>
      <td className="num muted">{meta.fetched_at ? age(meta.fetched_at, now) : '—'}{meta.origin === 'snapshot' && <> <Tag>snapshot</Tag></>}</td>
      <td className="num muted">{meta.checked_at ? age(meta.checked_at, now) : 'not yet'}</td>
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
        <Tile flush label="Sources" meta={<span>{names.length}</span>} hint="Every number on this site comes from these public sources. Green is current, amber is late or retrying, red is unavailable; the site keeps showing the last good data. Retrieved is when the data was downloaded from the publisher; snapshot marks a copy loaded at startup that this server has not refetched yet. Checked is this server's last attempt.">
          {!names.length ? <Skeleton height={320} /> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>State</th><th>Source</th><th className="hide-sm">Cadence</th>
                  <th>Observed</th><th className="num">Age</th><th className="num hide-sm">Stale at</th><th className="num">Retrieved</th><th className="num">Checked</th><th>Error</th>
                </tr></thead>
                <tbody>
                  {GROUPS.map(([group, match]) => {
                    const rows = names.filter(match)
                    if (!rows.length) return null
                    return (
                      <Fragment key={group}>
                        <tr className="group"><td colSpan={9} className="label">{group}</td></tr>
                        {rows.map(name => <SourceRow key={name} meta={metas[name]} />)}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Tile>
        <Tile span={6} label="Method" hint="How a number gets from the publisher to this page.">
          <dl className="steps">
            {PIPELINE.map(([step, text]) => <div key={step}><dt>{step}</dt><dd>{text}</dd></div>)}
          </dl>
        </Tile>
        <Tile span={6} flush label="Data API" hint="Every figure on the site can be downloaded as JSON from these routes, from any site or script (CORS is open). Grid and World also export CSV.">
          <ul className="rows">
            {ROUTES.map(([path, what]) => (
              <li key={path} className="route"><a className="mono" href={path}>{path}</a><span className="muted">{what}</span></li>
            ))}
          </ul>
        </Tile>
        <Tile flush label="Upstream endpoints" hint="The exact addresses each parser reads, so any figure can be checked against its publisher.">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Source</th><th className="hide-sm">Format</th><th>Endpoints</th><th className="hide-sm">Refresh</th></tr></thead>
              <tbody>
                {names.map(name => {
                  const m = metas[name]
                  return (
                    <tr key={name}>
                      <td><Ext href={m.url}>{m.label}</Ext></td>
                      <td className="muted hide-sm">{m.method || '—'}</td>
                      <td className="wrap mono">{(m.endpoints?.length ? m.endpoints : [m.url]).filter(Boolean).map(u => (
                        <div key={u}>{u.includes('{') ? u.replace(/^https:\/\//, '') : <Ext href={u}>{u.replace(/^https:\/\//, '')}</Ext>}</div>
                      ))}</td>
                      <td className="muted hide-sm">{m.cadence}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Tile>
      </Board>
      <p className="note">Data belongs to its publishers: EIA, NRC, the six grid operators, the World Nuclear Association, Ember and the Energy Institute via Our World in Data, and the news publishers linked in the feed. GridPulse is not affiliated with any of them. Code is MIT licensed.</p>
    </>
  )
}
