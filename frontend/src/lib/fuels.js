// Fuel categories in stacking order (bottom to top). The hued order was checked with
// a colorblind-safety validator for adjacent pairs in light and dark mode; imports
// and other are deliberately neutral. Colors live in styles.css as --fuel-*.
export const FUELS = ['nuclear', 'coal', 'hydro', 'gas', 'wind', 'solar', 'storage', 'imports', 'other']
export const FUEL_LABEL = {
  nuclear: 'Nuclear', coal: 'Coal', hydro: 'Hydro', gas: 'Natural gas', wind: 'Wind', solar: 'Solar',
  storage: 'Storage', imports: 'Net imports', other: 'Other',
}
// Source categories that fold into "other" for display.
const FOLD = { oil: 'other', geothermal: 'other', biomass: 'other' }
export const RENEWABLE = ['hydro', 'wind', 'solar']

export function displayMix(mix = {}) {
  const out = {}
  for (const [fuel, mw] of Object.entries(mix)) {
    if (typeof mw !== 'number') continue
    const key = FOLD[fuel] || fuel
    out[key] = (out[key] || 0) + mw
  }
  return out
}

export const fuelVar = fuel => `var(--fuel-${fuel})`

export function fuelColors() {
  const style = getComputedStyle(document.documentElement)
  return Object.fromEntries(FUELS.map(f => [f, style.getPropertyValue(`--fuel-${f}`).trim()]))
}

/** Share of positive output (storage charging and net exports excluded). */
export function shares(mix) {
  const m = displayMix(mix)
  const total = Object.values(m).reduce((s, v) => s + Math.max(v, 0), 0)
  if (!total) return { total: 0, share: {} }
  return { total, share: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.max(v, 0) / total * 100])) }
}
