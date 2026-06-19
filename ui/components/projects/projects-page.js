import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { ProjectsController } from '../../hooks/use-projects.js'
import { SessionsController } from '../../hooks/use-sessions.js'
import { SelectionController } from '../../hooks/use-selection.js'
import { getJson } from '../../lib/api.js'
import { provider } from '../../lib/providers.js'
import '../layout/master-detail.js'
import '../ui/search-bar.js'
import '../sessions/session-card.js'
import '../sessions/session-detail.js'

/* Projects → sessions in that project → full session detail.
   Mirrors the Tickets page exactly: the detail pane is itself a master-detail,
   reusing session-card and session-detail as the sessions page does. The
   project's session ids come from /project-detail; the full session objects
   (which the cards/detail render) come from SessionsController. */
class ProjectsPage extends LitElement {
  static properties = {
    selected:        { type: Object },   // selected project
    detail:          { type: Object },    // /project-detail payload (session ids etc.)
    _loadingDetail:  { state: true },
    _query:          { state: true },
    _pinned:         { state: true },     // Set of pinned project ids (localStorage-backed)
  }

  _projects = new ProjectsController(this)
  _sessions = new SessionsController(this)
  _sel        = new SelectionController(this, 'sel.projects', p => p.id, { scrollSelector: '[data-sel-project]' })
  _selSession = new SelectionController(this, 'sel.projects.session', s => s.session_id, { scrollSelector: '[data-sel-session]' })

  constructor() {
    super()
    // User preference only — no DB, mirrors how app-shell persists the theme.
    this._pinned = new Set(JSON.parse(localStorage.getItem('pinnedProjects') || '[]'))
  }

  createRenderRoot() { return this }

  // Once projects load, replay the remembered selection so its sessions load —
  // detail is fetched by selectProject, so a plain id restore isn't enough.
  updated() {
    if (this._replayed) return
    const { projects, loading } = this._projects
    if (loading || !projects?.length) return
    this._replayed = true
    const saved = this._sel.find(projects)
    if (saved) this.selectProject(saved)
  }

  async selectProject(p) {
    this.selected = p
    this._sel.remember(p)
    this.detail = null
    this._loadingDetail = true
    try {
      this.detail = await getJson(`/project-detail?id=${encodeURIComponent(p.id)}`)
    } catch (e) {
      this.detail = { error: e.message }
    } finally {
      this._loadingDetail = false
    }
  }

  _togglePin(id, e) {
    e.stopPropagation()   // don't also select the project
    const next = new Set(this._pinned)
    next.has(id) ? next.delete(id) : next.add(id)
    this._pinned = next   // new ref → reactive update
    localStorage.setItem('pinnedProjects', JSON.stringify([...next]))
  }

  render() {
    const { projects, loading, error } = this._projects
    const { sessions, maxes, loading: sLoading } = this._sessions

    if (loading || sLoading) return html`
      <div class="flex items-center gap-3 text-dim py-12 px-6">
        <sl-spinner style="font-size:1.5rem; --track-color:var(--border); --indicator-color:var(--brand)"></sl-spinner>
        <span>Loading projects…</span>
      </div>
    `
    if (error) return html`
      <div class="m-6 border border-danger rounded-lg p-4 text-danger text-sm"
           style="background: color-mix(in srgb, var(--danger) 10%, transparent)">
        Could not reach server.py<br><span class="font-semibold">${error}</span>
      </div>
    `

    const q = (this._query ?? '').trim().toLowerCase()
    const filtered = q
      ? projects.filter(p => (p.name || '').toLowerCase().includes(q)
                          || (p.root_path || '').toLowerCase().includes(q))
      : projects
    const pinned = this._pinned
    // Pinned float to the top; sort is stable so recency order holds within each group.
    const ordered = [...filtered].sort((a, b) => (pinned.has(b.id) ? 1 : 0) - (pinned.has(a.id) ? 1 : 0))
    const project = this.selected ?? ordered[0] ?? null

    const byId = new Map(sessions.map(s => [s.session_id, s]))
    // detail.sessions carries the ids/order for this project; the full session
    // objects render the cards. Map to full objects, drop any we don't have.
    const projectSessions = (this.detail?.sessions ?? [])
      .map(ps => byId.get(ps.session_id))
      .filter(Boolean)
    // Remembered session if it belongs to this project, else the first.
    const session = this._selSession.find(projectSessions) ?? projectSessions[0] ?? null

    return html`
      <master-detail list-width="17.5rem" storage-key="md.projects.list">

        <div slot="list">
          <div class="p-2 border-b border-edge sticky top-0 z-10 bg-surface">
            <search-bar
              placeholder="Search projects…"
              .value=${this._query ?? ''}
              @search=${e => this._query = e.detail.value}
            ></search-bar>
          </div>
          <div class="px-3 py-2 text-xs text-dim border-b border-edge">
            ${q ? `${filtered.length} of ${projects.length}` : projects.length} projects
          </div>
          <div class="p-2 flex flex-col gap-1">
            ${ordered.map(p => {
              const isPinned = pinned.has(p.id)
              const providers = (p.providers ?? '').split(',').filter(Boolean)
              return html`
              <div class="group text-left rounded px-3 py-2 border transition-colors cursor-pointer
                          ${project?.id === p.id
                            ? 'bg-surface2 border-brand-dim'
                            : 'bg-transparent border-transparent hover:bg-inset'}"
                   ?data-sel-project=${project?.id === p.id}
                   @click=${() => this.selectProject(p)}>
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-sm text-fg font-medium truncate">${p.name}</div>
                    <div class="text-xs text-dim flex items-center gap-1.5">
                      ${providers.slice(0, 3).map(pr => html`
                        <span class="w-1.5 h-1.5 rounded-full" style="background:${provider(pr).color}"></span>
                      `)}
                      <span>${p.session_count} session${p.session_count === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <button class="flex-shrink-0 mt-0.5 transition-colors
                                 ${isPinned
                                   ? 'text-brand'
                                   : 'text-dim opacity-0 group-hover:opacity-100 hover:text-fg'}"
                          title=${isPinned ? 'Unpin project' : 'Pin project'}
                          @click=${e => this._togglePin(p.id, e)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
                         fill=${isPinned ? 'currentColor' : 'none'} stroke="currentColor"
                         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 17v5"/>
                      <path d="M9 10.8V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5.8l1.5 3.2h-9L9 10.8Z"/>
                    </svg>
                  </button>
                </div>
              </div>
            `})}
          </div>
        </div>

        <div slot="detail" style="height:100%;display:flex;flex-direction:column">
          ${project ? html`
            <master-detail list-width="20rem" style="--md-height:100%" storage-key="md.projects.sessions">

              <div slot="list">
                <div class="px-3 py-2 text-xs text-dim border-b border-edge">
                  📁 ${project.name} ·
                  ${this._loadingDetail
                    ? html`<sl-spinner style="font-size:0.8rem; vertical-align:middle"></sl-spinner>`
                    : `${projectSessions.length} session${projectSessions.length === 1 ? '' : 's'}`}
                </div>
                <div class="p-2 flex flex-col gap-1">
                  ${projectSessions.map(s => html`
                    <session-card
                      .session=${s}
                      .maxes=${maxes}
                      .selected=${session?.session_id === s.session_id}
                      ?data-sel-session=${session?.session_id === s.session_id}
                      @click=${() => this._selSession.remember(s)}
                    ></session-card>
                  `)}
                </div>
              </div>

              <div slot="detail">
                <session-detail .session=${session}></session-detail>
              </div>

            </master-detail>
          ` : html`
            <div class="h-full flex items-center justify-center text-dim text-sm">Select a project</div>
          `}
        </div>

      </master-detail>
    `
  }
}

customElements.define('projects-page', ProjectsPage)
