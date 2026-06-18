import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { FetchController } from '../../hooks/use-fetch.js'
import { asyncView } from '../../lib/async-view.js'
import { fmtDate } from '../../lib/format.js'
import '../ui/stat-card.js'

/* Agents with config + usage stats. Pure display of /api/agents. */
class AgentsPage extends LitElement {
  _agents = new FetchController(this, '/agents')

  createRenderRoot() { return this }

  render() {
    const { data, loading, error } = this._agents
    return asyncView({ loading, error }, () => html`
      <div class="p-6 grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(380px, 1fr))">
        ${(data ?? []).map(a => html`
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
              ${a.last_used ? html`<span class="ml-auto">${fmtDate(a.last_used)}</span>` : ''}
            </div>

            ${a.tools ? html`
              <div class="mt-3 pt-3 border-t border-edge text-xs text-dim font-mono truncate" title=${a.tools}>
                tools: ${a.tools}
              </div>` : ''}

          </div>
        `)}
      </div>
    `)
  }
}

customElements.define('agents-page', AgentsPage)
