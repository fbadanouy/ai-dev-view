import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { getJson } from '../../lib/api.js'
import { asyncView } from '../../lib/async-view.js'
import '../layout/master-detail.js'
import './tool-card.js'
import '../sessions/session-mini-row.js'

class ToolCallsPage extends LitElement {
  static properties = {
    tools:        { type: Array },
    selected:     { type: Object },
    detail:       { type: Object },
    loadingTools: { type: Boolean },
    loadingDetail:{ type: Boolean },
    _error:       { state: true },
  }

  constructor() {
    super()
    this.tools = []
    this.selected = null
    this.detail = null
    this.loadingTools = true
    this.loadingDetail = false
    this._error = null
  }

  createRenderRoot() { return this }

  async connectedCallback() {
    super.connectedCallback()
    try {
      this.tools = await getJson('/tools')
    } catch (e) {
      this._error = String(e)
    } finally {
      this.loadingTools = false
    }
  }

  async selectTool(tool) {
    this.selected = tool
    this.loadingDetail = true
    this.detail = null
    this.detail = await getJson(`/tools/${encodeURIComponent(tool.tool_name)}`)
    this.loadingDetail = false
  }

  render() {
    return asyncView({ loading: this.loadingTools, error: this._error }, () => this._renderBody())
  }

  _renderBody() {
    const builtins = this.tools.filter(t => !t.mcp_server)
    const mcpGroups = this.tools.filter(t => t.mcp_server).reduce((acc, t) => {
      ;(acc[t.mcp_server] = acc[t.mcp_server] || []).push(t)
      return acc
    }, {})

    return html`
      <master-detail list-width="16.25rem">

        <div slot="list" class="text-xs">
          ${builtins.length ? html`
            <div class="px-3 py-2 text-xs font-semibold text-dim uppercase tracking-widest border-b border-edge">
              Built-in
            </div>
            ${builtins.map(t => html`
              <tool-card
                .tool=${t}
                .selected=${this.selected?.tool_name === t.tool_name}
                @click=${() => this.selectTool(t)}
              ></tool-card>`)}
          ` : ''}

          ${Object.entries(mcpGroups).map(([server, tools]) => html`
            <div class="px-3 py-2 text-xs font-semibold text-sky-700 uppercase tracking-widest border-b border-edge border-t mt-1">
              ${server}
            </div>
            ${tools.map(t => html`
              <tool-card
                .tool=${t}
                .selected=${this.selected?.tool_name === t.tool_name}
                @click=${() => this.selectTool(t)}
              ></tool-card>`)}
          `)}
        </div>

        <div slot="detail" class="p-6">
          ${!this.selected ? html`
            <div class="flex items-center justify-center h-32 text-dim text-sm">
              Select a tool to explore it
            </div>
          ` : this.loadingDetail ? html`
            <sl-spinner style="font-size:1.5rem; --track-color:var(--border); --indicator-color:var(--brand)"></sl-spinner>
          ` : this._renderDetail()}
        </div>

      </master-detail>
    `
  }


  _renderDetail() {
    const t = this.selected
    const d = this.detail

    return html`
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center gap-3 mb-1">
          <h2 class="font-mono text-lg text-sky-400">${t.tool_name}</h2>
          ${t.mcp_server ? html`
            <span class="text-xs px-2 py-0.5 rounded bg-sky-900/40 text-sky-400 border border-sky-800">${t.mcp_server}</span>
          ` : html`
            <span class="text-xs px-2 py-0.5 rounded bg-surface2 text-muted">built-in</span>
          `}
        </div>
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-4 gap-3 mb-8">
        ${this._stat('Total calls',    d.total_calls)}
        ${this._stat('Sessions used',  d.sessions_used)}
        ${this._stat('Errors',         d.errors,      'text-red-400')}
        ${this._stat('Error rate',     d.error_pct + '%', d.error_pct > 10 ? 'text-red-400' : 'text-fg')}
      </div>

      <!-- What was Claude trying to do -->
      ${d.purposes.length ? html`
        <div class="mb-8">
          <div class="text-xs font-semibold text-dim uppercase tracking-widest mb-3">What Claude used it for</div>
          <div class="flex flex-col gap-1.5">
            ${d.purposes.map(p => html`
              <div class="text-xs text-fg bg-surface2 rounded px-3 py-2 border border-edge">${p}</div>
            `)}
          </div>
        </div>
      ` : ''}

      <!-- Command previews -->
      ${d.previews.length ? html`
        <div class="mb-8">
          <div class="text-xs font-semibold text-dim uppercase tracking-widest mb-3">Command previews</div>
          <div class="flex flex-col gap-1.5">
            ${d.previews.map(p => html`
              <div class="text-xs font-mono text-muted bg-[var(--bg)] rounded px-3 py-2 border border-edge truncate">${p}</div>
            `)}
          </div>
        </div>
      ` : ''}

      <!-- Recent sessions -->
      ${d.sessions.length ? html`
        <div class="mb-8">
          <div class="text-xs font-semibold text-dim uppercase tracking-widest mb-3">Recent sessions</div>
          <div class="flex flex-col gap-1">
            ${d.sessions.map(s => html`<session-mini-row .session=${s}></session-mini-row>`)}
          </div>
        </div>
      ` : ''}
    `
  }

  _stat(label, value, cls = 'text-fg') {
    return html`
      <div class="bg-surface2 rounded-lg p-3 border border-edge">
        <div class="text-xs text-dim uppercase tracking-widest mb-1">${label}</div>
        <div class="text-lg font-semibold ${cls}">${value}</div>
      </div>
    `
  }
}

customElements.define('tool-calls-page', ToolCallsPage)
