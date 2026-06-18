import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { FetchController } from '../../hooks/use-fetch.js'
import { asyncView } from '../../lib/async-view.js'
import { fmtDate } from '../../lib/format.js'

/* MCP servers with their tools and usage counts. Pure display of /api/mcps. */
class McpsPage extends LitElement {
  _mcps = new FetchController(this, '/mcps')

  createRenderRoot() { return this }

  render() {
    const { data, loading, error } = this._mcps
    return asyncView({ loading, error }, () => html`
      <div class="p-6 grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(380px, 1fr))">
        ${(data ?? []).map(m => html`
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
                      <span>${fmtDate(t.last_used) ?? ''}</span>
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
    `)
  }
}

customElements.define('mcps-page', McpsPage)
