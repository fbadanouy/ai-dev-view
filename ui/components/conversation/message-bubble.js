import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { cleanClaudeText } from '../../lib/clean-claude-text.js'
import '../ui/message-text.js'
import './tool-call-list.js'

/*  <message-bubble>
 *
 *  One chat bubble. User left, assistant right.
 *  Collapses to a preview line; click to expand full text + tool calls.
 *
 *  Props:
 *    message        Object   {role, text, tool_use_ids}
 *    toolCalls      Array    resolved ToolCall objects for this message
 *    sessionId      String   (attribute: session-id)
 *    forceExpanded  Boolean  start open (e.g. search hit)
 */
class MessageBubble extends LitElement {
  static properties = {
    message:       { type: Object },
    toolCalls:     { type: Array },
    sessionId:     { type: String, attribute: 'session-id' },
    forceExpanded: { type: Boolean, attribute: 'force-expanded' },
    _expanded:     { state: true },
  }

  createRenderRoot() { return this }

  render() {
    const m = this.message
    if (!m) return html``

    const isUser    = m.role === 'user'
    const tools     = this.toolCalls ?? []
    const hasErrors = tools.some(tc => tc.outcome === 'error')
    const expanded  = this._expanded ?? this.forceExpanded

    // Determine if this message is purely harness noise (no real prose after cleaning)
    const { clean, annotations } = cleanClaudeText(m.text ?? '')
    const isSystemOnly = !clean.trim() && annotations.length > 0

    const side   = isUser ? 'mr-auto' : 'ml-auto'
    // User bubble tints with the theme accent; assistant stays neutral. Accent
    // fill via color-mix so it follows --accent across every theme (Tailwind's
    // /opacity modifier can't add alpha to a var()-based color).
    const colors = isUser
      ? 'border-accent'
      : `bg-inset ${hasErrors ? 'border-red-500' : 'border-edge-strong'}`
    const bubbleStyle = isUser ? 'background:color-mix(in srgb, var(--accent) 14%, transparent)' : ''

    // System-only messages (slash commands, task notifications, stdout) render
    // as a compact inline strip rather than a full bubble.
    if (isSystemOnly && !tools.length) {
      return html`
        <div class="mr-auto">
          <message-text .text=${m.text} preview></message-text>
        </div>
      `
    }

    return html`
      <div class="${side} w-[85%] ${colors} border-l-2 rounded px-3 py-1.5 text-sm cursor-pointer"
           style=${bubbleStyle}
           @click=${() => this._expanded = !expanded}>

        <div class="flex items-center gap-2 min-w-0">
          <span class="text-xs flex-shrink-0 opacity-40">${isUser ? '👤' : '🤖'}</span>
          <span class="flex-1 min-w-0 overflow-hidden text-fg flex items-center">
            <message-text class="min-w-0 truncate" .text=${m.text} preview></message-text>
          </span>
          ${tools.length ? html`
            <span class="flex-shrink-0 text-[11px] px-1.5 rounded-full border font-semibold
                         ${hasErrors
                           ? 'bg-red-950 text-red-400 border-red-800'
                           : 'bg-surface2 text-indigo-300 border-edge-strong'}">
              🔧 ${tools.length}${hasErrors ? ' ⚠' : ''}
            </span>` : ''}
          <span class="flex-shrink-0 text-xs text-dim">${expanded ? '▲' : '▼'}</span>
        </div>

        ${expanded ? html`
          <div class="mt-2" @click=${e => e.stopPropagation()}>
            <message-text .text=${m.text} ?markdown=${!isUser}></message-text>
            ${tools.length ? html`
              <tool-call-list class="block ${clean ? 'mt-2' : ''}" .calls=${tools}
                              session-id=${this.sessionId}
                              ?force-expanded=${this.forceExpanded}></tool-call-list>` : ''}
          </div>` : ''}
      </div>
    `
  }
}

customElements.define('message-bubble', MessageBubble)
