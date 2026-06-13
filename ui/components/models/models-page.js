import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import './model-card.js'

/* Models as a floating grid of comparable ratio cards — no drill-down.
   Pure display of /api/models. */
class ModelsPage extends LitElement {
  static properties = {
    models:   { type: Array },
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
      const res = await fetch('http://localhost:8765/api/models')
      this.models = await res.json()
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

    const models = this.models ?? []
    const used   = models.filter(m => m.total_sessions > 0)
    const unused = models.filter(m => !m.total_sessions)

    const per = (n, d) => d ? n / d : 0
    const maxes = {
      sessions:      Math.max(...used.map(m => m.total_sessions), 1),
      tools_per:     Math.max(...used.map(m => per(m.total_tool_uses, m.total_sessions)), 1),
      msgs_per:      Math.max(...used.map(m => per(m.total_messages, m.total_sessions)), 1),
      tools_per_msg: Math.max(...used.map(m => per(m.total_tool_uses, m.total_messages)), 1),
      duration:      Math.max(...used.map(m => m.avg_duration_mins || 0), 1),
    }

    return html`
      <div class="p-6 flex flex-col gap-6">

        <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))">
          ${used.map(m => html`
            <model-card .model=${m} .maxes=${maxes}></model-card>
          `)}
        </div>

        ${unused.length ? html`
          <div>
            <div class="text-xs font-semibold text-dim uppercase tracking-widest mb-2">Never used</div>
            <div class="flex gap-2 flex-wrap">
              ${unused.map(m => html`
                <span class="text-xs font-mono text-dim border border-edge rounded px-2 py-1">${m.model_id}</span>
              `)}
            </div>
          </div>
        ` : ''}

      </div>
    `
  }
}

customElements.define('models-page', ModelsPage)
