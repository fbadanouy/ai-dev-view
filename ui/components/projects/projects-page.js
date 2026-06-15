import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { ProjectsController } from '../../hooks/use-projects.js'
import '../layout/master-detail.js'
import '../ui/stat-card.js'

const API = 'http://localhost:8765/api'

const PROVIDER_COLORS = {
  kiro:   'bg-yellow-900/40 text-yellow-400 border-yellow-700',
  claude: 'bg-purple-900/40 text-purple-300 border-purple-700',
  codex:  'bg-blue-900/40   text-blue-300   border-blue-700',
}

function providerBadge(p) {
  const cls = PROVIDER_COLORS[p] ?? 'bg-surface2 text-muted border-edge'
  return html`<span class="text-[10px] px-1.5 py-0.5 rounded border font-mono ${cls}">${p}</span>`
}

function fmtDuration(secs) {
  if (!secs) return '0m'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

class ProjectsPage extends LitElement {
  static properties = {
    selected:        { type: Object },
    detail:          { type: Object },
    _loadingDetail:  { state: true },
  }

  _projects = new ProjectsController(this)

  createRenderRoot() { return this }

  async selectProject(p) {
    this.selected = p
    this.detail   = null
    this._loadingDetail = true
    try {
      const res = await fetch(`${API}/project-detail?id=${encodeURIComponent(p.id)}`)
      this.detail = await res.json()
    } catch (e) {
      this.detail = { error: e.message }
    } finally {
      this._loadingDetail = false
    }
  }

  render() {
    const { projects, loading, error } = this._projects

    if (loading) return html`
      <div class="flex items-center gap-3 text-dim py-12 px-6">
        <sl-spinner style="font-size:1.5rem; --track-color:var(--border); --indicator-color:var(--brand)"></sl-spinner>
      </div>
    `
    if (error) return html`
      <div class="m-6 bg-red-950 border border-rose-500 rounded-lg p-4 text-red-300 text-sm">
        Could not reach server.py<br><span class="font-semibold">${error}</span>
      </div>
    `

    return html`
      <master-detail list-width="280px">

        <div slot="list" class="text-xs">
          ${projects.map(p => this._row(p))}
        </div>

        <div slot="detail" class="p-6">
          ${!this.selected ? html`
            <div class="flex items-center justify-center h-32 text-dim text-sm">
              Select a project to explore it
            </div>
          ` : this._renderDetail()}
        </div>

      </master-detail>
    `
  }

  _row(p) {
    const isSelected = this.selected?.id === p.id
    const border = isSelected
      ? 'border-l-2 border-yellow-500 bg-yellow-900/10'
      : 'border-l-2 border-transparent hover:bg-surface2'
    const providers = (p.providers ?? '').split(',').filter(Boolean)
    return html`
      <div class="flex items-center justify-between px-3 py-2 cursor-pointer transition-all duration-100 ${border}"
           @click=${() => this.selectProject(p)}>
        <div class="flex flex-col min-w-0">
          <span class="font-mono text-xs text-fg truncate">${p.name}</span>
          ${p.root_path ? html`<span class="text-[10px] text-dim font-mono truncate">${p.root_path}</span>` : ''}
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0 ml-2">
          ${providers.slice(0, 2).map(pr => html`
            <span class="w-1.5 h-1.5 rounded-full ${PROVIDER_COLORS[pr] ? `bg-current ${PROVIDER_COLORS[pr].split(' ')[1]}` : 'bg-muted'}"></span>
          `)}
          <span class="text-xs text-dim">${p.session_count}</span>
        </div>
      </div>
    `
  }

  _renderDetail() {
    const p = this.selected

    if (this._loadingDetail) return html`
      <sl-spinner style="font-size:1.2rem; --track-color:var(--border); --indicator-color:var(--brand)"></sl-spinner>
    `

    if (!this.detail || this.detail.error) return html`
      <div class="text-red-300 text-sm">${this.detail?.error ?? 'Failed to load detail'}</div>
    `

    const d = this.detail
    const providers = (p.providers ?? '').split(',').filter(Boolean)
    const hasConfig = d.skills?.length || d.agents?.length || d.mcps?.length || d.files?.length

    return html`
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center gap-3 mb-1 flex-wrap">
          <h2 class="font-mono text-lg text-yellow-400">${p.name}</h2>
          ${providers.map(pr => providerBadge(pr))}
        </div>
        ${p.root_path ? html`<div class="text-xs text-dim font-mono">${p.root_path}</div>` : ''}
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <stat-card label="Sessions"   .value=${p.session_count ?? 0}></stat-card>
        <stat-card label="Tool uses"  .value=${p.total_tool_uses ?? 0}></stat-card>
        <stat-card label="Duration"   .value=${fmtDuration(p.total_duration_secs)}></stat-card>
        <stat-card label="Active"
                   .value=${p.last_seen ? fmtDate(p.last_seen) : '—'}
                   value-cls="text-fg text-sm"></stat-card>
      </div>

      <!-- Models -->
      ${d.models?.length ? html`
        <div class="mb-6">
          <div class="text-xs font-semibold text-dim uppercase tracking-widest mb-2">Models</div>
          <div class="flex flex-wrap gap-2">
            ${d.models.map(m => html`
              <span class="font-mono text-xs px-2 py-1 rounded bg-surface2 border border-edge text-muted">
                ${m.model_id} <span class="text-dim">(${m.n})</span>
              </span>
            `)}
          </div>
        </div>
      ` : ''}

      <!-- Tickets -->
      ${d.tickets?.length ? html`
        <div class="mb-6">
          <div class="text-xs font-semibold text-dim uppercase tracking-widest mb-2">Tickets</div>
          <div class="flex flex-wrap gap-2">
            ${d.tickets.map(t => html`
              <span class="font-mono text-xs px-2 py-1 rounded bg-surface2 border border-edge text-brand">${t.ticket}</span>
            `)}
          </div>
        </div>
      ` : ''}

      <!-- AI Config -->
      ${hasConfig ? html`
        <div class="mb-8">
          <div class="text-xs font-semibold text-dim uppercase tracking-widest mb-3">Project AI config</div>

          ${d.skills?.length ? html`
            <div class="mb-4">
              <div class="text-xs text-muted mb-1">Skills</div>
              ${d.skills.map(s => html`
                <div class="flex items-center gap-2 px-3 py-1.5 rounded border border-edge mb-1 text-xs">
                  <span class="font-mono text-fg">${s.name}</span>
                  ${providerBadge(s.provider)}
                  ${s.description ? html`<span class="text-dim truncate">${s.description}</span>` : ''}
                </div>
              `)}
            </div>
          ` : ''}

          ${d.agents?.length ? html`
            <div class="mb-4">
              <div class="text-xs text-muted mb-1">Agents</div>
              ${d.agents.map(a => html`
                <div class="flex items-center gap-2 px-3 py-1.5 rounded border border-edge mb-1 text-xs">
                  <span class="font-mono text-fg">${a.name}</span>
                  ${providerBadge(a.provider)}
                  ${a.description ? html`<span class="text-dim truncate">${a.description}</span>` : ''}
                </div>
              `)}
            </div>
          ` : ''}

          ${d.mcps?.length ? html`
            <div class="mb-4">
              <div class="text-xs text-muted mb-1">MCPs</div>
              ${d.mcps.map(m => html`
                <div class="flex items-center gap-2 px-3 py-1.5 rounded border border-edge mb-1 text-xs">
                  <span class="font-mono text-fg">${m.server}</span>
                  ${providerBadge(m.provider)}
                  ${m.command ? html`<span class="text-dim font-mono truncate">${m.command}</span>` : ''}
                </div>
              `)}
            </div>
          ` : ''}

          ${d.files?.length ? html`
            <div class="mb-4">
              <div class="text-xs text-muted mb-1">Kiro files</div>
              ${d.files.map(f => html`
                <div class="flex items-center gap-2 px-3 py-1.5 rounded border border-edge mb-1 text-xs">
                  <span class="text-dim">${f.type}</span>
                  <span class="font-mono text-fg">${f.name}</span>
                </div>
              `)}
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Sessions -->
      ${d.sessions?.length ? html`
        <div>
          <div class="text-xs font-semibold text-dim uppercase tracking-widest mb-3">Sessions</div>
          <div class="flex flex-col gap-1">
            ${d.sessions.map(s => html`
              <div class="flex items-center justify-between px-3 py-2 rounded border border-edge hover:border-edge-strong text-xs">
                <span class="text-fg truncate max-w-sm">${s.title || 'untitled'}</span>
                <div class="flex items-center gap-3 flex-shrink-0 ml-3">
                  ${s.provider ? providerBadge(s.provider) : ''}
                  ${s.ticket ? html`<span class="text-dim">🎫 ${s.ticket}</span>` : ''}
                  <span class="text-dim">${fmtDate(s.updated_at)}</span>
                </div>
              </div>
            `)}
          </div>
        </div>
      ` : ''}
    `
  }
}

customElements.define('projects-page', ProjectsPage)
