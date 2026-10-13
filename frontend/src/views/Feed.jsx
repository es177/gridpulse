import { useEffect, useMemo, useState } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useNow, useQueryText } from '../lib/hooks'
import { useRoute, setParam } from '../lib/router'
import { fullDate, time } from '../lib/format'
import { byDay, counts, filterItems } from '../lib/derive'
import { Panel, SourceTag, Seg, Label, Empty, Notice, LoadState } from '../components/ui'

const TAGS = {
  'nrc-event': 'NRC event', scram: 'Scram', emergency: 'Emergency', 'ai-load': 'AI & large loads',
  grid: 'Grid', nuclear: 'Nuclear', storage: 'Storage', supply: 'Supply',
}
const TAG_TONE = { scram: 'bad', emergency: 'bad', 'nrc-event': 'warn' }
const PAGE = 60
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** Search box state that mirrors ?q= without fighting the user's typing. */
function DayLabel({ iso }) {
  const now = new Date(useNow())
  const d = new Date(iso)
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return weekday.format(d)
}

function Item({ item }) {
  return (
    <li>
      <a className="item-title" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
      <div className="item-meta">
        <span>{item.source}</span>
        <time dateTime={item.published} title={fullDate(item.published)} className="mono">{time(item.published)}</time>
        {(item.tags || []).map(t => <Label key={t} tone={TAG_TONE[t] || ''}>{TAGS[t] || t}</Label>)}
      </div>
      {item.summary && <div className="item-summary">{item.summary}</div>}
    </li>
  )
}

export default function Feed() {
  const res = useResource('/api/feed', EVERY.feed)
  const { params } = useRoute()
  const source = params.get('source') || ''
  const tag = params.get('tag') || ''
  const [q, setQ, dq] = useQueryText(params)
  const [limit, setLimit] = useState(PAGE)

  const items = res.data?.items
  const all = useMemo(() => items || [], [items])
  const publishers = useMemo(() => counts(all, 'source'), [all])
  const tags = useMemo(() => counts(all, 'tags').slice(0, 8), [all])
  const shown = useMemo(() => filterItems(all, { q: dq, source, tag }), [all, dq, source, tag])
  const days = useMemo(() => byDay(shown.slice(0, limit)), [shown, limit])
  useEffect(() => setLimit(PAGE), [dq, source, tag])

  const failed = res.data?.failed || []
  const clear = () => { setQ(''); setParam('source', null); setParam('tag', null) }

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Feed</h1>
        <p>{all.length} updates from {publishers.length} publishers</p>
        <span className="spacer" />
        <SourceTag meta={res.data?.sources?.feeds} name="Publishers" />
        <SourceTag meta={res.data?.sources?.nrc_events} name="NRC events" />
      </div>
      <LoadState res={res} what="the feed" />
      {failed.length > 0 && <Notice>Not refreshed this time: {failed.join(', ')}. Their earlier items are still listed.</Notice>}
      <div>
        <div className="toolbar">
          <input className="input" type="search" data-search value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search titles and summaries" aria-label="Search the feed" />
          <select className="select" value={source} onChange={e => setParam('source', e.target.value || null)} aria-label="Publisher">
            <option value="">All publishers ({all.length})</option>
            {publishers.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
          </select>
          {tags.length > 0 && (
            <Seg label="Topic" value={tag} onChange={t => setParam('tag', t || null)}
              options={[['', 'All'], ...tags.map(([t, n]) => [t, `${TAGS[t] || t} ${n}`])]} />
          )}
          {res.data && <span className="muted" style={{ fontSize: 12 }}>{shown.length} shown</span>}
        </div>
        <Panel title="Updates" flush meta={<span>Newest first · times in your timezone</span>}>
          {!res.data ? <div className="skeleton" style={{ height: 360, margin: 12 }} />
            : !shown.length ? <Empty>No updates match these filters. <button className="btn" type="button" onClick={clear}>Clear filters</button></Empty>
              : days.map(group => (
                <section key={group.key}>
                  <div className="day-head"><DayLabel iso={group.date} /></div>
                  <ul className="list">{group.items.map(i => <Item key={i.id} item={i} />)}</ul>
                </section>
              ))}
          {shown.length > limit && (
            <div className="panel-foot" style={{ textAlign: 'center' }}>
              <button className="btn" type="button" onClick={() => setLimit(l => l + PAGE)}>Show more ({shown.length - limit} remaining)</button>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
