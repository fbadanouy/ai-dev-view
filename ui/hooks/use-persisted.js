/*  PersistedController — a reactive controller that mirrors one localStorage
 *  key as reactive state, the way a React useLocalStorage hook would. Reads the
 *  stored value on construction, writes (and requests a host re-render) on every
 *  assignment. Setting the value to null/undefined removes the key.
 *
 *    _lastSync = new PersistedController(this, 'lastSync', null)
 *    ...
 *    this._lastSync.value = Date.now()   // persists + re-renders
 *    render() { return html`synced ${this._lastSync.value}` }
 *
 *  Values are JSON-encoded, so anything JSON-serialisable works.
 */
export class PersistedController {
  constructor(host, key, initial = null) {
    this.host = host
    this.key = key
    this._value = read(key, initial)
    host.addController(this)
  }

  hostConnected() {}

  get value() { return this._value }

  set value(v) {
    this._value = v
    try {
      if (v == null) localStorage.removeItem(this.key)
      else localStorage.setItem(this.key, JSON.stringify(v))
    } catch { /* private mode / quota — keep the in-memory value */ }
    this.host.requestUpdate()
  }
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}
