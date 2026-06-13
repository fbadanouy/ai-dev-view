import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

const TABS = [
  { id: 'files',      label: 'Kiro' },
  { id: 'sessions',   label: 'Sessions' },
  { id: 'tickets',    label: 'Tickets' },
  { id: 'skills',     label: 'Skills' },
  { id: 'tool-calls', label: 'Tool Calls' },
  { id: 'models',     label: 'Models' },
  { id: 'agents',     label: 'Agents' },
  { id: 'mcps',       label: 'MCPs' },
  { id: 'analytics',  label: 'Analytics' },
]

class AppNav extends LitElement {
  static properties = { active: { type: String } }

  createRenderRoot() { return this }

  select(id) {
    this.dispatchEvent(new CustomEvent('nav', { detail: id, bubbles: true }))
  }

  render() {
    return html`
      <nav class="flex gap-1 px-6 border-b border-edge">
        ${TABS.map(t => {
          const isActive = this.active === t.id
          const cls = isActive
            ? 'text-accent border-b-2 border-accent'
            : 'text-dim border-b-2 border-transparent hover:text-fg'
          return html`
            <button
              class="px-4 py-3 text-sm font-medium transition-colors duration-150 ${cls}"
              @click=${() => this.select(t.id)}
            >${t.label}</button>
          `
        })}
      </nav>
    `
  }
}

customElements.define('app-nav', AppNav)
