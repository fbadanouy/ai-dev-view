import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import './tool-call-row.js'

/* A run of consecutive tool-call-only assistant messages, collapsed into one
   row. Expanding reveals each cycle (one per assistant message) with its calls. */
class ToolCallGroup extends LitElement {
  static properties = {
    cycles:        { type: Array },   // Array<Array<ToolCall>>
    sessionId:     { type: String, attribute: 'session-id' },
    forceExpanded: { type: Boolean, attribute: 'force-expanded' },  // start open (e.g. search hit)
    _expanded:     { state: true },
  }

  createRenderRoot() { return this }

  render() {
    const cycles = this.cycles ?? []
    const all    = cycles.flat()
    if (!all.length) return html``
    const errors = all.filter(tc => tc.outcome === 'error').length
    const expanded = this._expanded ?? this.forceExpanded

    return html`
      <div class="ml-auto w-[85%] bg-inset border-l-2 ${errors ? 'border-red-500' : 'border-edge'}
                  rounded px-3 py-1.5 text-sm cursor-pointer"
           @click=${() => this._expanded = !expanded}>

        <div class="flex items-center gap-2">
          <span class="text-xs flex-shrink-0 opacity-40">🤖</span>
          <span class="flex-1 text-dim italic text-xs">
            ${all.length} tool call${all.length > 1 ? 's' : ''}
            ${cycles.length > 1 ? ` · ${cycles.length} cycles` : ''}
          </span>
          ${errors ? html`
            <span class="flex-shrink-0 text-[11px] px-1.5 rounded-full border font-semibold bg-red-950 text-red-400 border-red-800">
              ${errors} ⚠
            </span>` : ''}
          <span class="flex-shrink-0 text-xs text-dim">${expanded ? '▲' : '▼'}</span>
        </div>

        ${expanded ? html`
          <div class="mt-2 flex flex-col gap-1" @click=${e => e.stopPropagation()}>
            ${cycles.map((calls, i) => html`
              ${cycles.length > 1 ? html`
                <div class="text-xs text-dim uppercase tracking-widest mt-1 first:mt-0">cycle ${i + 1}</div>` : ''}
              ${calls.map(tc => html`
                <tool-call-row .toolCall=${tc} session-id=${this.sessionId}></tool-call-row>`)}
            `)}
          </div>` : ''}
      </div>
    `
  }
}

customElements.define('tool-call-group', ToolCallGroup)
