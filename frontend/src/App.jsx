import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRoute, navigate } from './lib/router'
import { EVERY, reloadAll, useActivity, useResource, useSources } from './lib/api'
import { useNow } from './lib/hooks'
import { sourceState } from './lib/status'
import { ago } from './lib/format'
import { Icon } from './components/ui'
import Overview from './views/Overview'
import Grid from './views/Grid'
import Live from './views/Live'
import Reactors from './views/Reactors'
import Feed from './views/Feed'
import Prices from './views/Prices'
import World from './views/World'
import Sources from './views/Sources'

export const ROUTES = [
  { path: '/', label: 'Overview', key: 'o', View: Overview },
  { path: '/grid', label: 'Grid', key: 'g', View: Grid },
  { path: '/live', label: 'Live ISOs', key: 'l', View: Live },
  { path: '/reactors', label: 'Reactors', key: 'r', View: Reactors },
  { path: '/feed', label: 'Feed', key: 'f', View: Feed },
  { path: '/prices', label: 'Prices', key: 'p', View: Prices },
  { path: '/world', label: 'World', key: 'w', View: World },
  { path: '/sources', label: 'Sources', key: 's', View: Sources },
]

function Health() {
  useResource('/api/status', EVERY.status)   // covers sources the current page does not load
  const sources = useSources()
  const now = useNow()
  const states = Object.values(sources).map(m => sourceState(m, now))
  if (!states.length) return null
  const bad = states.filter(s => s === 'down').length
  const warn = states.filter(s => s === 'stale' || s === 'degraded').length
  const tone = bad ? 'down' : warn ? 'stale' : 'ok'
  const text = bad || warn ? `${bad + warn} of ${states.length} sources need attention` : `${states.length} sources current`
  return (
    <a className="source" href="#/sources" title="Source status">
      <span className={`dot ${tone}`} /> <span className="hide-sm">{text}</span>
    </a>
  )
}

function Refresh() {
  const { loading, last, failed } = useActivity()
  const now = useNow()
  return (
    <button className="btn" type="button" onClick={reloadAll} disabled={loading} title="Refresh now (r)">
      <span className={loading ? 'spin' : ''} style={{ display: 'inline-flex' }}>{Icon.sync}</span>
      <span className="hide-sm">{loading ? 'Updating' : last ? `Updated ${ago(new Date(last).toISOString(), now)}` : 'Refresh'}</span>
      {failed > 0 && !loading && <span className="dot stale" title={`${failed} request(s) failed; showing last good data`} />}
    </button>
  )
}

function Help({ onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Keyboard shortcuts" onClick={e => e.stopPropagation()}>
        <header className="panel-head"><h2>Keyboard shortcuts</h2><div className="meta"><button className="btn" onClick={onClose}>Esc</button></div></header>
        <div className="keys">
          {ROUTES.map(r => <Fragment key={r.path}><span><kbd>g</kbd> <kbd>{r.key}</kbd></span><span>{r.label}</span></Fragment>)}
          <span><kbd>/</kbd></span><span>Focus search or filter</span>
          <span><kbd>r</kbd></span><span>Refresh all data</span>
          <span><kbd>?</kbd></span><span>Show this help</span>
        </div>
      </div>
    </div>
  )
}

function useShortcuts(setHelp) {
  const pending = useRef(0)
  useEffect(() => {
    const onKey = e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable
      if (e.key === 'Escape') { setHelp(false); if (typing) e.target.blur(); return }
      if (typing) return
      if (Date.now() - pending.current < 1200) {
        pending.current = 0
        const route = ROUTES.find(r => r.key === e.key)
        if (route) { e.preventDefault(); navigate(route.path) }
        return
      }
      if (e.key === 'g') pending.current = Date.now()
      else if (e.key === '/') { const el = document.querySelector('[data-search]'); if (el) { e.preventDefault(); el.focus(); el.select?.() } }
      else if (e.key === 'r') reloadAll()
      else if (e.key === '?') setHelp(h => !h)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setHelp])
}

export default function App() {
  const { path } = useRoute()
  const [help, setHelp] = useState(false)
  useShortcuts(setHelp)
  const route = ROUTES.find(r => r.path === path) || ROUTES[0]
  useEffect(() => { document.title = route.path === '/' ? 'GridPulse' : `${route.label} · GridPulse` }, [route])
  const { View } = route
  const header = useRef(null)
  useLayoutEffect(() => {
    // Sticky headings sit below the sticky app header, whose height varies with wrapping.
    const set = () => document.documentElement.style.setProperty('--header-h', `${header.current.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(header.current)
    return () => ro.disconnect()
  }, [])
  return (
    <>
      <header className="header" ref={header}>
        <div className="header-row">
          <a className="brand" href="#/">{Icon.pulse}<span>GridPulse</span></a>
          <span className="subtle hide-sm" style={{ fontSize: 12 }}>US grid and nuclear fleet, live from public sources</span>
          <div className="header-tools">
            <Health />
            <Refresh />
            <button className="btn hide-sm" type="button" onClick={() => setHelp(true)} title="Keyboard shortcuts (?)"><kbd>?</kbd></button>
          </div>
        </div>
        <nav className="nav" aria-label="Sections">
          {ROUTES.map(r => (
            <a key={r.path} href={`#${r.path}`} aria-current={r === route ? 'page' : undefined}>{r.label}</a>
          ))}
        </nav>
      </header>
      <main><View /></main>
      <footer>
        <span>Public data from EIA, NRC, US grid operators, the World Nuclear Association and publisher feeds. Times are shown in your timezone.</span>
        <a href="#/sources">Sources and status</a>
      </footer>
      {help && <Help onClose={() => setHelp(false)} />}
    </>
  )
}
