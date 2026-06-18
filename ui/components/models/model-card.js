import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { fmtDate } from '../../lib/format.js'
import '../ui/stat-bar.js'

/*  <model-card>
 *
 *  Comparable at-a-glance model card — ratios over raw totals. Bars are
 *  relative to the max across all visible models (via maxes), so eyes can
 *  sweep the grid. All ratios are plain arithmetic over real API totals.
 *
 *  Props:
 *    model  Object   record from /api/models
 *    maxes  Object   {sessions, tools_per, msgs_per, tools_per_msg, duration}
 */
class ModelCard extends LitElement {
  static properties = {
    model: { type: Object },
    maxes: { type: Object },
  }

  createRenderRoot() { return this }

  render() {
    const m = this.model
    if (!m) return html``
    const mx = this.maxes || {}

    const r1 = v => Math.round(v * 10) / 10
    const toolsPer    = m.total_sessions ? r1(m.total_tool_uses / m.total_sessions) : 0
    const msgsPer     = m.total_sessions ? r1(m.total_messages  / m.total_sessions) : 0
    const toolsPerMsg = m.total_messages ? r1(m.total_tool_uses / m.total_messages) : 0
    const premium     = (m.rate_multiplier || 1) > 1.5
    const is1M        = (m.context_window_tokens || 0) >= 1_000_000

    return html`
      <div class="border border-edge rounded-xl p-5 hover:border-edge-strong transition-colors">

        <div class="flex items-center gap-2 flex-wrap mb-3">
          <span class="font-mono text-xs font-semibold text-fg truncate flex-1">${m.model_id}</span>
          ${m.rate_multiplier ? html`
            <span class="text-xs px-1.5 py-0.5 rounded border
                         ${premium ? 'text-provider-kiro border-current' : 'text-dim border-edge'}">
              ${m.rate_multiplier}×${premium ? ' premium' : ''}
            </span>` : ''}
          ${is1M ? html`
            <span class="text-xs px-1.5 py-0.5 rounded border text-[var(--stat-ctx)] border-current">1M ctx</span>` : ''}
        </div>

        <div class="flex flex-col gap-0.5">
          <stat-bar icon="◼" label="sessions" .value=${m.total_sessions} .max=${mx.sessions}      color="var(--accent)"></stat-bar>
          <stat-bar icon="🔧" label="tls/ses"  .value=${toolsPer}         .max=${mx.tools_per}     color="var(--stat-tools)"></stat-bar>
          <stat-bar icon="💬" label="msg/ses"  .value=${msgsPer}          .max=${mx.msgs_per}      color="var(--stat-msg)"></stat-bar>
          <stat-bar icon="⚙" label="tls/msg"  .value=${toolsPerMsg}      .max=${mx.tools_per_msg} color="var(--stat-req)"></stat-bar>
          ${m.avg_duration_mins ? html`
            <stat-bar icon="⏱" label="avg min" .value=${m.avg_duration_mins} .max=${mx.duration}  color="var(--stat-total)"></stat-bar>` : ''}
          ${m.avg_context_pct > 0 ? html`
            <stat-bar icon="🧠" label="avg ctx" .value=${m.avg_context_pct} .max=${100} suffix="%" color="var(--stat-ctx)"></stat-bar>` : ''}
        </div>

        ${m.last_used ? html`
          <div class="flex mt-2 text-xs text-dim">
            <span class="ml-auto">${fmtDate(m.last_used)}</span>
          </div>` : ''}

      </div>
    `
  }
}

customElements.define('model-card', ModelCard)
