import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

/* Generic labeled stat tile, as used in the tool-calls detail grid. */
class StatCard extends LitElement {
  static properties = {
    label:    { type: String },
    value:    {},
    valueCls: { type: String, attribute: 'value-cls' },
  }

  createRenderRoot() { return this }

  render() {
    return html`
      <div class="bg-surface2 rounded-lg p-3 border border-edge">
        <div class="text-xs text-dim uppercase tracking-widest mb-1">${this.label}</div>
        <div class="text-lg font-semibold ${this.valueCls ?? 'text-fg'}">${this.value ?? '—'}</div>
      </div>
    `
  }
}

customElements.define('stat-card', StatCard)
