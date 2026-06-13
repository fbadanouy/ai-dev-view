import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

/* Generic click-to-copy chip: shows monospace text, copies it on click,
   flashes a checkmark. */
class CopyChip extends LitElement {
  static properties = {
    text:    { type: String },
    _copied: { state: true },
  }

  createRenderRoot() { return this }

  async copy(e) {
    e.stopPropagation()
    await navigator.clipboard.writeText(this.text)
    this._copied = true
    setTimeout(() => this._copied = false, 1500)
  }

  render() {
    if (!this.text) return html``
    return html`
      <button class="inline-flex items-center gap-1.5 bg-inset border border-edge rounded
                     px-2 py-1 text-[11px] font-mono text-muted hover:border-gold-dim
                     hover:text-fg transition-colors max-w-full"
              title="Click to copy"
              @click=${e => this.copy(e)}>
        <span class="truncate">${this.text}</span>
        <span class="flex-shrink-0 ${this._copied ? 'text-emerald-400' : 'text-dim'}">
          ${this._copied ? '✓' : '⎘'}
        </span>
      </button>
    `
  }
}

customElements.define('copy-chip', CopyChip)
