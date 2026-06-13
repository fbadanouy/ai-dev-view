import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

class ToolCard extends LitElement {
  static properties = {
    tool:     { type: Object },
    selected: { type: Boolean },
  }

  createRenderRoot() { return this }

  render() {
    const t = this.tool
    if (!t) return html``

    const border = this.selected
      ? 'border-l-2 border-yellow-500 bg-yellow-900/10'
      : 'border-l-2 border-transparent hover:bg-surface2'

    const errCls = t.error_pct > 20
      ? 'text-red-400'
      : t.error_pct > 5
        ? 'text-orange-400'
        : 'text-dim'

    return html`
      <div class="flex items-center justify-between px-3 py-2 cursor-pointer transition-all duration-100 ${border}">
        <span class="font-mono text-xs text-fg truncate">${t.tool_name}</span>
        <div class="flex items-center gap-2 flex-shrink-0 ml-2 text-xs">
          <span class="text-dim">${t.total_calls}</span>
          ${t.error_pct > 0 ? html`<span class="${errCls}">${t.error_pct}%</span>` : ''}
        </div>
      </div>
    `
  }
}

customElements.define('tool-card', ToolCard)
