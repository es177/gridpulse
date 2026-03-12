import { useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import useStore from '../store/useStore'

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const US_CENTER = [39.8, -98.5]
const US_ZOOM = 4.5

function getReactorColor(pct) {
  if (pct > 90) return '#3b82f6'  // blue-500
  if (pct > 50) return '#93c5fd'  // blue-300
  if (pct > 0) return '#ef4444'   // red-500
  return '#7f1d1d'                // red-900
}

function getReactorRadius(mwt) {
  if (!mwt) return 5
  if (mwt > 3500) return 9
  if (mwt > 2500) return 7
  return 5
}

const ENTITY_ICONS = {
  enrichment: { color: '#ef4444', symbol: '⬡' },  // red
  reactor: { color: '#3b82f6', symbol: '⬢' },     // blue
  fusion: { color: '#60a5fa', symbol: '✦' },       // blue-400
  fuel_cycle: { color: '#f5f5f5', symbol: '◆' },   // white
}

function createEntityIcon(type) {
  const config = ENTITY_ICONS[type] || { color: '#9ca3af', symbol: '●' }
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 24px; height: 24px;
      background: ${config.color}20;
      border: 2px solid ${config.color};
      border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; color: ${config.color};
      box-shadow: 0 0 8px ${config.color}40;
    ">${config.symbol}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function createInvestmentIcon(amount) {
  const size = amount > 1e9 ? 28 : amount > 100e6 ? 22 : 18
  return L.divIcon({
    className: '',
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background: #3b82f615;
      border: 1.5px solid #3b82f6;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 700; color: #3b82f6;
      font-family: 'JetBrains Mono', monospace;
      box-shadow: 0 0 10px #3b82f630;
    ">$</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function formatUSD(n) {
  if (!n) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${n.toLocaleString()}`
}

function Legend() {
  return (
    <div className="absolute bottom-4 left-4 z-[1000] gp-panel p-3 text-[10px]">
      <div className="font-semibold text-gray-400 uppercase tracking-wider mb-2">Legend</div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
          <span className="text-gray-400">Reactor &gt;90%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-300 shrink-0" />
          <span className="text-gray-400">Reactor 50–90%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
          <span className="text-gray-400">Reactor &lt;50%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-900 shrink-0" />
          <span className="text-gray-400">Reactor offline</span>
        </div>
        <div className="h-px bg-[#1a1a32] my-1" />
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-red-500/30 border border-red-500 shrink-0 text-[7px] text-center leading-[10px]">⬡</span>
          <span className="text-gray-400">Enrichment facility</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-blue-500/30 border border-blue-500 shrink-0 text-[7px] text-center leading-[10px]">⬢</span>
          <span className="text-gray-400">Advanced reactor</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-blue-400/30 border border-blue-400 shrink-0 text-[7px] text-center leading-[10px]">✦</span>
          <span className="text-gray-400">Fusion</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500/30 border border-blue-500 shrink-0 text-[7px] text-center leading-[10px]">$</span>
          <span className="text-gray-400">Investment</span>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-[#1a1a32]">
        <a href="https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/ps.html" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-blue-400 transition-colors">
          SOURCE: NRC / DOE ↗
        </a>
      </div>
    </div>
  )
}

function LayerControls({ layers, onToggle }) {
  const layerDefs = [
    { id: 'reactors', label: 'Nuclear Reactors', color: 'bg-blue-500' },
    { id: 'enrichment', label: 'Advanced Nuclear', color: 'bg-red-500' },
    { id: 'investments', label: 'Investments', color: 'bg-blue-400' },
  ]

  return (
    <div className="absolute top-4 right-4 z-[1000] gp-panel p-3">
      <div className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-2">Layers</div>
      <div className="space-y-1.5">
        {layerDefs.map((layer) => (
          <label key={layer.id} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={layers[layer.id]}
              onChange={() => onToggle(layer.id)}
              className="sr-only"
            />
            <span className={`w-3.5 h-3.5 rounded border transition-all flex items-center justify-center text-[9px] ${
              layers[layer.id]
                ? 'bg-blue-600/30 border-blue-500/50 text-blue-300'
                : 'bg-transparent border-gray-600 text-transparent'
            }`}>
              ✓
            </span>
            <span className={`w-1.5 h-1.5 rounded-full ${layer.color} ${layers[layer.id] ? 'opacity-100' : 'opacity-30'}`} />
            <span className={`text-[11px] transition-colors ${layers[layer.id] ? 'text-gray-300' : 'text-gray-600'}`}>
              {layer.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

export default function MapView() {
  const reactors = useStore((s) => s.reactors)
  const enrichmentEntities = useStore((s) => s.enrichmentEntities)
  const investments = useStore((s) => s.investments)
  const mapLayers = useStore((s) => s.mapLayers)
  const toggleMapLayer = useStore((s) => s.toggleMapLayer)

  // Dedupe reactors by location (many share a site)
  const reactorSites = useMemo(() => {
    const sites = {}
    reactors.forEach((r) => {
      if (!r.lat || !r.lng) return
      const key = `${r.lat.toFixed(3)},${r.lng.toFixed(3)}`
      if (!sites[key]) {
        sites[key] = { lat: r.lat, lng: r.lng, units: [], maxMwt: 0, avgPower: 0 }
      }
      sites[key].units.push(r)
      sites[key].maxMwt = Math.max(sites[key].maxMwt, r.mwt_licensed || 0)
    })
    Object.values(sites).forEach((site) => {
      site.avgPower = site.units.reduce((s, u) => s + u.current_pct_power, 0) / site.units.length
    })
    return Object.values(sites)
  }, [reactors])

  // Entities with coords
  const enrichmentMarkers = useMemo(() =>
    enrichmentEntities.filter((e) => e.lat && e.lng),
    [enrichmentEntities]
  )

  // Investment markers (use direct coords first, fall back to enrichment entity match)
  const investmentMarkers = useMemo(() => {
    const entityCoords = {}
    enrichmentEntities.forEach((e) => {
      if (e.lat && e.lng) entityCoords[e.name.toLowerCase()] = { lat: e.lat, lng: e.lng }
    })
    return investments
      .map((inv) => {
        // Use direct coords from the investment if available
        if (inv.lat && inv.lng) return inv
        // Fall back to enrichment entity coords
        const key = inv.company?.toLowerCase() || ''
        const coords = entityCoords[key]
        if (!coords) return null
        return { ...inv, lat: coords.lat, lng: coords.lng }
      })
      .filter(Boolean)
  }, [investments, enrichmentEntities])

  return (
    <div className="h-full relative">
      <MapContainer
        center={US_CENTER}
        zoom={US_ZOOM}
        className="h-full w-full"
        zoomControl={true}
        minZoom={3}
        maxZoom={12}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution=""
        />

        {/* Reactor layer */}
        {mapLayers.reactors && reactorSites.map((site, i) => (
          <CircleMarker
            key={`r-${i}`}
            center={[site.lat, site.lng]}
            radius={getReactorRadius(site.maxMwt)}
            pathOptions={{
              fillColor: getReactorColor(site.avgPower),
              fillOpacity: 0.7,
              color: getReactorColor(site.avgPower),
              weight: 1,
              opacity: 0.3,
            }}
          >
            <Popup>
              <div className="text-[12px] min-w-[200px]">
                <div className="font-semibold text-gray-100 text-[13px] mb-2">
                  {site.units[0]?.name?.replace(/ \d+$/, '')}
                </div>
                {site.units.map((u, j) => (
                  <div key={j} className="flex items-center justify-between py-1 border-b border-white/[0.05] last:border-0">
                    <span className="text-gray-300">{u.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-gray-400 text-[11px]">{u.mwt_licensed?.toLocaleString()} MWt</span>
                      <span className={`font-mono text-[11px] font-semibold ${
                        u.current_pct_power > 90 ? 'text-blue-400' :
                        u.current_pct_power > 50 ? 'text-blue-300' :
                        u.current_pct_power > 0 ? 'text-red-400' : 'text-red-700'
                      }`}>
                        {u.current_pct_power}%
                      </span>
                    </div>
                  </div>
                ))}
                <div className="mt-2 text-[10px] text-gray-500">
                  {site.units[0]?.operator} · {site.units[0]?.state} · {site.units[0]?.reactor_type}
                </div>
                <a href="https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/ps.html" target="_blank" rel="noopener noreferrer" className="text-[9px] text-gray-600 hover:text-blue-400 mt-1 block">
                  Source: NRC Daily Report ↗
                </a>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Enrichment / advanced nuclear layer */}
        {mapLayers.enrichment && enrichmentMarkers.map((entity) => (
          <Marker
            key={`e-${entity.id}`}
            position={[entity.lat, entity.lng]}
            icon={createEntityIcon(entity.type)}
          >
            <Popup>
              <div className="text-[12px] min-w-[220px]">
                <div className="font-semibold text-gray-100 text-[13px] mb-1">{entity.name}</div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`gp-badge text-[9px] ${
                    entity.type === 'enrichment' ? 'bg-red-500/10 text-red-400' :
                    entity.type === 'fusion' ? 'bg-blue-400/10 text-blue-300' :
                    'bg-blue-500/10 text-blue-400'
                  }`}>
                    {entity.type}
                  </span>
                  <span className="gp-badge bg-white/[0.04] text-gray-400 text-[9px]">{entity.stage}</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed mb-2">{entity.description}</p>
                {entity.doe_funding_usd > 0 && (
                  <div className="text-[10px] font-mono text-blue-400">
                    DOE Funding: {formatUSD(entity.doe_funding_usd)}
                  </div>
                )}
                <div className="mt-1 flex flex-col gap-0.5">
                  {entity.website && (
                    <a href={entity.website} target="_blank" rel="noopener noreferrer" className="text-[9px] text-gray-600 hover:text-blue-400">
                      {entity.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]} ↗
                    </a>
                  )}
                  {entity.source_url && (
                    <a href={entity.source_url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-500/60 hover:text-blue-400">
                      Source ↗
                    </a>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Investment layer */}
        {mapLayers.investments && investmentMarkers.map((inv, i) => (
          <Marker
            key={`inv-${i}`}
            position={[inv.lat, inv.lng]}
            icon={createInvestmentIcon(inv.amount_usd || 0)}
          >
            <Popup>
              <div className="text-[12px] min-w-[200px]">
                <div className="font-semibold text-gray-100 text-[13px] mb-1">{inv.company}</div>
                {inv.amount_usd && (
                  <div className="font-mono text-blue-400 text-[14px] font-bold mb-1">
                    {formatUSD(inv.amount_usd)}
                  </div>
                )}
                <p className="text-[11px] text-gray-400 leading-relaxed">{inv.summary}</p>
                {inv.round_type && (
                  <div className="mt-1 text-[10px] text-gray-500 font-mono">
                    {inv.round_type.replace(/_/g, ' ')}
                  </div>
                )}
                {inv.source_url && (
                  <a href={inv.source_url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-gray-600 hover:text-blue-400 mt-1 block">
                    Source ↗
                  </a>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <LayerControls layers={mapLayers} onToggle={toggleMapLayer} />
      <Legend />

      {/* Stats overlay */}
      <div className="absolute top-4 left-4 z-[1000] gp-panel px-3 py-2">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Map Overview</div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="text-blue-400">{reactorSites.length} <span className="text-gray-600">sites</span></span>
          <span className="text-red-400">{enrichmentMarkers.length} <span className="text-gray-600">facilities</span></span>
          <span className="text-gray-400">{investmentMarkers.length} <span className="text-gray-600">investments</span></span>
        </div>
      </div>
    </div>
  )
}
