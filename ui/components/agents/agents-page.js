import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import '../ui/stat-card.js'

/* Agents with config + usage stats. Pure display of /api/agents. */
class AgentsPage extends LitElement {
  static properties = {
    agents:   { type: Array },
    _loading: { state: true },
    _error:   { state: true },
  }

  constructor() {
    super()
    this._loading = true
  }

  createRenderRoot() { return this }

  async connectedCallback() {
    super.connectedCallback()
    try {
      const res = await fetch('http://localhost:8765/api/agents')
      this.agents = await res.json()
      this._error = null
    } catch (e) {
      this._error = String(e)
    }
    this._loading = false
  }

  render() {
    if (this._loading) return html`
      <div class="flex items-center gap-3 text-dim py-12 px-6">
        <sl-spinner style="font-size:1.5rem; --track-color:var(--border); --indicator-color:var(--brand)"></sl-spinner>
      </div>
    `
    if (this._error) return html`
      <div class="m-6 bg-red-950 border border-rose-500 rounded-lg p-4 text-red-300 text-sm">
        Could not reach server.py<br><span class="font-semibold">${this._error}</span>
      </div>
    `

    return html`
      <div class="p-6 grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(380px, 1fr))">
        ${(this.agents ?? []).map(a => html`
          <div class="border border-edge rounded-xl p-5">

            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="font-mono text-sm font-semibold text-fg">${a.name}</span>
              <span class="text-xs px-1.5 py-0.5 rounded bg-surface2 text-muted">agent</span>
              ${a.model ? html`<span class="text-xs text-dim font-mono ml-auto truncate">${a.model}</span>` : ''}
            </div>
            ${a.description ? html`<div class="text-xs text-muted mb-3">${a.description}</div>` : html`<div class="mb-3"></div>`}

            <div class="grid grid-cols-3 gap-2 mb-3">
              <stat-card label="Sessions" .value=${a.total_sessions ?? 0}></stat-card>
              <stat-card label="Avg msgs" .value=${a.avg_messages ?? '—'}></stat-card>
              <stat-card label="Tool calls" .value=${a.total_tool_uses ?? 0}></stat-card>
            </div>

            <div class="flex gap-3 text-xs text-dim flex-wrap">
              ${a.avg_context_pct > 0 ? html`<span>🧠 ${a.avg_context_pct}% avg ctx</span>` : ''}
              ${a.last_used ? html`<span class="ml-auto">${new Date(a.last_used).toLocaleDateString()}</span>` : ''}
            </div>

            ${a.tools ? html`
              <div class="mt-3 pt-3 border-t border-edge text-xs text-dim font-mono truncate" title=${a.tools}>
                tools: ${a.tools}
              </div>` : ''}

          </div>
        `)}
      </div>
    `
  }
}

customElements.define('agents-page', AgentsPage)
