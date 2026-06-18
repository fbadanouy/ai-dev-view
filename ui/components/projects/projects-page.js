import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { ProjectsController } from '../../hooks/use-projects.js'
import '../layout/master-detail.js'
import '../ui/stat-card.js'
import '../sessions/session-mini-row.js'
import { CHART_COLORS } from '../ui/time-chart.js'
import '../ui/time-chart.js'
import '../ui/provider-badge.js'
import { getJson } from '../../lib/api.js'
import { provider } from '../../lib/providers.js'

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
      this.detail = await getJson(`/project-detail?id=${encodeURIComponent(p.id)}`)
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
      <master-detail list-width="17.5rem">

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
            <span class="w-1.5 h-1.5 rounded-full" style="background:${provider(pr).color}"></span>
          `)}
          <span class="text-xs text-dim">${p.session_count}</span>
        </div>
      </div>
    `
  }

  _renderActivityChart(ts) {
    if (!ts || !ts.buckets?.length) return ''
    // Stacked session bars per provider (matches the analytics hero chart) +
    // one tool-uses line. Providers with no sessions here drop out automatically.
    const bars = ['kiro', 'claude', 'codex']
      .filter(p => (ts.sessions[p] || []).some(v => v != null))
      .map(p => ({
        type: 'bar', label: p, data: ts.sessions[p], yAxisID: 'y', order: 2,
        backgroundColor: CHART_COLORS[p], borderRadius: 3, maxBarThickness: 28,
      }))
    const datasets = [
      ...bars,
      { type: 'line', label: 'tool uses', data: ts.tool_uses, yAxisID: 'y1', order: 1,
        borderColor: CHART_COLORS.line, backgroundColor: CHART_COLORS.line,
        borderWidth: 2, pointRadius: 3, tension: 0.3 },
    ]
    const options = {
      plugins: { legend: { display: true, position: 'bottom',
                           labels: { boxWidth: 10, boxHeight: 10 } } },
      scales: {
        x:  { stacked: true, grid: { display: false } },
        y:  { stacked: true, beginAtZero: true, grid: { color: CHART_COLORS.grid },
              ticks: { precision: 0 }, title: { display: true, text: 'sessions' } },
        y1: { beginAtZero: true, position: 'right', grid: { display: false },
              title: { display: true, text: 'tool uses' } },
      },
    }
    return html`
      <div class="mb-8 bg-surface border border-edge rounded-xl p-5">
        <div class="text-xs text-dim uppercase tracking-widest mb-4">
          Activity over time <span class="text-muted normal-case">· by ${ts.bucket}</span>
        </div>
        <time-chart
          .labels=${ts.buckets}
          .datasets=${datasets}
          .options=${options}
          .height=${260}
        ></time-chart>
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
          ${providers.map(pr => html`<provider-badge provider=${pr}></provider-badge>`)}
        </div>
        ${p.root_path ? html`<div class="text-xs text-dim font-mono">${p.root_path}</div>` : ''}
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-2 gap-3 mb-6">
        <stat-card label="Sessions"   .value=${p.session_count ?? 0}></stat-card>
        <stat-card label="Tool uses"  .value=${p.total_tool_uses ?? 0}></stat-card>
      </div>

      <!-- Sessions & tool uses over time -->
      ${this._renderActivityChart(d.timeseries)}

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
                  <provider-badge provider=${s.provider}></provider-badge>
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
                  <provider-badge provider=${a.provider}></provider-badge>
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
                  <provider-badge provider=${m.provider}></provider-badge>
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
            ${d.sessions.map(s => html`<session-mini-row .session=${s}></session-mini-row>`)}
          </div>
        </div>
      ` : ''}
    `
  }
}

customElements.define('projects-page', ProjectsPage)
