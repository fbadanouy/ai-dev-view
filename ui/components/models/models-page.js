import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { FetchController } from '../../hooks/use-fetch.js'
import { asyncView } from '../../lib/async-view.js'
import './model-card.js'

/* Models as a floating grid of comparable ratio cards — no drill-down.
   Pure display of /api/models. */
class ModelsPage extends LitElement {
  _models = new FetchController(this, '/models')

  createRenderRoot() { return this }

  render() {
    const { data, loading, error } = this._models

    const models = data ?? []
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

    return asyncView({ loading, error }, () => html`
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
    `)
  }
}

customElements.define('models-page', ModelsPage)
