import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { SkillsController } from '../../hooks/use-skills.js'
import '../layout/master-detail.js'
import '../ui/stat-card.js'

/* Skills browser in the tool-calls-page style: compact list of skills with
   usage counts, detail pane with stats + the sessions that invoked it. */
class SkillsPage extends LitElement {
  static properties = {
    selected:       { type: Object },
    usage:          { type: Array },   // sessions that invoked the selected skill
    _loadingUsage:  { state: true },
  }

  _skills = new SkillsController(this)

  createRenderRoot() { return this }

  async selectSkill(s) {
    this.selected = s
    this.usage = null
    this._loadingUsage = true
    const res = await fetch(`http://localhost:8765/api/skills/usage/${encodeURIComponent(s.skill_name)}`)
    this.usage = await res.json()
    this._loadingUsage = false
  }

  render() {
    const { skills, loading, error } = this._skills

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

    const used   = skills.filter(s => s.sessions_used > 0)
    const unused = skills.filter(s => !s.sessions_used)

    return html`
      <master-detail list-width="260px">

        <div slot="list" class="text-xs">
          ${used.length ? html`
            <div class="px-3 py-2 text-xs font-semibold text-dim uppercase tracking-widest border-b border-edge">
              Invoked
            </div>
            ${used.map(s => this._row(s))}
          ` : ''}
          ${unused.length ? html`
            <div class="px-3 py-2 text-xs font-semibold text-dim uppercase tracking-widest border-b border-edge border-t mt-1">
              Never invoked
            </div>
            ${unused.map(s => this._row(s))}
          ` : ''}
        </div>

        <div slot="detail" class="p-6">
          ${!this.selected ? html`
            <div class="flex items-center justify-center h-32 text-dim text-sm">
              Select a skill to explore it
            </div>
          ` : this._renderDetail()}
        </div>

      </master-detail>
    `
  }

  _row(s) {
    const border = this.selected?.skill_name === s.skill_name
      ? 'border-l-2 border-yellow-500 bg-yellow-900/10'
      : 'border-l-2 border-transparent hover:bg-surface2'
    return html`
      <div class="flex items-center justify-between px-3 py-2 cursor-pointer transition-all duration-100 ${border}"
           @click=${() => this.selectSkill(s)}>
        <span class="font-mono text-xs text-fg truncate">${s.skill_name}</span>
        <span class="flex-shrink-0 ml-2 text-xs ${s.sessions_used ? 'text-dim' : 'text-dim'}">
          ${s.total_uses ?? 0}
        </span>
      </div>
    `
  }

  _renderDetail() {
    const s = this.selected

    return html`
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center gap-3 mb-1">
          <h2 class="font-mono text-lg text-yellow-400">⚡ ${s.skill_name}</h2>
          <span class="text-xs px-2 py-0.5 rounded bg-surface2 text-muted">skill</span>
        </div>
        ${s.description ? html`<div class="text-sm text-muted">${s.description}</div>` : ''}
        ${s.path ? html`<div class="text-xs text-dim font-mono mt-1 truncate">${s.path}</div>` : ''}
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-4 gap-3 mb-8">
        <stat-card label="Sessions used" .value=${s.sessions_used ?? 0}></stat-card>
        <stat-card label="Total invocations" .value=${s.total_uses ?? 0}></stat-card>
        <stat-card label="Avg per session" .value=${s.avg_per_session ?? '—'}></stat-card>
        <stat-card label="Last used"
                   .value=${s.last_used ? new Date(s.last_used).toLocaleDateString() : 'never'}
                   value-cls=${s.last_used ? 'text-fg' : 'text-dim'}></stat-card>
      </div>

      <!-- Sessions that invoked it -->
      ${this._loadingUsage ? html`
        <sl-spinner style="font-size:1.2rem; --track-color:var(--border); --indicator-color:var(--brand)"></sl-spinner>
      ` : (this.usage ?? []).length ? html`
        <div class="mb-8">
          <div class="text-xs font-semibold text-dim uppercase tracking-widest mb-3">Invoked in</div>
          <div class="flex flex-col gap-1">
            ${this.usage.map(u => html`
              <div class="flex items-center justify-between px-3 py-2 rounded border border-edge hover:border-edge-strong text-xs">
                <span class="text-fg truncate max-w-sm">${u.title || 'untitled'}</span>
                <div class="flex items-center gap-3 flex-shrink-0 ml-3">
                  ${u.ticket ? html`<span class="text-dim">🎫 ${u.ticket}</span>` : ''}
                  <span class="text-yellow-400 font-semibold">${u.count}x</span>
                  <span class="text-dim">${new Date(u.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            `)}
          </div>
        </div>
      ` : html`
        <div class="text-xs text-dim">Never invoked in a session — only explicit /${s.skill_name} calls count.</div>
      `}
    `
  }
}

customElements.define('skills-page', SkillsPage)
