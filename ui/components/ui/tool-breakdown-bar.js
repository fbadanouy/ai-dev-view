import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

const COLORS = Array.from({ length: 8 }, (_, i) => `var(--palette-${i + 1})`)

class ToolBreakdownBar extends LitElement {
  static properties = {
    counts: { type: Object },
    limit:  { type: Number },
  }

  createRenderRoot() { return this }

  render() {
    const counts = this.counts || {}
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const total = entries.reduce((sum, [, v]) => sum + v, 0)
    if (!total) return html``

    return html`
      <div>
        <!-- segmented bar -->
        <div class="flex rounded overflow-hidden h-1.5 w-full mb-2">
          ${entries.map(([, count], i) => html`
            <div
              style="width:${(count / total) * 100}%; background:${COLORS[i % COLORS.length]}"
              title="${entries[i][0]}: ${count}"
            ></div>
          `)}
        </div>

        <!-- legend -->
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          ${(this.limit ? entries.slice(0, this.limit) : entries).map(([name, count], i) => html`
            <div class="flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:${COLORS[i % COLORS.length]}"></span>
              <span class="text-xs text-dim">${name}</span>
              <span class="text-xs font-semibold" style="color:${COLORS[i % COLORS.length]}">${count}</span>
            </div>
          `)}
          ${this.limit && entries.length > this.limit ? html`
            <span class="text-xs text-dim">+${entries.length - this.limit} more</span>
          ` : ''}
        </div>
      </div>
    `
  }
}

customElements.define('tool-breakdown-bar', ToolBreakdownBar)
