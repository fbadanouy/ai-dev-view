import { html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

/*  asyncView — one place for the loading / error / empty UI states.
 *
 *  A render helper rather than a component because the app renders into light
 *  DOM (no shadow root), where <slot> projection isn't available. Call it with
 *  the current state and a content thunk:
 *
 *    ${asyncView({ loading, error }, () => html`…the loaded content…`)}
 *
 *  Pass `empty: true` (and optional `emptyText`) to show the empty state instead
 *  of invoking the content thunk.
 */
export function asyncView({ loading, error, empty, emptyText } = {}, content) {
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
  if (empty) return html`
    <div class="px-6 py-12 text-dim text-sm">${emptyText ?? 'Nothing here yet.'}</div>
  `
  return content ? content() : ''
}
