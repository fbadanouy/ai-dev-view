import { getJson } from '../lib/api.js'

/*  FetchController — a reactive controller that fetches one endpoint when its
 *  host connects and exposes { data, loading, error }. Removes the
 *  connectedCallback + try/catch + loading/error boilerplate from list pages:
 *
 *    _agents = new FetchController(this, '/agents')
 *    render() {
 *      const { data, loading, error } = this._agents
 *      return asyncView({ loading, error }, () => html`… use data …`)
 *    }
 *
 *  `path` may be a string or a thunk returning a string (for params).
 */
export class FetchController {
  constructor(host, path) {
    this.host = host
    this.path = path
    this.data = null
    this.loading = true
    this.error = null
    host.addController(this)
  }

  hostConnected() { this.reload() }

  async reload() {
    this.loading = true
    this.host.requestUpdate()
    try {
      this.data = await getJson(typeof this.path === 'function' ? this.path() : this.path)
      this.error = null
    } catch (e) {
      this.error = String(e)
    } finally {
      this.loading = false
      this.host.requestUpdate()
    }
  }
}
