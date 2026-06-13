import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

/* Generic single-choice chip row. Pure presenter: options + value in,
   'choice' event ({detail: {value}}) out. Clicking the active chip clears it. */
class ChoiceChips extends LitElement {
  static properties = {
    options: { type: Array },    // ['work', 'review', ...]
    value:   { type: String },
  }

  createRenderRoot() { return this }

  pick(opt) {
    const value = this.value === opt ? null : opt
    this.dispatchEvent(new CustomEvent('choice', {
      detail: { value }, bubbles: true, composed: true,
    }))
  }

  render() {
    return html`
      <div class="flex flex-wrap gap-1.5">
        ${(this.options ?? []).map(opt => html`
          <button class="text-xs px-2 py-0.5 rounded-full border transition-colors
                         ${this.value === opt
                           ? 'bg-gold-dim/30 border-gold-dim text-yellow-200'
                           : 'bg-inset border-edge text-dim hover:text-fg'}"
                  @click=${() => this.pick(opt)}>${opt}</button>
        `)}
      </div>
    `
  }
}

customElements.define('choice-chips', ChoiceChips)
