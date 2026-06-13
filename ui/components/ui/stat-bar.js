import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

class StatBar extends LitElement {
  static properties = {
    icon:      { type: String },
    label:     { type: String },
    value:     { type: Number },
    max:       { type: Number },
    color:     { type: String },
    suffix:    { type: String },
    formatter: { type: Object },  // optional (n) => string, overrides value+suffix display
  }

  createRenderRoot() { return this }

  render() {
    const pct = this.max ? Math.min(100, (this.value / this.max) * 100) : 0
    const color = this.color || '#94a3b8'

    return html`
      <div class="relative overflow-hidden rounded flex items-center justify-between gap-2 px-2 py-[3px] text-xs">
        <!-- fill bar sits behind content -->
        <div class="absolute inset-y-0 left-0 opacity-20 transition-all duration-500"
             style="width:${pct}%; background:${color}"></div>

        <div class="relative flex items-center gap-1.5 text-muted min-w-0">
          <span>${this.icon}</span>
          <span class="uppercase tracking-wide text-xs truncate">${this.label}</span>
        </div>

        <span class="relative font-semibold tabular-nums flex-shrink-0" style="color:${color}">
          ${this.value != null
            ? (this.formatter ? this.formatter(this.value) : `${this.value}${this.suffix || ''}`)
            : '—'}
        </span>
      </div>
    `
  }
}

customElements.define('stat-bar', StatBar)
