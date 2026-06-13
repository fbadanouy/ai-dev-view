import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { fmtDate, timeAgo } from '../../lib/format.js'
import { provider } from '../../lib/providers.js'

/*  <session-card>
 *
 *  Props:
 *    session   Object   full session record from /api/sessions
 *    selected  Boolean
 *    maxes     Object   computed maxes across all visible sessions
 */
class SessionCard extends LitElement {
  static properties = {
    session:  { type: Object },
    selected: { type: Boolean },
    maxes:    { type: Object },
  }

  createRenderRoot() { return this }

  render() {
    const s = this.session
    const m = this.maxes || {}
    if (!s) return html``

    const state = this.selected
      ? 'border-edge bg-yellow-900/10 ring-1 ring-[var(--accent)] shadow-[0_0_15px_var(--accent-glow)]'
      : 'border-edge hover:border-edge-strong hover:bg-[var(--surface-2)]'

    return html`
      <button class="w-full text-left border rounded-xl p-5 cursor-pointer transition-all duration-150 ${state}">

        <div class="flex items-center gap-2 text-xs mb-1">
          ${s.model ? html`
            <span class="font-semibold tracking-wide flex-1 min-w-0 truncate ${provider(s.provider).text}">${s.model}</span>
          ` : html`<span class="flex-1"></span>`}
          <span class="text-dim flex-shrink-0" title="${fmtDate(s.updated)}">${timeAgo(s.updated)}</span>
        </div>

        <div class="text-fg text-xs truncate">${s.title || 'untitled'}</div>
        ${s.git_branch ? html`
          <div class="text-dim text-xs mb-2">⎇ ${s.git_branch}</div>
        ` : html`<div class="mb-3"></div>`}

        ${provider(s.provider).statsCard(s, m)}

      </button>
    `
  }
}

customElements.define('session-card', SessionCard)
