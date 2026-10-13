// Derive a source's state from timestamps using the viewer's clock, so a cached
// response can never show a frozen "ok".
export function sourceState(meta, now = Date.now()) {
  if (!meta) return 'pending'
  if (!meta.has_data) return meta.error ? 'down' : 'pending'
  const stamp = meta.observed_at || meta.fetched_at
  const age = stamp ? (now - Date.parse(stamp)) / 1000 : Infinity
  if (age > meta.stale_after) return 'stale'
  if (meta.error) return 'degraded'
  return 'ok'
}

export const STATE_LABEL = { ok: 'Current', degraded: 'Retrying', stale: 'Stale', down: 'Down', pending: 'Waiting' }
export const STATE_TONE = { ok: 'ok', degraded: 'warn', stale: 'warn', down: 'bad', pending: '' }
