import { Fragment } from 'react'
import { useResource, useSources, EVERY } from '../lib/api'
import { useNow } from '../lib/hooks'
import { ago, observed } from '../lib/format'
import { sourceState, STATE_LABEL, STATE_TONE } from '../lib/status'
import { Panel, Label, Notice } from '../components/ui'
import './pages.css'

const GROUPS = [
  ['Grid', name => name.startsWith('eia_')],
  ['Live operators', name => name.startsWith('iso_')],
  ['Nuclear', name => name.startsWith('nrc_')],
  ['News', name => name === 'feeds'],
  ['World', name => name === 'wna'],
]

function human(seconds) {
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`
  if (seconds < 2 * 86400) return `${Math.round(seconds / 3600)} hours`
  return `${Math.round(seconds / 86400)} days`
}

function SourceRow({ meta }) {
  const now = useNow()
  const state = sourceState(meta, now)
  return (
    <tr>
      <td><Label tone={STATE_TONE[state]}><span className={`dot ${state}`} />{STATE_LABEL[state]}</Label></td>
      <td>{meta.url ? <a href={meta.url} target="_blank" rel="noreferrer">{meta.label}</a> : meta.label}</td>
      <td className="muted hide-sm">{meta.cadence}</td>
      <td className="mono">{meta.observed_at ? <>{observed(meta)} <span className="subtle">· {ago(meta.observed_at, now)}</span></> : <span className="subtle">—</span>}</td>
      <td className="mono muted">{ago(meta.fetched_at, now)}</td>
      <td className={meta.error ? 'wrap' : 'wrap subtle'} style={meta.error ? { color: 'var(--warn)' } : undefined}>
        {meta.error ? `Last attempt failed: ${meta.error}` : `Expected within ${human(meta.stale_after)}`}
      </td>
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
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Sources</h1>
        <p>Status is computed in your browser from each source&apos;s newest observation.</p>
      </div>
      {failed > 0 && <Notice>{failed} of {resources.length} API requests failed on the last attempt. Rows show the last status received.</Notice>}
      <Panel title="Status" flush meta={<span>{names.length} sources</span>}>
        {!names.length ? <div className="skeleton" style={{ height: 320, margin: 12 }} /> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Status</th><th>Source</th><th className="hide-sm">Cadence</th>
                <th>Newest observation</th><th>Retrieved</th><th>Note</th>
              </tr></thead>
              <tbody>
                {GROUPS.map(([group, match]) => {
                  const rows = names.filter(match)
                  if (!rows.length) return null
                  return (
                    <Fragment key={group}>
                      <tr className="group"><td colSpan={6}>{group}</td></tr>
                      {rows.map(name => <SourceRow key={name} meta={metas[name]} />)}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="How data stays available">
        <ul className="facts">
          <li>Each source is cached and refreshed on its own schedule, so one slow source never delays another.</li>
          <li>A failed refresh keeps the last good data. The source shows as Retrying or Stale here until it recovers.</li>
          <li>When the EIA API key is rate-limited, EIA data is fetched through a keyless fallback path.</li>
          <li>Times are each source&apos;s observation time, shown in your timezone.</li>
        </ul>
      </Panel>
    </div>
  )
}
