import { useEffect } from 'react'
import useStore from './store/useStore'
import useGridWebSocket from './hooks/useGridWebSocket'
import Dashboard from './views/Dashboard'
import Timeline from './views/Timeline'
import MapView from './views/MapView'
import GlobalCompare from './views/GlobalCompare'
import EventModal from './components/EventModal'

const VIEWS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'map', label: 'Map' },
  { id: 'global', label: 'Global' },
]

function WsIndicator() {
  const connected = useStore((s) => s.wsConnected)
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-mono">
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]' : 'bg-gray-600 animate-pulse'}`} />
      <span className={connected ? 'text-blue-400/80' : 'text-gray-500'}>{connected ? 'LIVE' : 'CONNECTING'}</span>
    </div>
  )
}

export default function App() {
  const activeView = useStore((s) => s.activeView)
  const setActiveView = useStore((s) => s.setActiveView)
  const fetchAll = useStore((s) => s.fetchAll)
  const selectedEvent = useStore((s) => s.selectedEvent)

  useGridWebSocket()

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 120000)
    return () => clearInterval(interval)
  }, [fetchAll])

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#06060c]">
      {/* Top nav */}
      <header className="flex-none h-11 bg-[#0c0c18] border-b border-[#1a1a32] flex items-center px-4 gap-6 z-50">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">G</span>
          </div>
          <span className="text-sm font-semibold tracking-wide text-gray-200">
            GRID<span className="text-blue-400">PULSE</span>
          </span>
        </div>
        <div className="w-px h-5 bg-[#1a1a32]" />
        <nav className="flex items-center gap-0.5">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => setActiveView(v.id)}
              className={`px-3 py-1.5 text-[12px] font-medium tracking-wide rounded transition-all duration-150 ${
                activeView === v.id
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent'
              }`}>{v.label.toUpperCase()}</button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <WsIndicator />
          <div className="text-[10px] font-mono text-gray-600">
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {activeView === 'dashboard' && <Dashboard />}
        {activeView === 'timeline' && <Timeline />}
        {activeView === 'map' && <MapView />}
        {activeView === 'global' && <GlobalCompare />}
      </main>

      {selectedEvent && <EventModal />}
    </div>
  )
}
