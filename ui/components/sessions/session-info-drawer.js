import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { fmtTokens } from '../../lib/format.js'
import '../ui/tool-breakdown-bar.js'

/*  <session-info-drawer>
 *
 *  Collapsible horizontal drawer sitting between the session header and the
 *  conversation. Closed by default so the conversation is immediately visible.
 *
 *  Contains: tool breakdown · written files · skills · turn detail
 *
 *  Props:
 *    session       Object   full session record
 *    turns         Array    per-turn detail objects from /turn-details
 *    selectedTurn  Number   currently selected turn index (or null), driven by
 *                           the turn-activity sparkline in <session-detail>
 */

function shortPath(p) {
  const segs = p.split('/')
  return segs.length > 3 ? `…/${segs.slice(-2).join('/')}` : p
}

class SessionInfoDrawer extends LitElement {
  static properties = {
    session:      { type: Object },
    turns:        { type: Array  },
    selectedTurn: { type: Number },
    _open:        { state: true  },
  }

  createRenderRoot() { return this }

  toggle() { this._open = !this._open }

  get _hasContent() {
    const s = this.session
    return !!(
      Object.keys(s?.tool_counts ?? {}).length ||
      s?.written_files?.length ||
      s?.skills?.length ||
      this.turns?.length
    )
  }

  renderTurnDetail(t, prev) {
    if (!t) return ''

    // Codex turns: show codex-specific metrics only
    if (t.codex_output_tokens != null || t.model_id != null) {
      const fields = [
        ['Model',     t.model_id],
        ['Duration',  t.duration ? `${t.duration}s` : null],
        ['API calls', t.requests || null],
        ['End',       t.end_reason ?? null],
        ['In',        t.codex_input_tokens           != null ? fmtTokens(t.codex_input_tokens)            : null],
        ['Out',       t.codex_output_tokens           != null ? fmtTokens(t.codex_output_tokens)           : null],
        ['Cached',    t.codex_cached_input_tokens     != null ? fmtTokens(t.codex_cached_input_tokens)     : null],
        ['Reasoning', t.codex_reasoning_output_tokens  > 0   ? fmtTokens(t.codex_reasoning_output_tokens)  : null],
        ['Ctx win',   t.codex_model_context_window    != null ? `${Math.round(t.codex_model_context_window / 1000)}k` : null],
      ].filter(([, v]) => v != null)

      return html`
        <div class="mt-3 pt-3 border-t border-edge flex gap-5 flex-wrap text-sm">
          ${fields.map(([label, val]) => html`
            <div>
              <div class="text-xs text-dim mb-0.5">${label}</div>
              <div class="text-fg font-mono text-xs ${label === 'End' && val === 'turn_aborted' ? 'text-orange-400' : ''}">${val}</div>
            </div>
          `)}
        </div>
      `
    }

    // Kiro / Claude turns
    const ctxDelta = (t.context_pct - (prev?.context_pct ?? 0)).toFixed(1)

    const kiroFields = [
      ['Cycles',     t.cycles],
      ['Requests',   t.requests],
      ['Duration',   t.duration ? `${t.duration}s` : '—'],
      ['Context',    `${t.context_pct ?? 0}% (+${ctxDelta})`],
      ['End reason', t.end_reason ?? '—'],
      ['Status',     t.result_status ?? '—'],
    ].filter(([, v]) => v != null && v !== '—')

    const claudeFields = [
      ['Model',       t.model_id],
      ['In',          t.input_tokens          != null ? fmtTokens(t.input_tokens)          : null],
      ['Out',         t.output_tokens          != null ? fmtTokens(t.output_tokens)         : null],
      ['Cache read',  t.cache_read_tokens      != null ? fmtTokens(t.cache_read_tokens)     : null],
      ['Cache write', t.cache_creation_tokens  != null ? fmtTokens(t.cache_creation_tokens) : null],
    ].filter(([, v]) => v != null)

    const fields = [...kiroFields, ...claudeFields]

    return html`
      <div class="mt-3 pt-3 border-t border-edge flex gap-5 flex-wrap text-sm">
        ${fields.map(([label, val]) => html`
          <div>
            <div class="text-xs text-dim mb-0.5">${label}</div>
            <div class="text-fg font-mono text-xs">${val}</div>
          </div>
        `)}
      </div>
    `
  }

  render() {
    const s = this.session
    if (!s || !this._hasContent) return ''

    const toolEntries = Object.entries(s.tool_counts ?? {})
    const turns       = this.turns ?? []
    const t           = this.selectedTurn != null ? turns[this.selectedTurn] : null
    const prev        = t && this.selectedTurn > 0 ? turns[this.selectedTurn - 1] : null

    return html`
      <!-- Toggle bar -->
      <button
        @click=${() => this.toggle()}
        class="w-full flex items-center gap-2 py-2 px-1 text-left
               border-y border-edge hover:border-edge-strong
               transition-colors group mb-4"
      >
        <span class="text-xs text-dim uppercase tracking-widest group-hover:text-muted transition-colors">
          Session info
        </span>
        <div class="flex-1 h-px bg-surface2"></div>
        <div class="flex gap-3 text-xs text-dim group-hover:text-dim transition-colors">
          ${toolEntries.length  ? html`<span>${toolEntries.length} tools</span>` : ''}
          ${s.written_files?.length ? html`<span>${s.written_files.length} files</span>` : ''}
          ${s.skills?.length        ? html`<span>${s.skills.length} skills</span>` : ''}
          ${turns.length            ? html`<span>${turns.length} turns</span>` : ''}
        </div>
        <span class="text-dim group-hover:text-muted transition-colors text-xs">
          ${this._open ? '▲' : '▼'}
        </span>
      </button>

      <!-- Drawer body -->
      ${this._open ? html`
        <div class="mb-6 flex flex-col gap-5">

          ${toolEntries.length ? html`
            <div>
              <div class="text-xs text-dim uppercase tracking-widest mb-2">Tool breakdown</div>
              <tool-breakdown-bar .counts=${s.tool_counts}></tool-breakdown-bar>
            </div>
          ` : ''}

          ${s.written_files?.length ? html`
            <div>
              <div class="text-xs text-dim uppercase tracking-widest mb-1">Written files</div>
              ${s.written_files.map(f => html`
                <div class="flex justify-between py-1 border-b border-edge text-xs">
                  <span class="text-muted font-mono truncate" title=${f.path}>${shortPath(f.path)}</span>
                  <span class="text-dim ml-2 flex-shrink-0">${f.count}×</span>
                </div>
              `)}
            </div>
          ` : ''}

          ${s.skills?.length ? html`
            <div>
              <div class="text-xs text-dim uppercase tracking-widest mb-2">Skills</div>
              <div class="flex flex-wrap gap-1.5">
                ${s.skills.map(sk => html`
                  <span class="text-xs bg-indigo-900/50 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded">${sk}</span>
                `)}
              </div>
            </div>
          ` : ''}

          ${turns.length ? html`
            <div>
              <div class="text-xs text-dim uppercase tracking-widest mb-2">
                Turns (${turns.length})${t ? html` <span class="text-indigo-400 normal-case tracking-normal">— turn ${t.turn} selected</span>` : ''}
              </div>

              ${t
                ? this.renderTurnDetail(t, prev)
                : html`<div class="text-xs text-dim">Select a turn in the graph above to inspect it.</div>`}
            </div>
          ` : ''}

        </div>
      ` : ''}
    `
  }
}

customElements.define('session-info-drawer', SessionInfoDrawer)
