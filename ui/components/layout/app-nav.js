import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

// Primary tabs live on the bar; `discovery` tabs are grouped under a
// "Discovery ▾" menu (exploring what's configured/used: skills, tools, …).
const TABS = [
  { id: 'files',      label: 'Files' },
  { id: 'projects',   label: 'Projects' },
  { id: 'sessions',   label: 'Sessions' },
  { id: 'tickets',    label: 'Tickets' },
  { id: 'analytics',  label: 'Analytics' },
  { id: 'skills',     label: 'Skills',     discovery: true },
  { id: 'tool-calls', label: 'Tool Calls', discovery: true },
  { id: 'models',     label: 'Models',     discovery: true },
  { id: 'agents',     label: 'Agents',     discovery: true },
  { id: 'mcps',       label: 'MCPs',       discovery: true },
]

class AppNav extends LitElement {
  static properties = { active: { type: String } }

  createRenderRoot() { return this }

  select(id) {
    this.dispatchEvent(new CustomEvent('nav', { detail: id, bubbles: true }))
  }

  _tabCls(isActive) {
    return `px-4 py-3 text-sm font-medium transition-colors duration-150 ${
      isActive
        ? 'text-accent border-b-2 border-accent'
        : 'text-dim border-b-2 border-transparent hover:text-fg'
    }`
  }

  render() {
    const primary   = TABS.filter(t => !t.discovery)
    const discovery = TABS.filter(t => t.discovery)
    const inDiscovery = discovery.some(t => t.id === this.active)

    return html`
      <nav class="flex gap-1 px-6 border-b border-edge items-center">
        ${primary.map(t => html`
          <button class=${this._tabCls(this.active === t.id)}
                  @click=${() => this.select(t.id)}>${t.label}</button>
        `)}

        <sl-dropdown class="ml-auto" hoist>
          <button slot="trigger"
                  class="${this._tabCls(inDiscovery)} flex items-center gap-1.5">
            Discovery
            <span class="text-xs opacity-70">▾</span>
          </button>
          <sl-menu @sl-select=${e => this.select(e.detail.item.value)}>
            ${discovery.map(t => html`
              <sl-menu-item value=${t.id} ?checked=${this.active === t.id}>${t.label}</sl-menu-item>
            `)}
          </sl-menu>
        </sl-dropdown>
      </nav>
    `
  }
}

customElements.define('app-nav', AppNav)
