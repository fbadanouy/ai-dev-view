import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

/* MCP servers with their tools and usage counts. Pure display of /api/mcps. */
class McpsPage extends LitElement {
  static properties = {
    mcps:     { type: Array },
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
      const res = await fetch('http://localhost:8765/api/mcps')
      this.mcps = await res.json()
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
        ${(this.mcps ?? []).map(m => html`
          <div class="border border-edge rounded-xl p-5">

            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="font-mono text-sm font-semibold text-fg">${m.server}</span>
              <span class="text-xs px-1.5 py-0.5 rounded bg-surface2 text-muted">mcp</span>
              ${m.command ? html`<span class="text-xs text-dim font-mono ml-auto">${m.command}</span>` : ''}
            </div>
            <div class="text-xs text-dim font-mono mb-4">prefix: ${m.tool_prefix}</div>

            ${(m.tools ?? []).length ? html`
              <div class="flex flex-col gap-1">
                ${m.tools.map(t => html`
                  <div class="flex items-center justify-between px-3 py-1.5 rounded border border-edge text-xs">
                    <span class="font-mono text-fg truncate">${t.tool_name}</span>
                    <div class="flex items-center gap-3 flex-shrink-0 ml-3 text-dim">
                      <span>${t.total_calls ?? 0} calls</span>
                      <span>${t.sessions_used ?? 0} sessions</span>
                      <span>${t.last_used ? new Date(t.last_used).toLocaleDateString() : ''}</span>
                    </div>
                  </div>
                `)}
              </div>
            ` : html`
              <div class="text-xs text-dim">No recorded tool calls.</div>
            `}

          </div>
        `)}
      </div>
    `
  }
}

customElements.define('mcps-page', McpsPage)
