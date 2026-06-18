import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { SkillsController } from '../../hooks/use-skills.js'
import { getJson } from '../../lib/api.js'
import { asyncView } from '../../lib/async-view.js'
import { fmtDate, fmtDuration } from '../../lib/format.js'
import '../layout/master-detail.js'
import '../ui/stat-card.js'
import '../sessions/session-mini-row.js'

/* Skills browser in the tool-calls-page style: compact list of skills with
   usage counts, detail pane with stats + the sessions that invoked it. */
class SkillsPage extends LitElement {
  static properties = {
    selected:       { type: Object },
    usage:          { type: Array },   // sessions that invoked the selected skill
    profile:        { type: Object },  // turn-anchored work profile (tools driven, duration)
    _loadingUsage:  { state: true },
  }

  _skills = new SkillsController(this)

  createRenderRoot() { return this }

  _key(s) { return s ? `${s.provider}|${s.skill_name}` : null }

  async selectSkill(s) {
    this.selected = s
    this.usage = null
    this.profile = null
    this._loadingUsage = true
    const enc = `${encodeURIComponent(s.provider)}/${encodeURIComponent(s.skill_name)}`
    const [usage, profile] = await Promise.all([
      getJson(`/skills/usage/${enc}`),
      getJson(`/skills/profile/${enc}`),
    ])
    this.usage = usage
    this.profile = profile
    this._loadingUsage = false
  }

  render() {
    const { skills, loading, error } = this._skills
    return asyncView({ loading, error }, () => this._renderBody(skills))
  }

  _renderBody(skills) {
    // Group by provider, then split each provider's skills into used/unused
    const providers = [...new Set(skills.map(s => s.provider))].sort()

    return html`
      <master-detail list-width="16.25rem">

        <div slot="list" class="text-xs">
          ${providers.map(p => {
            const pSkills = skills.filter(s => s.provider === p)
            const used    = pSkills.filter(s => s.sessions_used > 0)
            const unused  = pSkills.filter(s => !s.sessions_used)
            return html`
              <div class="px-3 pt-3 pb-1 text-xs font-semibold text-dim uppercase tracking-widest border-b border-edge">
                ${p}
              </div>
              ${used.map(s => this._row(s))}
              ${unused.length ? html`
                <div class="px-3 py-1 text-xs text-dim/50 uppercase tracking-widest">never invoked</div>
                ${unused.map(s => this._row(s))}
              ` : ''}
            `
          })}
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
    const border = this._key(this.selected) === this._key(s)
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
          <span class="text-xs px-2 py-0.5 rounded bg-surface2 text-dim">${s.provider}</span>
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
                   .value=${s.last_used ? fmtDate(s.last_used) : 'never'}
                   value-cls=${s.last_used ? 'text-fg' : 'text-dim'}></stat-card>
      </div>

      <!-- What it drives: real per-turn activity in the turns that invoked it -->
      ${this._renderProfile()}

      <!-- Sessions that invoked it -->
      ${this._loadingUsage ? html`
        <sl-spinner style="font-size:1.2rem; --track-color:var(--border); --indicator-color:var(--brand)"></sl-spinner>
      ` : (this.usage ?? []).length ? html`
        <div class="mb-8">
          <div class="text-xs font-semibold text-dim uppercase tracking-widest mb-3">Invoked in</div>
          <div class="flex flex-col gap-1">
            ${this.usage.map(u => html`<session-mini-row .session=${u}></session-mini-row>`)}
          </div>
        </div>
      ` : html`
        <div class="text-xs text-dim">Never invoked in a session — only explicit /${s.skill_name} calls count.</div>
      `}
    `
  }

  _renderProfile() {
    const p = this.profile
    if (!p || !p.turns) return ''
    const maxCalls = Math.max(...p.tools.map(t => t.calls), 1)
    return html`
      <div class="mb-8">
        <div class="text-xs font-semibold text-dim uppercase tracking-widest mb-1">What it drives</div>
        <div class="text-xs text-dim mb-3">
          Real activity in the ${p.turns} turn${p.turns === 1 ? '' : 's'} that invoked this skill —
          aggregated, not attributed to the skill alone.
        </div>

        <div class="grid grid-cols-3 gap-3 mb-4">
          <stat-card label="Invoking turns" .value=${p.turns}></stat-card>
          <stat-card label="Tool calls in those turns" .value=${p.tool_calls}></stat-card>
          <stat-card label="Time in those turns" .value=${fmtDuration(p.duration_secs)}></stat-card>
        </div>

        ${p.tools.length ? html`
          <div class="flex flex-col gap-1">
            ${p.tools.map(t => html`
              <div class="flex items-center gap-3 text-xs">
                <span class="font-mono text-fg w-44 truncate">${t.tool_name}</span>
                <div class="flex-1 h-3 bg-surface2 rounded overflow-hidden">
                  <div class="h-full bg-yellow-500/60" style="width:${(t.calls / maxCalls) * 100}%"></div>
                </div>
                <span class="text-dim w-8 text-right">${t.calls}</span>
              </div>
            `)}
          </div>
        ` : html`<div class="text-xs text-dim">No tool calls recorded in those turns.</div>`}
      </div>
    `
  }
}

customElements.define('skills-page', SkillsPage)
