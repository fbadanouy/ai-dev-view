import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { fmtDate } from '../../lib/format.js'
import '../ui/mini-bars.js'
import '../ui/resume-chip.js'

/*  <session-mini-row>
 *
 *  Compact one-line session row used in entity-detail lists ("Invoked in",
 *  "Recent sessions", …). Shows the title + a real per-turn activity sparkline
 *  + a copy-the-resume-command chip.
 *
 *  Props:
 *    session  Object  { session_id, title, ticket?, updated_at, provider,
 *                       spark? (JSON string or Array), count?/call_count? }
 *    badge    String  optional override for the right-side count chip
 */
class SessionMiniRow extends LitElement {
  static properties = {
    session: { type: Object },
    badge:   { type: String },
  }

  createRenderRoot() { return this }

  // Cap a sparkline at this many bars. Long sessions are max-pooled into this
  // many windows; each rendered bar is the MAX real per-turn value in its window
  // — still a literal datapoint, never an average/estimate. Spikes survive.
  static BARS = 24

  get _spark() {
    const v = this.session?.spark
    let arr = []
    try { arr = Array.isArray(v) ? v : (v ? JSON.parse(v) : []) }
    catch { return [] }
    const cap = SessionMiniRow.BARS
    if (arr.length <= cap) return arr
    const size = arr.length / cap
    return Array.from({ length: cap }, (_, i) => {
      const win = arr.slice(Math.floor(i * size), Math.floor((i + 1) * size))
      const real = win.filter(x => x != null)
      return real.length ? Math.max(...real) : null
    })
  }

  render() {
    const s = this.session
    if (!s) return html``
    const count = this.badge ?? (s.count != null ? `${s.count}x`
                  : s.call_count != null ? `${s.call_count}x` : null)
    const spark = this._spark

    return html`
      <div class="flex items-center gap-3 px-3 py-2 rounded border border-edge
                  hover:border-edge-strong text-xs">
        <div class="min-w-0 flex-1">
          <div class="text-fg truncate">${s.title || 'untitled'}</div>
          <div class="flex items-center gap-2 text-dim mt-0.5">
            ${s.ticket ? html`<span>🎫 ${s.ticket}</span>` : ''}
            ${count ? html`<span class="text-yellow-400 font-semibold">${count}</span>` : ''}
            <span>${fmtDate(s.updated_at)}</span>
          </div>
        </div>

        ${spark.length >= 2 ? html`
          <div class="w-20 flex-shrink-0" title="per-turn activity">
            <mini-bars .values=${spark} color="var(--provider-${s.provider})" .height=${22}></mini-bars>
          </div>
        ` : ''}

        <resume-chip session-id=${s.session_id} provider=${s.provider}></resume-chip>
      </div>
    `
  }
}

customElements.define('session-mini-row', SessionMiniRow)
