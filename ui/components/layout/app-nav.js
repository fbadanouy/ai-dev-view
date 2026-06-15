import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

// Skills / Agents / Files (Kiro) / MCPs tabs are hidden: their adapters scan only
// the home dir (~/.kiro, ~/.codex, ~/.claude), so project-level `.kiro|.codex|.claude`
// dirs, Claude plugin skills, and project-level MCP config (e.g. <repo>/.kiro/settings/
// mcp.json, <repo>/.mcp.json) are silently missed — wrong/empty for most users.
// ingest.py:219 drops any /skill-name that isn't in the home-only set; the Kiro MCP
// prefix map is likewise home-only, so project MCP tool calls aren't even tagged.
// Re-enable once provider discovery scans project subdirs + the Claude plugin cache.
// Page components stay registered in app-shell.js so this is a one-line revert.
const TABS = [
  { id: 'sessions',   label: 'Sessions' },
  { id: 'tickets',    label: 'Tickets' },
  { id: 'tool-calls', label: 'Tool Calls' },
  { id: 'models',     label: 'Models' },
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
