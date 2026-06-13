import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

/*  <mini-bars>
 *
 *  Generic sparkline bars — one bar per value, heights relative to the max.
 *  Pure presenter, no axes/tooltips; null values render as gaps.
 *
 *  Optional opt-in selection: with `selectable`, bars become clickable and emit
 *  a 'bar-select' CustomEvent with {index} (toggles to null when the already-
 *  selected bar is re-clicked); the selected bar is highlighted, others dimmed.
 *
 *  Props:
 *    values      Array<Number|null>
 *    color       String        CSS color (var() welcome). Default: muted.
 *    height      Number        px height of the strip (default 36)
 *    selectable  Boolean       enable click-to-select
 *    selected    Number|null   selected index (only meaningful when selectable)
 */
class MiniBars extends LitElement {
  static properties = {
    values:     { type: Array },
    color:      { type: String },
    height:     { type: Number },
    selectable: { type: Boolean },
    selected:   { type: Number },
  }

  createRenderRoot() { return this }

  select(i) {
    const next = this.selected === i ? null : i
    this.dispatchEvent(new CustomEvent('bar-select', {
      detail: { index: next }, bubbles: true, composed: true,
    }))
  }

  render() {
    const values = this.values ?? []
    if (!values.some(v => v != null)) return html``
    const max = Math.max(...values.filter(v => v != null), 1)
    const color = this.color || 'var(--text-dim)'
    const h = this.height || 36

    // Non-selectable: simple sparkline, bars only.
    if (!this.selectable) {
      return html`
        <div class="flex items-end gap-px w-full" style="height:${h}px">
          ${values.map(v => html`
            <div class="flex-1 rounded-sm"
                 style="height:${v != null ? Math.max(6, (v / max) * 100) : 0}%; background:${color}; opacity:0.85"></div>
          `)}
        </div>
      `
    }

    // Selectable: each bar lives in a full-height column that captures the
    // hover/click, so even a tiny bar has a generous, obvious target.
    return html`
      <div class="flex items-end gap-px w-full" style="height:${h}px">
        ${values.map((v, i) => {
          const isSelected = this.selected === i
          const dimmed = this.selected != null && !isSelected
          return html`
            <div class="group flex-1 h-full flex items-end rounded-sm cursor-pointer
                        hover:bg-white/10 transition-colors"
                 @click=${() => this.select(i)}>
              <div class="w-full rounded-sm transition-[opacity,transform] origin-bottom
                          group-hover:opacity-100 group-hover:scale-y-105"
                   style="height:${v != null ? Math.max(6, (v / max) * 100) : 0}%;
                          background:${isSelected ? 'var(--chart-selected)' : color};
                          opacity:${dimmed ? 0.3 : 0.85}"></div>
            </div>
          `
        })}
      </div>
    `
  }
}

customElements.define('mini-bars', MiniBars)
