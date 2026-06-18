import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { provider } from '../../lib/providers.js'

/*  <provider-badge provider="kiro">
 *
 *  Small provider pill using the canonical badge classes from lib/providers.js
 *  (the single source of provider styling). Unknown providers render honestly. */
class ProviderBadge extends LitElement {
  static properties = { provider: { type: String } }

  createRenderRoot() { return this }

  render() {
    const name = this.provider
    if (!name) return html``
    return html`
      <span class="text-[10px] px-1.5 py-0.5 rounded font-mono ${provider(name).badge}">${name}</span>
    `
  }
}

customElements.define('provider-badge', ProviderBadge)
