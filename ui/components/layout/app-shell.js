import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { postJson } from '../../lib/api.js'
import { PersistedController } from '../../hooks/use-persisted.js'
import './app-nav.js'
import '../projects/projects-page.js'
import '../sessions/sessions-page.js'
import '../tickets/tickets-page.js'
import '../skills/skills-page.js'
import '../tool-calls/tool-calls-page.js'
import '../files/files-page.js'
import '../analytics/analytics-page.js'
import '../models/models-page.js'
import '../agents/agents-page.js'
import '../mcps/mcps-page.js'

// One entry per [data-theme] block in ui/theme.css ('default' = :root).
const THEMES = ['default', 'cyber-hearth', 'dusk-protocol', 'parchment-sepia', 'nordic-daylight', 'hollywood-os', 'acid-moss', 'sakura-cli']

// sessionStorage flag marking the one reload a sync triggers, so
// auto-sync-on-open doesn't loop.
const JUST_SYNCED_KEY = 'justSynced'

function timeAgo(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 5)    return 'just now'
  if (s < 60)   return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60)   return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24)   return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

class AppShell extends LitElement {
  static properties = {
    page:    { type: String },
    _theme:  { state: true },
    _sync:   { state: true },   // null | 'busy' | 'error'
  }

  // last successful sync, epoch ms | null — persisted across reloads
  _lastSync = new PersistedController(this, 'lastSync', null)

  constructor() {
    super()
    this.page = 'sessions'
    this._theme = localStorage.getItem('theme') ?? 'default'
    this._sync = null
  }

  createRenderRoot() { return this }

  connectedCallback() {
    super.connectedCallback()
    // Re-render the relative timestamp every 30s so "Xm ago" stays current.
    this._tick = setInterval(() => this.requestUpdate(), 30_000)

    // Auto-sync on every page open / refresh — but a sync ends in a reload,
    // so skip the run that *is* that reload (flagged in sessionStorage).
    if (sessionStorage.getItem(JUST_SYNCED_KEY)) {
      sessionStorage.removeItem(JUST_SYNCED_KEY)
    } else {
      this.sync()
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    clearInterval(this._tick)
  }

  setTheme(name) {
    this._theme = name
    if (name === 'default') {
      localStorage.removeItem('theme')
      delete document.documentElement.dataset.theme
    } else {
      localStorage.setItem('theme', name)
      document.documentElement.dataset.theme = name
    }
  }

  async sync() {
    if (this._sync === 'busy') return
    this._sync = 'busy'
    try {
      const data = await postJson('/ingest')
      if (!data.success) throw new Error(data.error ?? 'ingest failed')
      this._lastSync.value = Date.now()
      sessionStorage.setItem(JUST_SYNCED_KEY, '1')   // skip auto-sync on the reload below
      location.reload()   // simplest full data refresh — every page refetches
    } catch (e) {
      console.error('sync failed:', e)
      this._sync = 'error'
      setTimeout(() => { this._sync = null }, 4000)
    }
  }

  render() {
    return html`
      <div class="min-h-screen">

        <header class="px-6 pt-6 pb-0">
          <div class="flex items-center justify-between mb-4">
            <h1 class="font-mono text-2xl text-brand tracking-tight">ai-dev-view</h1>
            <div class="flex items-center gap-4">
            ${this._lastSync.value
              ? html`<span
                  class="text-xs text-dim font-mono ${Date.now() - this._lastSync.value < 3_600_000 ? 'opacity-50' : ''}"
                  title="Last synced ${new Date(this._lastSync.value).toLocaleString()}">
                  synced ${timeAgo(this._lastSync.value)}
                </span>`
              : ''}
            <button
              @click=${() => this.sync()}
              ?disabled=${this._sync === 'busy'}
              title="Re-read provider data dirs and refresh"
              class="flex items-center gap-1.5 text-xs font-mono rounded border px-2 py-0.5
                     transition-colors
                     ${this._sync === 'error'
                       ? 'border-edge text-[var(--stat-err)]'
                       : 'border-brand-dim text-brand hover:border-brand'}
                     ${this._sync === 'busy' ? 'cursor-wait opacity-70' : 'cursor-pointer'}"
            >
              <span class="${this._sync === 'busy' ? 'animate-spin' : ''}">↻</span>
              ${this._sync === 'busy' ? 'syncing…' : this._sync === 'error' ? 'sync failed' : 'sync'}
            </button>
            <label class="flex items-center gap-1.5 text-xs text-dim font-mono">
              theme:
              <select
                .value=${this._theme}
                @change=${e => this.setTheme(e.target.value)}
                class="bg-inset border border-edge-strong text-muted rounded px-1.5 py-0.5 cursor-pointer font-mono text-xs"
              >
                ${THEMES.map(t => html`<option value=${t} ?selected=${this._theme === t}>${t}</option>`)}
              </select>
            </label>
            </div>
          </div>
          <app-nav
            .active=${this.page}
            @nav=${e => this.page = e.detail}
          ></app-nav>
        </header>

        <main>
          ${this.page === 'projects'   ? html`<projects-page></projects-page>`     : ''}
          ${this.page === 'sessions'   ? html`<sessions-page></sessions-page>`     : ''}
          ${this.page === 'tickets'    ? html`<tickets-page></tickets-page>`       : ''}
          ${this.page === 'skills'     ? html`<skills-page></skills-page>`         : ''}
          ${this.page === 'tool-calls' ? html`<tool-calls-page></tool-calls-page>` : ''}
          ${this.page === 'files'      ? html`<files-page></files-page>`           : ''}
          ${this.page === 'analytics'  ? html`<analytics-page></analytics-page>`   : ''}
          ${this.page === 'models'     ? html`<models-page></models-page>`           : ''}
          ${this.page === 'agents'     ? html`<agents-page></agents-page>`           : ''}
          ${this.page === 'mcps'       ? html`<mcps-page></mcps-page>`               : ''}
        </main>

      </div>
    `
  }
}

customElements.define('app-shell', AppShell)
