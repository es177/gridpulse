// Explain mode: one plain-language line under each tile and metric, off by default.
// Remembered per browser; everything works when storage is unavailable.
const KEY = 'gridpulse.explain'

export function initialExplain() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function applyExplain(on) {
  document.documentElement.toggleAttribute('data-explain', on)
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private browsing */ }
}
