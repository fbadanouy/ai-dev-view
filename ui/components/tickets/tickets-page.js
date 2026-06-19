import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { TicketsController } from '../../hooks/use-tickets.js'
import { SessionsController } from '../../hooks/use-sessions.js'
import { SelectionController } from '../../hooks/use-selection.js'
import { timeAgo } from '../../lib/format.js'
import '../layout/master-detail.js'
import '../ui/search-bar.js'
import '../sessions/session-card.js'
import '../sessions/session-detail.js'

/* Tickets → sessions on that ticket → full session detail.
   The detail pane is itself a master-detail, reusing session-card and
   session-detail exactly as the sessions page does. */
class TicketsPage extends LitElement {
  static properties = {
    _query:          { state: true },
    _pinned:         { state: true },    // Set of pinned ticket keys (localStorage-backed)
  }

  _tickets  = new TicketsController(this)
  _sessions = new SessionsController(this)
  _sel        = new SelectionController(this, 'sel.tickets', t => t.ticket, { scrollSelector: '[data-sel-ticket]' })
  _selSession = new SelectionController(this, 'sel.tickets.session', s => s.session_id, { scrollSelector: '[data-sel-session]' })

  constructor() {
    super()
    // User preference only — no DB, mirrors how app-shell persists the theme.
    this._pinned = new Set(JSON.parse(localStorage.getItem('pinnedTickets') || '[]'))
  }

  createRenderRoot() { return this }

  selectTicket(t) { this._sel.remember(t) }

  _togglePin(key, e) {
    e.stopPropagation()   // don't also select the ticket
    const next = new Set(this._pinned)
    next.has(key) ? next.delete(key) : next.add(key)
    this._pinned = next   // new ref → reactive update
    localStorage.setItem('pinnedTickets', JSON.stringify([...next]))
  }

  render() {
    const { tickets, loading, error } = this._tickets
    const { sessions, maxes, loading: sLoading } = this._sessions

    if (loading || sLoading) return html`
      <div class="flex items-center gap-3 text-dim py-12 px-6">
        <sl-spinner style="font-size:1.5rem; --track-color:var(--border); --indicator-color:var(--brand)"></sl-spinner>
        <span>Loading tickets…</span>
      </div>
    `
    if (error) return html`
      <div class="m-6 border border-danger rounded-lg p-4 text-danger text-sm"
           style="background: color-mix(in srgb, var(--danger) 10%, transparent)">
        Could not reach server.py<br><span class="font-semibold">${error}</span>
      </div>
    `

    const q = (this._query ?? '').trim().toLowerCase()
    const filtered = q ? tickets.filter(t => t.ticket.toLowerCase().includes(q)) : tickets
    const pinned = this._pinned
    // Pinned float to the top; sort is stable so recency order holds within each group.
    const ordered = [...filtered].sort((a, b) => (pinned.has(b.ticket) ? 1 : 0) - (pinned.has(a.ticket) ? 1 : 0))
    // Remembered ticket if it's still in the list, else the first.
    const ticket = this._sel.find(ordered) ?? ordered[0] ?? null
    const byId = new Map(sessions.map(s => [s.session_id, s]))
    // ticket.sessions carries link/mentions; the full session objects render the cards
    const ticketSessions = (ticket?.sessions ?? [])
      .map(ts => ({ ...byId.get(ts.session_id), link: ts.link, mentions: ts.mentions }))
      .filter(s => s.session_id)
    // Remembered session if it belongs to this ticket, else the first.
    const session = this._selSession.find(ticketSessions) ?? ticketSessions[0] ?? null

    return html`
      <master-detail list-width="15rem">

        <div slot="list" class="flex flex-col h-full">
          <div class="p-2 border-b border-edge">
            <search-bar
              placeholder="Search tickets…"
              .value=${this._query ?? ''}
              @search=${e => this._query = e.detail.value}
            ></search-bar>
          </div>
          <div class="px-3 py-2 text-xs text-dim border-b border-edge">
            ${q ? `${filtered.length} of ${tickets.length}` : tickets.length} tickets
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1">
            ${ordered.map(t => {
              const isPinned = pinned.has(t.ticket)
              return html`
              <div class="group text-left rounded px-3 py-2 border transition-colors cursor-pointer
                          ${ticket?.ticket === t.ticket
                            ? 'bg-surface2 border-brand-dim'
                            : 'bg-transparent border-transparent hover:bg-inset'}"
                   ?data-sel-ticket=${ticket?.ticket === t.ticket}
                   @click=${() => this.selectTicket(t)}>
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-sm text-fg font-medium truncate">${t.ticket}</div>
                    <div class="text-xs text-dim">
                      ${t.session_count} session${t.session_count === 1 ? '' : 's'}
                      ${t.mention_count ? html` · ${t.mention_count} mention${t.mention_count === 1 ? '' : 's'}` : ''}
                      ${t.last_activity ? html` · ${timeAgo(t.last_activity)}` : ''}
                    </div>
                  </div>
                  <button class="flex-shrink-0 mt-0.5 transition-colors
                                 ${isPinned
                                   ? 'text-brand'
                                   : 'text-dim opacity-0 group-hover:opacity-100 hover:text-fg'}"
                          title=${isPinned ? 'Unpin ticket' : 'Pin ticket'}
                          @click=${e => this._togglePin(t.ticket, e)}>
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
          ${ticket ? html`
            <master-detail list-width="20rem" style="--md-height:100%">

              <div slot="list" class="flex flex-col h-full">
                <div class="px-3 py-2 text-xs text-dim border-b border-edge">
                  🎫 ${ticket.ticket} · ${ticketSessions.length} session${ticketSessions.length === 1 ? '' : 's'}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1">
                  ${ticketSessions.map(s => html`
                    <div>
                      ${s.link === 'mention' ? html`
                        <div class="px-3 pt-1 text-xs text-warn">
                          mentioned only ×${s.mentions} — primary ticket: ${s.ticket ?? 'none'}
                        </div>` : ''}
                      <session-card
                        .session=${s}
                        .maxes=${maxes}
                        .selected=${session?.session_id === s.session_id}
                        ?data-sel-session=${session?.session_id === s.session_id}
                        @click=${() => this._selSession.remember(s)}
                      ></session-card>
                    </div>
                  `)}
                </div>
              </div>

              <div slot="detail">
                <session-detail .session=${session}></session-detail>
              </div>

            </master-detail>
          ` : html`
            <div class="h-full flex items-center justify-center text-dim text-sm">Select a ticket</div>
          `}
        </div>

      </master-detail>
    `
  }
}

customElements.define('tickets-page', TicketsPage)
