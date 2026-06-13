import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { fetchFullToolResult } from '../../hooks/use-conversation.js'
import { fmtBytes } from '../../lib/format.js'

const OUTCOME = {
  success:  { border: 'border-emerald-500', text: 'text-emerald-400' },
  error:    { border: 'border-red-500',     text: 'text-red-400' },
  rejected: { border: 'border-orange-500',  text: 'text-orange-400' },
  unknown:  { border: 'border-edge-strong',   text: 'text-dim' },
}

/* Render a full result payload: list of {kind: 'text'|'json', data}. */
function fullResultText(result) {
  if (!Array.isArray(result)) return JSON.stringify(result, null, 2)
  return result.map(item =>
    item.kind === 'text' ? String(item.data) : JSON.stringify(item.data, null, 2)
  ).join('\n')
}

class ToolCallRow extends LitElement {
  static properties = {
    toolCall:     { type: Object },
    sessionId:    { type: String, attribute: 'session-id' },
    _expanded:    { state: true },
    _full:        { state: true },
    _loadingFull: { state: true },
  }

  createRenderRoot() { return this }

  async loadFull(e) {
    e.stopPropagation()
    this._loadingFull = true
    try {
      this._full = await fetchFullToolResult(this.sessionId, this.toolCall.tool_use_id)
    } catch {
      this._full = { error: 'could not load full result' }
    } finally {
      this._loadingFull = false
    }
  }

  render() {
    const tc = this.toolCall
    if (!tc) return html``
    const oc = OUTCOME[tc.outcome] ?? OUTCOME.unknown
    const expandable = !!(tc.result_preview || tc.error_msg || tc.result_meta)

    return html`
      <div class="bg-inset rounded border-l-2 ${oc.border} px-2.5 py-1.5 text-xs
                  ${expandable ? 'cursor-pointer' : ''}"
           @click=${() => { if (expandable) this._expanded = !this._expanded }}>

        <div class="flex items-center gap-2 min-w-0">
          <span class="font-medium text-fg flex-shrink-0">${tc.tool_name}</span>
          ${tc.mcp_server ? html`
            <span class="text-xs bg-violet-900/50 text-violet-300 px-1.5 rounded flex-shrink-0">${tc.mcp_server}</span>` : ''}
          <span class="flex-1 truncate text-dim font-mono text-[11px]">
            ${tc.purpose ?? tc.command_preview ?? ''}
          </span>
          <span class="${oc.text} text-xs flex-shrink-0">${tc.outcome}</span>
          ${expandable ? html`<span class="text-dim text-xs flex-shrink-0">${this._expanded ? '▲' : '▼'}</span>` : ''}
        </div>

        ${this._expanded ? html`
          <div class="mt-2 flex flex-col gap-1.5" @click=${e => e.stopPropagation()}>
            ${tc.command_preview ? html`
              <div class="text-muted font-mono text-[11px] whitespace-pre-wrap break-words">$ ${tc.command_preview}</div>` : ''}
            ${tc.result_meta ? html`
              <div class="flex flex-wrap gap-1">
                ${Object.entries(tc.result_meta).map(([k, v]) => html`
                  <span class="text-xs bg-surface2 text-muted px-1.5 py-0.5 rounded">${k}: ${v}</span>`)}
              </div>` : ''}
            ${tc.error_msg ? html`
              <div class="text-red-400 font-mono text-[11px] whitespace-pre-wrap break-words">${tc.error_msg}</div>` : ''}
            ${tc.result_preview ? html`
              <pre class="bg-black/50 rounded p-2 text-[11px] text-muted overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto">${
                this._full ? fullResultText(this._full.result ?? this._full) : tc.result_preview
              }</pre>` : ''}
            ${tc.result_truncated && !this._full ? html`
              <button class="self-start text-[11px] text-gold hover:underline"
                      ?disabled=${this._loadingFull}
                      @click=${e => this.loadFull(e)}>
                ${this._loadingFull ? 'loading…' : `show full result (${fmtBytes(tc.result_bytes)})`}
              </button>` : ''}
          </div>` : ''}
      </div>
    `
  }
}

customElements.define('tool-call-row', ToolCallRow)
