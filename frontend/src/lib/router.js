// Hash routing: #/reactors?q=vogtle. Shareable, back-button friendly, no server config.
import { useSyncExternalStore } from 'react'

const subscribe = fn => { window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn) }
const snapshot = () => window.location.hash

export function parse(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  return { path: path || '/', params: new URLSearchParams(query) }
}

export function useRoute() {
  return parse(useSyncExternalStore(subscribe, snapshot))
}

export function navigate(path) {
  if (window.location.hash !== `#${path}`) window.location.hash = path
}

/** Update one query parameter without adding a history entry. */
export function setParam(key, value) {
  const { path, params } = parse(window.location.hash)
  if (value === null || value === undefined || value === '') params.delete(key)
  else params.set(key, value)
  const query = params.toString()
  window.history.replaceState(null, '', `#${path}${query ? `?${query}` : ''}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
