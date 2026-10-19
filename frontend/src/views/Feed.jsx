import { useEffect, useMemo, useState } from 'react'
import { useResource, EVERY } from '../lib/api'
import { useNow, useQueryText } from '../lib/hooks'
import { useRoute, setParam } from '../lib/router'
import { fullDate, time } from '../lib/format'
import { byDay, counts, filterItems } from '../lib/derive'
import { Board, Tile, SourceTag, Seg, Tag, Empty, Skeleton, Banner, LoadState } from '../components/ui'

const TAGS = {
  'nrc-event': 'NRC event', scram: 'Scram', emergency: 'Emergency', 'ai-load': 'Large loads',
  grid: 'Grid', nuclear: 'Nuclear', storage: 'Storage', supply: 'Supply',
}
const TAG_TONE = { scram: 'bad', emergency: 'bad', 'nrc-event': 'warn' }
const PAGE = 60
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

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
      <a className="title" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
      <div className="meta">
        <time dateTime={item.published} title={fullDate(item.published)}>{time(item.published)}</time>
        <span>{item.source}</span>
        {(item.tags || []).map(t => <Tag key={t} tone={TAG_TONE[t] || ''}>{TAGS[t] || t}</Tag>)}
      </div>
      {item.summary && <div className="summary">{item.summary}</div>}
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
    <>
      <LoadState res={res} what="feed" />
      {failed.length > 0 && <Banner>not refreshed: {failed.join(', ')} · earlier items kept</Banner>}
      <div className="bar">
        <input className="input" type="search" data-search value={q} onChange={e => setQ(e.target.value)}
          placeholder="search" aria-label="Search the feed" />
        <select className="select" value={source} onChange={e => setParam('source', e.target.value || null)} aria-label="Publisher">
          <option value="">all publishers · {all.length}</option>
          {publishers.map(([name, n]) => <option key={name} value={name}>{name} · {n}</option>)}
        </select>
        {tags.length > 0 && (
          <Seg label="Topic" value={tag} onChange={t => setParam('tag', t || null)}
            options={[['', 'all'], ...tags.map(([t, n]) => [t, (TAGS[t] || t).toLowerCase(), n])]} />
        )}
        {res.data && <span className="count">{shown.length}/{all.length}</span>}
      </div>
      <Board>
        <Tile flush label="Updates" hint="News and regulator notices, newest first. NRC event reports are formal notices of plant events; most are minor."
          meta={<><SourceTag meta={res.data?.sources?.feeds} name="feeds" /><SourceTag meta={res.data?.sources?.nrc_events} name="NRC events" /></>}>
          {!res.data ? <Skeleton height={360} />
            : !shown.length ? <Empty>no match · <button className="btn bare" type="button" onClick={clear}>clear</button></Empty>
              : days.map(group => (
                <section key={group.key}>
                  <div className="day"><DayLabel iso={group.date} /></div>
                  <ul className="rows news">{group.items.map(i => <Item key={i.id} item={i} />)}</ul>
                </section>
              ))}
          {shown.length > limit && (
            <div style={{ padding: 8, borderTop: '1px solid var(--line)', textAlign: 'center' }}>
              <button className="btn" type="button" onClick={() => setLimit(l => l + PAGE)}>more · {shown.length - limit}</button>
            </div>
          )}
        </Tile>
      </Board>
    </>
  )
}
