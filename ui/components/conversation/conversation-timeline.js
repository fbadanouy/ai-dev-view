import { LitElement, html, repeat } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import './message-bubble.js'
import './tool-call-group.js'

function isToolsOnly(m) {
  return m.role === 'assistant' && !(m.text ?? '').trim() && (m.tool_use_ids?.length)
}

/* Pure presenter: messages in stream order with turn dividers. Messages with
   text render as bubbles; runs of consecutive tool-call-only assistant
   messages collapse into one tool-call-group (one cycle per message). */
function callText(tc) {
  return [tc.tool_name, tc.purpose, tc.command_preview, tc.error_msg, tc.result_preview]
    .filter(Boolean).join(' ')
}

class ConversationTimeline extends LitElement {
  static properties = {
    messages:     { type: Array },
    toolCallById: { type: Object },   // Map(tool_use_id → ToolCall)
    sessionId:    { type: String, attribute: 'session-id' },
    filter:       { type: String },   // search term: matching items only, auto-expanded
    turn:         { type: Number },   // show only this turn_number (null = all)
  }

  createRenderRoot() { return this }

  resolve(m) {
    const byId = this.toolCallById ?? new Map()
    return (m.tool_use_ids ?? []).map(id => byId.get(id)).filter(Boolean)
  }

  matches(item) {
    if (this.turn != null && item.turn !== this.turn) return false
    const q = (this.filter ?? '').trim().toLowerCase()
    if (!q) return true
    if (item.kind === 'tools') {
      return item.cycles.flat().some(tc => callText(tc).toLowerCase().includes(q))
    }
    const m = item.message
    return (m.text ?? '').toLowerCase().includes(q)
        || this.resolve(m).some(tc => callText(tc).toLowerCase().includes(q))
  }

  /* → [{turn, kind: 'message', message} | {turn, kind: 'tools', cycles}] */
  groupItems() {
    const items = []
    for (const m of this.messages ?? []) {
      const last = items[items.length - 1]
      if (isToolsOnly(m)) {
        if (last?.kind === 'tools' && last.turn === m.turn_number) {
          last.cycles.push(this.resolve(m))
        } else {
          items.push({ key: m.seq, turn: m.turn_number, kind: 'tools', cycles: [this.resolve(m)] })
        }
      } else {
        items.push({ key: m.seq, turn: m.turn_number, kind: 'message', message: m })
      }
    }
    return items
  }

  render() {
    const all      = this.groupItems()
    const items    = all.filter(item => this.matches(item))
    const filtering = !!(this.filter ?? '').trim()

    if (!all.length) return html`
      <div class="text-dim text-sm py-4">No messages recorded for this session.</div>
    `
    if (!items.length) return html`
      <div class="text-dim text-sm py-4">
        ${filtering ? html`No matches for “${this.filter}”.` : 'No messages in this turn.'}
      </div>
    `

    let lastTurn = null
    return html`
      ${filtering ? html`
        <div class="text-[11px] text-dim mb-2">${items.length} of ${all.length} matching</div>` : ''}
      <div class="flex flex-col gap-1.5">
        ${repeat(items, item => item.key, item => {
          const divider = item.turn !== lastTurn
            ? html`
              <div class="flex items-center gap-2 mt-3 first:mt-0">
                <span class="text-xs text-dim uppercase tracking-widest flex-shrink-0">turn ${item.turn}</span>
                <div class="h-px bg-surface2 flex-1"></div>
              </div>`
            : ''
          lastTurn = item.turn
          return html`
            ${divider}
            ${item.kind === 'tools'
              ? html`<tool-call-group .cycles=${item.cycles} session-id=${this.sessionId}
                                      ?force-expanded=${filtering}></tool-call-group>`
              : html`<message-bubble .message=${item.message} .toolCalls=${this.resolve(item.message)}
                                     session-id=${this.sessionId}
                                     ?force-expanded=${filtering}></message-bubble>`}
          `
        })}
      </div>
    `
  }
}

customElements.define('conversation-timeline', ConversationTimeline)
