import { PersistedController } from './use-persisted.js'

/*  SelectionController — remembers which row of a master list is selected,
 *  across reloads, and reveals it. Built on PersistedController: it stores just
 *  the row's id (keyFn(item)) in localStorage, resolves it back to a live object
 *  from the current list, and (optionally) scrolls the restored row into view.
 *  The standard remember → restore → reveal pattern for master/detail pages:
 *
 *    _sel = new SelectionController(this, 'sel.sessions', s => s.session_id,
 *                                   { scrollSelector: '[data-sel]' })
 *    select(s) { this._sel.remember(s) }              // on click
 *    render() {
 *      const selected = this._sel.find(list) ?? list[0] ?? null   // fallback to first
 *      // (omit the `?? list[0]` fallback for an empty-by-default page like Files)
 *      // mark the selected row so reveal can find it:
 *      //   ?data-sel=${selected?.session_id === s.session_id}
 *    }
 *
 *  keyFn maps an item to its stable id (session_id, project id, ticket key…).
 *
 *  scrollSelector (optional): a CSS selector matching the selected row in the
 *  host's light DOM. When the remembered id changes, hostUpdated scrolls that
 *  element into view ({ block: 'nearest' } → a no-op when already visible, so it
 *  reveals on reload/click without fighting the user's scroll while filtering).
 *  The page must stamp the matching attribute on its selected row; use a distinct
 *  selector per selection level (e.g. '[data-sel-project]' vs '[data-sel-session]').
 */
export class SelectionController {
  constructor(host, storageKey, keyFn, { scrollSelector } = {}) {
    this.host = host
    this.keyFn = keyFn
    this.scrollSelector = scrollSelector
    this._revealedId = undefined
    this._id = new PersistedController(host, storageKey, null)
    host.addController(this)
  }

  get id() { return this._id.value }

  /* Persist the clicked row (or null to clear). Triggers a host re-render. */
  remember(item) { this._id.value = item != null ? this.keyFn(item) : null }

  /* Resolve the remembered id against the current list; null if it's gone. */
  find(list) {
    const id = this._id.value
    if (id == null) return null
    return list.find(i => this.keyFn(i) === id) ?? null
  }

  /* After each render, scroll the selected row into view once per id change.
     The scroll container lives in <master-detail>'s shadow DOM, so we await its
     updateComplete before scrolling — otherwise the slot isn't projected/laid
     out yet and the scroll is a no-op. For async lists the marked row may not
     exist yet (querySelector returns null); _revealedId only advances once the
     scroll actually happens, and hostUpdated re-fires when the data arrives. */
  async hostUpdated() {
    if (!this.scrollSelector) return
    const id = this._id.value
    if (id == null || id === this._revealedId) return
    const el = this.host.querySelector(this.scrollSelector)
    if (!el) return
    await el.closest('master-detail')?.updateComplete   // pane laid out now
    // A freshly-mounted nested pane needs a frame for its scroll area to reach
    // full height; wait one before measuring.
    await new Promise(requestAnimationFrame)
    const scroller = scrollParent(el)
    if (scroller && scroller.clientHeight === 0) return   // not laid out yet → retry next update
    // Top-bias: scroll the card near the top of its scroll area. The search bar
    // lives outside this area, so nothing overlaps it.
    if (scroller) {
      scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8
    }
    // Safety net: nudge fully into view if still clipped (e.g. the very last row,
    // which can't be top-aligned). block:'nearest' is a no-op when already visible.
    el.scrollIntoView({ block: 'nearest' })
    this._revealedId = id
  }
}

/* Nearest scrollable ancestor of el (the list's overflow-y-auto container). */
function scrollParent(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}
