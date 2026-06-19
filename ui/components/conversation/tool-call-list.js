import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import './tool-call-row.js'

/*  <tool-call-list>
 *
 *  Renders a message's tool calls behind a single collapsible drawer so a long
 *  run (e.g. 64× exec_command in a Codex bubble) doesn't flood the prose. The
 *  drawer surfaces the count and any error total up front — errors are never
 *  hidden, only the individual rows are tucked away until expanded.
 *
 *  Short lists (< DRAWER_MIN) render inline without a drawer.
 *
 *  Props:
 *    calls          Array    ToolCall objects in stream order
 *    sessionId      String   (attribute: session-id)
 *    forceExpanded  Boolean  open the drawer (attribute: force-expanded)
 */
const DRAWER_MIN = 4

class ToolCallList extends LitElement {
  static properties = {
    calls:         { type: Array },
    sessionId:     { type: String, attribute: 'session-id' },
    forceExpanded: { type: Boolean, attribute: 'force-expanded' },
    _open:         { state: true },
  }

  createRenderRoot() { return this }

  row(tc) {
    return html`<tool-call-row .toolCall=${tc} session-id=${this.sessionId}></tool-call-row>`
  }

  rows(calls) {
    return html`<div class="flex flex-col gap-1">${calls.map(tc => this.row(tc))}</div>`
  }

  render() {
    const calls = this.calls ?? []
    if (!calls.length) return html``
    if (calls.length < DRAWER_MIN) return this.rows(calls)

    const open   = this.forceExpanded || (this._open ?? false)
    const errors = calls.filter(tc => tc.outcome === 'error').length

    return html`
      <div class="flex flex-col gap-1">
        <div class="bg-inset rounded border-l-2 ${errors ? 'border-red-500' : 'border-edge'}
                    px-2.5 py-1.5 text-xs cursor-pointer"
             @click=${() => this._open = !open}>
          <div class="flex items-center gap-2 min-w-0">
            <span class="flex-shrink-0 opacity-60">🔧</span>
            <span class="flex-1 text-dim italic">
              ${open ? 'Collapse' : 'Expand'} tool calls (${calls.length})
            </span>
            ${errors ? html`
              <span class="flex-shrink-0 text-[11px] px-1.5 rounded-full border font-semibold
                           bg-red-950 text-red-400 border-red-800">${errors} ⚠</span>` : ''}
            <span class="flex-shrink-0 text-dim text-xs">${open ? '▲' : '▼'}</span>
          </div>
        </div>
        ${open ? html`
          <div @click=${e => e.stopPropagation()}>${this.rows(calls)}</div>` : ''}
      </div>
    `
  }
}

customElements.define('tool-call-list', ToolCallList)
