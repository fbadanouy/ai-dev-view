import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import './session-card.js'

class SessionsList extends LitElement {
  static properties = {
    sessions: { type: Array },
    loading:  { type: Boolean },
    error:    { type: String },
  }

  constructor() {
    super()
    this.sessions = []
    this.loading = true
    this.error = null
  }

  createRenderRoot() { return this }

  async connectedCallback() {
    super.connectedCallback()
    try {
      const res = await fetch('http://localhost:8765/api/sessions')
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      this.sessions = await res.json()
    } catch (e) {
      this.error = e.message
    } finally {
      this.loading = false
    }
  }

  render() {
    if (this.loading) return html`
      <div class="flex items-center gap-3 text-dim py-12">
        <sl-spinner style="font-size:1.5rem; --track-color:var(--border); --indicator-color:var(--brand)"></sl-spinner>
        <span>Loading sessions…</span>
      </div>
    `

    if (this.error) return html`
      <div class="bg-red-950 border border-rose-500 rounded-lg p-4 text-red-300 text-sm">
        Could not reach server.py — is it running on port 8765?<br>
        <span class="font-semibold">${this.error}</span>
      </div>
    `

    return html`
      <div class="text-dim text-sm mb-4">${this.sessions.length} sessions</div>
      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))">
        ${this.sessions.map(s => html`
          <session-card .session=${s}></session-card>
        `)}
      </div>
    `
  }
}

customElements.define('sessions-list', SessionsList)
