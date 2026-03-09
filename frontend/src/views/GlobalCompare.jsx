import { useState, useMemo } from 'react'

// Data sourced from IAEA PRIS & World Nuclear Association (2024)
const COUNTRIES = [
  {
    code: 'US', name: 'United States', flag: '🇺🇸',
    unsc: true, group: 'P5',
    reactors_operating: 94, reactors_construction: 2,
    capacity_gwe: 97.0, nuclear_share_pct: 18.9,
    generation_twh: 778.2, electricity_total_twh: 4178,
    enrichment: true, reprocessing: false,
    weapons_warheads: 5044,
    policy_stance: 'Expanding',
    notes: 'Largest fleet globally. IRA tax credits. Vogtle 3&4 online. ARDP funding advanced reactors.',
    source: 'https://pris.iaea.org/pris/CountryStatistics/CountryDetails.aspx?current=US',
  },
  {
    code: 'FR', name: 'France', flag: '🇫🇷',
    unsc: true, group: 'P5',
    reactors_operating: 56, reactors_construction: 1,
    capacity_gwe: 61.4, nuclear_share_pct: 64.8,
    generation_twh: 320.4, electricity_total_twh: 494,
    enrichment: true, reprocessing: true,
    weapons_warheads: 290,
    policy_stance: 'Expanding',
    notes: 'Highest nuclear share globally. Building EPR2. Grand carénage life extension. 6 new EPR2 reactors planned.',
    source: 'https://pris.iaea.org/pris/CountryStatistics/CountryDetails.aspx?current=FR',
  },
  {
    code: 'CN', name: 'China', flag: '🇨🇳',
    unsc: true, group: 'P5',
    reactors_operating: 56, reactors_construction: 26,
    capacity_gwe: 57.5, nuclear_share_pct: 4.9,
    generation_twh: 435.8, electricity_total_twh: 8900,
    enrichment: true, reprocessing: true,
    weapons_warheads: 500,
    policy_stance: 'Rapidly expanding',
    notes: 'Most reactors under construction globally. Targets 150 GWe by 2035. Hualong One export model. HTR-PM demo operational.',
    source: 'https://pris.iaea.org/pris/CountryStatistics/CountryDetails.aspx?current=CN',
  },
  {
    code: 'RU', name: 'Russia', flag: '🇷🇺',
    unsc: true, group: 'P5',
    reactors_operating: 37, reactors_construction: 4,
    capacity_gwe: 28.6, nuclear_share_pct: 19.6,
    generation_twh: 223.4, electricity_total_twh: 1137,
    enrichment: true, reprocessing: true,
    weapons_warheads: 5580,
    policy_stance: 'Expanding',
    notes: 'Major nuclear exporter via Rosatom. VVER-1200 exports. Floating NPP operational. Fast reactor BN-800 running.',
    source: 'https://pris.iaea.org/pris/CountryStatistics/CountryDetails.aspx?current=RU',
  },
  {
    code: 'GB', name: 'United Kingdom', flag: '🇬🇧',
    unsc: true, group: 'P5',
    reactors_operating: 9, reactors_construction: 2,
    capacity_gwe: 5.9, nuclear_share_pct: 14.2,
    generation_twh: 41.6, electricity_total_twh: 293,
    enrichment: true, reprocessing: false,
    weapons_warheads: 225,
    policy_stance: 'Expanding',
    notes: 'Hinkley Point C under construction. Sizewell C approved. Great British Nuclear program for SMRs. AGR fleet retiring.',
    source: 'https://pris.iaea.org/pris/CountryStatistics/CountryDetails.aspx?current=GB',
  },
  {
    code: 'IN', name: 'India', flag: '🇮🇳',
    unsc: false, group: 'Nuclear power',
    reactors_operating: 23, reactors_construction: 7,
    capacity_gwe: 7.5, nuclear_share_pct: 3.1,
    generation_twh: 48.4, electricity_total_twh: 1624,
    enrichment: true, reprocessing: true,
    weapons_warheads: 172,
    policy_stance: 'Expanding',
    notes: 'Indigenous PHWR program. Kudankulam VVER-1000 units. Fast breeder prototype. Plans for 22 GWe by 2031.',
    source: 'https://pris.iaea.org/pris/CountryStatistics/CountryDetails.aspx?current=IN',
  },
  {
    code: 'KR', name: 'South Korea', flag: '🇰🇷',
    unsc: false, group: 'Nuclear power',
    reactors_operating: 26, reactors_construction: 3,
    capacity_gwe: 25.8, nuclear_share_pct: 31.2,
    generation_twh: 180.6, electricity_total_twh: 578,
    enrichment: false, reprocessing: false,
    weapons_warheads: 0,
    policy_stance: 'Expanding',
    notes: 'APR-1400 export success (UAE Barakah). Reversed phase-out policy. Plans for 10 new reactors by 2036.',
    source: 'https://pris.iaea.org/pris/CountryStatistics/CountryDetails.aspx?current=KR',
  },
  {
    code: 'JP', name: 'Japan', flag: '🇯🇵',
    unsc: false, group: 'Nuclear power',
    reactors_operating: 12, reactors_construction: 2,
    capacity_gwe: 10.1, nuclear_share_pct: 8.5,
    generation_twh: 69.5, electricity_total_twh: 917,
    enrichment: true, reprocessing: true,
    weapons_warheads: 0,
    policy_stance: 'Restarting',
    notes: 'Post-Fukushima restarts ongoing. 33 operable reactors, 12 restarted. New GX policy supports next-gen reactors.',
    source: 'https://pris.iaea.org/pris/CountryStatistics/CountryDetails.aspx?current=JP',
  },
  {
    code: 'CA', name: 'Canada', flag: '🇨🇦',
    unsc: false, group: 'Nuclear power',
    reactors_operating: 19, reactors_construction: 0,
    capacity_gwe: 13.6, nuclear_share_pct: 13.6,
    generation_twh: 87.1, electricity_total_twh: 640,
    enrichment: false, reprocessing: false,
    weapons_warheads: 0,
    policy_stance: 'Stable',
    notes: 'CANDU fleet in Ontario. Darlington refurbishment. First SMR site (OPG). Uranium producer.',
    source: 'https://pris.iaea.org/pris/CountryStatistics/CountryDetails.aspx?current=CA',
  },
  {
    code: 'PK', name: 'Pakistan', flag: '🇵🇰',
    unsc: false, group: 'Nuclear power',
    reactors_operating: 6, reactors_construction: 1,
    capacity_gwe: 3.5, nuclear_share_pct: 8.4,
    generation_twh: 26.4, electricity_total_twh: 151,
    enrichment: true, reprocessing: true,
    weapons_warheads: 170,
    policy_stance: 'Expanding',
    notes: 'Chinese-supplied Hualong One at Karachi. Plans for 8.9 GWe by 2030. Chashma units operational.',
    source: 'https://pris.iaea.org/pris/CountryStatistics/CountryDetails.aspx?current=PK',
  },
]

const METRICS = [
  { key: 'reactors_operating', label: 'Operating Reactors', unit: '', decimals: 0 },
  { key: 'reactors_construction', label: 'Under Construction', unit: '', decimals: 0 },
  { key: 'capacity_gwe', label: 'Capacity', unit: 'GWe', decimals: 1 },
  { key: 'nuclear_share_pct', label: 'Nuclear Share', unit: '%', decimals: 1 },
  { key: 'generation_twh', label: 'Generation', unit: 'TWh', decimals: 1 },
]

function BarSegment({ value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="h-3 bg-white/[0.03] rounded overflow-hidden">
      <div className="h-full rounded transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function CountryCard({ country, maxes, isSelected, onToggle }) {
  const stanceColors = {
    'Rapidly expanding': 'text-blue-300 bg-blue-500/10',
    'Expanding': 'text-blue-400 bg-blue-500/10',
    'Restarting': 'text-yellow-400 bg-yellow-500/10',
    'Stable': 'text-gray-400 bg-white/[0.04]',
  }

  return (
    <div
      className={`gp-panel p-4 cursor-pointer transition-all ${
        isSelected ? 'ring-1 ring-blue-500/50 bg-blue-500/[0.03]' : 'hover:bg-white/[0.02]'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{country.flag}</span>
          <div>
            <div className="font-semibold text-gray-200 text-sm">{country.name}</div>
            <div className="text-[10px] text-gray-500 font-mono">{country.group}</div>
          </div>
        </div>
        <span className={`text-[9px] px-2 py-0.5 rounded font-medium ${stanceColors[country.policy_stance] || 'text-gray-400 bg-white/[0.04]'}`}>
          {country.policy_stance.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <div className="text-[10px] text-gray-500 uppercase">Reactors</div>
          <div className="font-mono text-blue-400 text-lg font-bold">{country.reactors_operating}</div>
          {country.reactors_construction > 0 && (
            <div className="text-[10px] text-gray-500">+{country.reactors_construction} building</div>
          )}
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase">Nuc. Share</div>
          <div className="font-mono text-white text-lg font-bold">{country.nuclear_share_pct}%</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase">Capacity</div>
          <div className="font-mono text-gray-300 text-lg font-bold">{country.capacity_gwe}</div>
          <div className="text-[10px] text-gray-500">GWe</div>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        {METRICS.map((m) => (
          <div key={m.key}>
            <div className="flex items-center justify-between text-[10px] mb-0.5">
              <span className="text-gray-500">{m.label}</span>
              <span className="text-gray-400 font-mono">
                {typeof country[m.key] === 'number' ? country[m.key].toFixed(m.decimals) : country[m.key]}{m.unit && ` ${m.unit}`}
              </span>
            </div>
            <BarSegment
              value={country[m.key]}
              max={maxes[m.key]}
              color={m.key === 'nuclear_share_pct' ? '#3b82f6' : m.key === 'reactors_construction' ? '#ef4444' : '#60a5fa'}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-[9px] mb-2">
        {country.enrichment && <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded">ENRICHMENT</span>}
        {country.reprocessing && <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-300 rounded">REPROCESSING</span>}
        {country.weapons_warheads > 0 && (
          <span className="px-1.5 py-0.5 bg-white/[0.04] text-gray-400 rounded">
            {country.weapons_warheads.toLocaleString()} warheads
          </span>
        )}
      </div>

      <p className="text-[10px] text-gray-500 leading-relaxed">{country.notes}</p>

      <a
        href={country.source}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[9px] text-gray-600 hover:text-blue-400 mt-2 block"
        onClick={(e) => e.stopPropagation()}
      >
        Source: IAEA PRIS ↗
      </a>
    </div>
  )
}

function ComparisonTable({ selected }) {
  if (selected.length < 2) return null

  const rows = [
    { label: 'Operating Reactors', key: 'reactors_operating', unit: '' },
    { label: 'Under Construction', key: 'reactors_construction', unit: '' },
    { label: 'Installed Capacity', key: 'capacity_gwe', unit: 'GWe' },
    { label: 'Nuclear Share of Electricity', key: 'nuclear_share_pct', unit: '%' },
    { label: 'Annual Nuclear Generation', key: 'generation_twh', unit: 'TWh' },
    { label: 'Total Electricity Production', key: 'electricity_total_twh', unit: 'TWh' },
    { label: 'Nuclear Weapons', key: 'weapons_warheads', unit: 'warheads' },
    { label: 'Uranium Enrichment', key: 'enrichment', unit: '', bool: true },
    { label: 'Spent Fuel Reprocessing', key: 'reprocessing', unit: '', bool: true },
    { label: 'Policy Stance', key: 'policy_stance', unit: '', text: true },
  ]

  return (
    <div className="gp-panel overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[#1a1a32]">
            <th className="text-left p-3 text-gray-500 font-medium uppercase tracking-wider text-[10px]">Metric</th>
            {selected.map((c) => (
              <th key={c.code} className="text-center p-3 text-gray-300 font-medium">
                <span className="text-lg mr-1">{c.flag}</span> {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const vals = selected.map((c) => c[row.key])
            const numVals = vals.filter((v) => typeof v === 'number')
            const maxVal = numVals.length > 0 ? Math.max(...numVals) : 0

            return (
              <tr key={row.key} className="border-b border-[#1a1a32]/50 hover:bg-white/[0.01]">
                <td className="p-3 text-gray-400">{row.label}</td>
                {selected.map((c) => {
                  const val = c[row.key]
                  const isMax = typeof val === 'number' && val === maxVal && numVals.length > 1

                  return (
                    <td key={c.code} className="p-3 text-center">
                      {row.bool ? (
                        <span className={val ? 'text-blue-400' : 'text-gray-600'}>{val ? 'Yes' : 'No'}</span>
                      ) : row.text ? (
                        <span className="text-gray-300">{val}</span>
                      ) : (
                        <span className={`font-mono ${isMax ? 'text-blue-400 font-bold' : 'text-gray-300'}`}>
                          {typeof val === 'number' ? val.toLocaleString() : val}
                          {row.unit && val > 0 ? ` ${row.unit}` : ''}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function GlobalCompare() {
  const [selected, setSelected] = useState(['US', 'CN'])
  const [sortBy, setSortBy] = useState('capacity_gwe')

  const maxes = useMemo(() => {
    const result = {}
    METRICS.forEach((m) => {
      result[m.key] = Math.max(...COUNTRIES.map((c) => c[m.key]))
    })
    return result
  }, [])

  const sorted = useMemo(() => {
    return [...COUNTRIES].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0))
  }, [sortBy])

  const selectedCountries = useMemo(() =>
    COUNTRIES.filter((c) => selected.includes(c.code)),
    [selected]
  )

  function toggleCountry(code) {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  const totalGlobal = {
    reactors: COUNTRIES.reduce((s, c) => s + c.reactors_operating, 0),
    construction: COUNTRIES.reduce((s, c) => s + c.reactors_construction, 0),
    capacity: COUNTRIES.reduce((s, c) => s + c.capacity_gwe, 0),
    generation: COUNTRIES.reduce((s, c) => s + c.generation_twh, 0),
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Global Nuclear Comparison</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            UN P5 + major nuclear powers · Select countries to compare side-by-side
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-mono">
          <span className="text-blue-400">{totalGlobal.reactors} <span className="text-gray-600">reactors</span></span>
          <span className="text-red-400">+{totalGlobal.construction} <span className="text-gray-600">building</span></span>
          <span className="text-gray-400">{totalGlobal.capacity.toFixed(0)} <span className="text-gray-600">GWe</span></span>
        </div>
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-gray-500 uppercase tracking-wider">Sort by:</span>
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setSortBy(m.key)}
            className={`px-2 py-1 rounded transition-colors ${
              sortBy === m.key
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                : 'text-gray-500 hover:text-gray-300 border border-transparent'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Comparison table for selected countries */}
      {selectedCountries.length >= 2 && (
        <ComparisonTable selected={selectedCountries} />
      )}

      {selectedCountries.length < 2 && (
        <div className="gp-panel p-4 text-center text-[11px] text-gray-500">
          Select at least 2 countries below to see side-by-side comparison
        </div>
      )}

      {/* Country grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {sorted.map((country) => (
          <CountryCard
            key={country.code}
            country={country}
            maxes={maxes}
            isSelected={selected.includes(country.code)}
            onToggle={() => toggleCountry(country.code)}
          />
        ))}
      </div>

      {/* Sources footer */}
      <div className="flex items-center gap-4 text-[10px] text-gray-600 pt-2 border-t border-[#1a1a32]">
        <span className="uppercase tracking-wider">Data Sources:</span>
        <a href="https://pris.iaea.org/pris/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
          IAEA PRIS ↗
        </a>
        <a href="https://world-nuclear.org/information-library/current-and-future-generation/nuclear-power-in-the-world-today" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
          World Nuclear Association ↗
        </a>
        <a href="https://fas.org/initiative/status-world-nuclear-forces/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
          FAS Nuclear Forces ↗
        </a>
        <span className="text-gray-700">| Data as of 2024</span>
      </div>
    </div>
  )
}
