import { getJson } from '../lib/api.js'

/* Loads all tickets with their nested sessions. */
export class TicketsController {
  tickets = []
  loading = true
  error   = null

  constructor(host) {
    this.host = host
    host.addController(this)
  }

  async hostConnected() {
    try {
      this.tickets = await getJson('/tickets')
    } catch (e) {
      this.error = e.message
    } finally {
      this.loading = false
      this.host.requestUpdate()
    }
  }
}
