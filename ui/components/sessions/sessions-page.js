import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { SessionsController } from '../../hooks/use-sessions.js'
import '../layout/master-detail.js'
import '../ui/search-bar.js'
import './session-card.js'
import './session-detail.js'

class SessionsPage extends LitElement {
  static properties = {
    selected:   { type: Object },
    _query:     { state: true },
    _provider:  { state: true },
  }

  _sessions = new SessionsController(this)

  createRenderRoot() { return this }

  select(session) { this.selected = session }

  render() {
    const { sessions, maxes, loading, error } = this._sessions

    if (loading) return html`
      <div class="flex items-center gap-3 text-dim py-12 px-6">
        <sl-spinner style="font-size:1.5rem; --track-color:var(--border); --indicator-color:var(--brand)"></sl-spinner>
        <span>Loading sessions…</span>
      </div>
    `

    if (error) return html`
      <div class="m-6 bg-red-950 border border-rose-500 rounded-lg p-4 text-red-300 text-sm">
        Could not reach server.py<br><span class="font-semibold">${error}</span>
      </div>
    `

    const q = (this._query ?? '').trim().toLowerCase()
    const prov = this._provider ?? 'all'
    const filtered = sessions
      .filter(s => prov === 'all' || s.provider === prov)
      .filter(s => !q || (s.title ?? '').toLowerCase().includes(q)
                      || (s.ticket ?? '').toLowerCase().includes(q))
    const providers = [...new Set(sessions.map(s => s.provider).filter(Boolean))].sort()
    const selected = this.selected ?? filtered[0] ?? null

    return html`
      <master-detail list-width="20rem">

        <div slot="list">
          <div class="p-2 border-b border-edge">
            <search-bar
              placeholder="Search titles or tickets…"
              .value=${this._query ?? ''}
              @search=${e => this._query = e.detail.value}
            ></search-bar>
          </div>
          <div class="px-3 py-2 flex items-center gap-2 border-b border-edge">
            <span class="text-xs text-dim flex-1">${filtered.length}${filtered.length < sessions.length ? ` of ${sessions.length}` : ''} sessions</span>
            ${providers.length > 1 ? html`
              <select
                .value=${prov}
                @change=${e => { this._provider = e.target.value; this.selected = null }}
                class="text-xs bg-inset border border-edge-strong text-muted rounded px-1.5 py-0.5 cursor-pointer"
              >
                <option value="all">all providers</option>
                ${providers.map(p => html`<option value=${p}>${p}</option>`)}
              </select>
            ` : ''}
          </div>
          <div class="p-2 flex flex-col gap-1">
            ${filtered.map(s => html`
              <session-card
                .session=${s}
                .maxes=${maxes}
                .selected=${selected?.session_id === s.session_id}
                @click=${() => this.select(s)}
              ></session-card>
            `)}
          </div>
        </div>

        <div slot="detail">
          <session-detail .session=${selected}></session-detail>
        </div>

      </master-detail>
    `
  }
}

customElements.define('sessions-page', SessionsPage)
