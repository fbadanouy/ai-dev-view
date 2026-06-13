const API = 'http://localhost:8765/api/tickets'

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
      const res = await fetch(API)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      this.tickets = await res.json()
    } catch (e) {
      this.error = e.message
    } finally {
      this.loading = false
      this.host.requestUpdate()
    }
  }
}
