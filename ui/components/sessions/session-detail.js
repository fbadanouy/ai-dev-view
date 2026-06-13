import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { ConversationController } from '../../hooks/use-conversation.js'
import { provider } from '../../lib/providers.js'
import '../ui/resume-chip.js'
import '../ui/search-bar.js'
import '../ui/mini-bars.js'
import '../conversation/conversation-timeline.js'
import './session-info-drawer.js'


class SessionDetail extends LitElement {
  static properties = {
    session:         { type: Object },
    _filter:         { state: true },
    _selectedTurn:   { state: true },
  }

  _conv = new ConversationController(this)

  createRenderRoot() { return this }

  updated(changed) {
    if (changed.has('session')) {
      this._filter = ''
      this._selectedTurn = null
    }
    this._conv.load(this.session?.session_id)
  }

  render() {
    const s = this.session

    if (!s) return html`
      <div class="h-full flex items-center justify-center text-dim text-sm">
        Select a session
      </div>
    `

    const { messages, toolCallById, loading, error } = this._conv

    return html`
      <div class="p-6 overflow-y-auto h-full">

        <!-- Header -->
        <div class="mb-4">
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              ${s.provider ? html`
                <span class="text-xs font-bold tracking-widest uppercase px-2 py-1 rounded
                             ${provider(s.provider).badge}">
                  ${provider(s.provider).label}
                </span>` : ''}
              ${s.ticket     ? html`<span class="text-xs bg-surface2 text-fg px-2 py-1 rounded">🎫 ${s.ticket}</span>` : ''}
              ${s.model      ? html`<span class="text-xs bg-surface2 text-fg px-2 py-1 rounded">🤖 ${s.model}</span>`  : ''}
              ${s.agent      ? html`<span class="text-xs bg-surface2 text-fg px-2 py-1 rounded">🧩 ${s.agent}</span>`  : ''}
              ${s.git_branch ? html`<span class="text-xs bg-surface2 text-muted px-2 py-1 rounded font-mono">⎇ ${s.git_branch}</span>` : ''}
            </div>
            <resume-chip class="flex-shrink-0" session-id=${s.session_id} provider=${s.provider}></resume-chip>
          </div>
          ${s.cwd ? html`<div class="text-xs text-dim font-mono truncate">${s.cwd}</div>` : ''}
        </div>

        <!-- Collapsible info drawer -->
        <session-info-drawer
          .session=${s}
          .turns=${this._conv.turns}
          .selectedTurn=${this._selectedTurn}
        ></session-info-drawer>

        <!-- Turn activity sparkline — click a bar to filter the conversation -->
        ${(() => {
          const turns = this._conv.turns ?? []
          if (turns.length < 2) return ''
          const valueOf = s.provider === 'kiro'  ? (t => t.cycles)
                        : s.provider === 'codex' ? (t => t.codex_output_tokens)
                        :                          (t => t.output_tokens)
          const values = turns.map(valueOf)
          if (!values.some(v => v != null)) return ''
          return html`
            <div class="mb-4">
              <mini-bars
                .values=${values}
                color="var(--provider-${s.provider})"
                selectable
                .selected=${this._selectedTurn}
                @bar-select=${e => { this._selectedTurn = e.detail.index; this.requestUpdate() }}
              ></mini-bars>
              <div class="text-xs text-dim mt-1 text-center">click a bar to filter the conversation</div>
            </div>
          `
        })()}

        <!-- Conversation (always visible) -->
        ${loading ? html`
          <div class="flex items-center gap-2 text-dim text-sm py-4">
            <sl-spinner style="font-size:1rem; --track-color:var(--border); --indicator-color:var(--brand)"></sl-spinner>
            Loading conversation…
          </div>
        ` : error ? html`
          <div class="text-red-400 text-sm py-2">Could not load conversation: ${error}</div>
        ` : html`
          <div class="mb-3">
            <search-bar
              placeholder="Search messages, tool calls, results…"
              .value=${this._filter ?? ''}
              @search=${e => this._filter = e.detail.value}
            ></search-bar>
          </div>
          <conversation-timeline
            .messages=${messages}
            .toolCallById=${toolCallById}
            .filter=${this._filter}
            .turn=${this._selectedTurn != null ? this._conv.turns[this._selectedTurn]?.turn : null}
            session-id=${s.session_id}
          ></conversation-timeline>
        `}

      </div>
    `
  }
}

customElements.define('session-detail', SessionDetail)
