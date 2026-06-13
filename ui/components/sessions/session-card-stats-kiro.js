import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import '../ui/stat-bar.js'
import '../ui/mini-bars.js'

/*  <session-card-stats-kiro>
 *
 *  Props:
 *    session  Object   full session record; reads messages, tool_uses,
 *             cycles, context_pct, tool_error_count, turns, model
 *             (model is null when the session ran on "auto")
 *    maxes    Object   {messages, tool_uses, cycles, tool_error_count}
 */
class SessionCardStatsKiro extends LitElement {
  static properties = {
    session: { type: Object },
    maxes:   { type: Object },
  }

  createRenderRoot() { return this }

  render() {
    const s = this.session || {}
    const m = this.maxes || {}
    return html`
      <div class="grid grid-cols-2 gap-0.5">
        <stat-bar icon="💬" label="msg" .value=${s.messages}    .max=${m.messages}  color="var(--stat-msg)"></stat-bar>
        <stat-bar icon="🔧" label="tls" .value=${s.tool_uses}   .max=${m.tool_uses} color="var(--stat-tools)"></stat-bar>
        <stat-bar icon="🧠" label="ctx" .value=${s.context_pct} .max=${100}         color="var(--stat-ctx)" suffix="%"></stat-bar>
        <stat-bar icon="🔄" label="cyc" .value=${s.cycles}      .max=${m.cycles}    color="var(--stat-cycles)"></stat-bar>
        ${s.tool_error_count ? html`
          <div class="col-span-2">
            <stat-bar icon="⚠️" label="err" .value=${s.tool_error_count} .max=${m.tool_error_count} color="var(--stat-err)"></stat-bar>
          </div>
        ` : ''}
      </div>

      ${s.turns?.length >= 6 ? html`
        <div class="mt-3 pt-3 border-t border-edge">
          <mini-bars .values=${s.turns.map(t => t.cycles)} color="var(--provider-kiro)"></mini-bars>
        </div>
      ` : ''}
    `
  }
}

customElements.define('session-card-stats-kiro', SessionCardStatsKiro)
