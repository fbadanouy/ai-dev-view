import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

/* Generic search input. Pure presenter: value/placeholder in,
   'search' event ({detail: {value}}) out on every keystroke. */
class SearchBar extends LitElement {
  static properties = {
    value:       { type: String },
    placeholder: { type: String },
  }

  createRenderRoot() { return this }

  emit(value) {
    this.dispatchEvent(new CustomEvent('search', {
      detail: { value }, bubbles: true, composed: true,
    }))
  }

  render() {
    return html`
      <input type="search"
             class="w-full bg-inset border border-edge rounded px-3 py-1.5 text-sm
                    text-fg placeholder-dim focus:outline-none focus:border-gold-dim"
             placeholder=${this.placeholder ?? 'Search…'}
             .value=${this.value ?? ''}
             @input=${e => this.emit(e.target.value)} />
    `
  }
}

customElements.define('search-bar', SearchBar)
