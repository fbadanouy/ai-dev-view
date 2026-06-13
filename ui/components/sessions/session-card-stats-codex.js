import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import '../ui/stat-bar.js'
import '../ui/mini-bars.js'
import { fmtTokens } from '../../lib/format.js'

/*  <session-card-stats-codex>
 *
 *  Props:
 *    session  Object   full session record; reads messages, tool_uses,
 *             request_count, codex_input_tokens, codex_output_tokens,
 *             codex_cached_input_tokens, codex_reasoning_output_tokens,
 *             codex_total_tokens, model, git_branch
 *    maxes    Object   {messages, tool_uses, codex_output_tokens, ...}
 */
class SessionCardStatsCodex extends LitElement {
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
        <stat-bar icon="💬" label="msg" .value=${s.messages}           .max=${m.messages}           color="var(--stat-msg)"></stat-bar>
        <stat-bar icon="🔧" label="tls" .value=${s.tool_uses}          .max=${m.tool_uses}          color="var(--stat-tools)"></stat-bar>
        <stat-bar icon="↑"  label="in"  .value=${s.codex_input_tokens}  .max=${m.codex_input_tokens}  color="var(--stat-in)"
                  suffix="" .formatter=${fmtTokens}></stat-bar>
        <stat-bar icon="↓"  label="out" .value=${s.codex_output_tokens} .max=${m.codex_output_tokens} color="var(--provider-codex)"
                  suffix="" .formatter=${fmtTokens}></stat-bar>
        ${s.tool_error_count ? html`
          <div class="col-span-2">
            <stat-bar icon="⚠️" label="err" .value=${s.tool_error_count} .max=${m.tool_error_count} color="var(--stat-err)"></stat-bar>
          </div>
        ` : ''}
      </div>

      ${s.turns?.length >= 6 && s.turns.some(t => t.out_tokens) ? html`
        <div class="mt-3 pt-3 border-t border-edge">
          <mini-bars .values=${s.turns.map(t => t.out_tokens)} color="var(--provider-codex)"></mini-bars>
        </div>
      ` : ''}


    `
  }
}

customElements.define('session-card-stats-codex', SessionCardStatsCodex)
