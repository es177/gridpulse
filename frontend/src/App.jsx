import { Component, Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRoute, navigate } from './lib/router'
import { EVERY, reloadAll, useActivity, useResource, useSources } from './lib/api'
import { useNow } from './lib/hooks'
import { sourceState } from './lib/status'
import { age, zone } from './lib/format'
import { Banner, Icon } from './components/ui'
import { applyExplain, initialExplain } from './lib/explain'
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
  { path: '/live', label: 'Live', key: 'l', View: Live },
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
  const ok = states.filter(s => s === 'ok').length
  const tone = bad ? 'down' : warn ? 'stale' : 'ok'
  return (
    <a className="btn bare" href="#/sources" title={`${ok} of ${states.length} sources current${bad ? ` · ${bad} down` : ''}${warn ? ` · ${warn} stale or retrying` : ''}`}>
      <span className={`dot ${tone}`} />{ok}/{states.length}
    </a>
  )
}

function Refresh() {
  const { loading, last, failed } = useActivity()
  const now = useNow()
  return (
    <button className="btn bare" type="button" onClick={reloadAll} disabled={loading} title={failed ? `Refresh (r) · ${failed} request(s) failed, showing last data` : 'Refresh (r)'}>
      <span className={loading ? 'spin' : ''} style={{ display: 'inline-flex' }}>{Icon.sync}</span>
      <span style={{ minWidth: '3ch' }}>{last ? age(new Date(last).toISOString(), now) : '—'}</span>
      {failed > 0 && !loading && <span className="dot stale" />}
    </button>
  )
}

/** A page that throws shows one line instead of blanking the app; other pages keep working. */
class Boundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { console.error(error) }
  render() {
    if (!this.state.error) return this.props.children
    return <Banner>this page hit an error · <button className="btn bare" type="button" onClick={() => location.reload()}>reload</button></Banner>
  }
}

function Help({ onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Keyboard shortcuts" onClick={e => e.stopPropagation()}>
        <header className="tile-head"><h2 className="tile-label">Keys</h2><div className="tile-meta"><button className="btn bare" onClick={onClose}>esc</button></div></header>
        <div className="keys">
          {ROUTES.map(r => <Fragment key={r.path}><span><kbd>g</kbd> <kbd>{r.key}</kbd></span><span>{r.label}</span></Fragment>)}
          <span><kbd>e</kbd></span><span>Explain</span>
          <span><kbd>/</kbd></span><span>Search</span>
          <span><kbd>r</kbd></span><span>Refresh</span>
          <span><kbd>?</kbd></span><span>Keys</span>
        </div>
      </div>
    </div>
  )
}

function useShortcuts(setHelp, toggleExplain) {
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
      else if (e.key === 'e') toggleExplain()
      else if (e.key === '?') setHelp(h => !h)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setHelp, toggleExplain])
}

export default function App() {
  const { path } = useRoute()
  const [help, setHelp] = useState(false)
  const [explain, setExplain] = useState(initialExplain)
  useLayoutEffect(() => applyExplain(explain), [explain])
  const toggleExplain = useCallback(() => setExplain(on => !on), [])
  useShortcuts(setHelp, toggleExplain)
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
          <a className="brand" href="#/">{Icon.pulse}gridpulse</a>
          <nav className="nav" aria-label="Sections">
            {ROUTES.map(r => (
              <a key={r.path} href={`#${r.path}`} aria-current={r === route ? 'page' : undefined}>{r.label}</a>
            ))}
          </nav>
          <div className="tools">
            <Health />
            <Refresh />
            <button className="btn" type="button" aria-pressed={explain} onClick={toggleExplain} title="Plain-language notes (e)">explain</button>
            <button className="btn bare hide-sm" type="button" onClick={() => setHelp(true)} title="Keys (?)">?</button>
          </div>
        </div>
      </header>
      <main><Boundary key={route.path}><View /></Boundary></main>
      <footer>
        <a href="#/sources">EIA · NRC · CAISO · ERCOT · SPP · MISO · NYISO · ISO-NE · WNA · OWID</a>
        <a href="#/sources">method · data API →</a>
        <span>{zone()}</span>
      </footer>
      {help && <Help onClose={() => setHelp(false)} />}
    </>
  )
}
