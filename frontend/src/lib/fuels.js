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
