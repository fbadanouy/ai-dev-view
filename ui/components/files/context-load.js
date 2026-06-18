import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { approxTokens, splitFrontmatter, fileHealth, STATUS_META } from '../../lib/file-health.js'
import { typeContext } from '../../lib/file-context.js'

/*  <context-load> — the single panel shown for EVERY file, all types.
 *
 *  It explains the file as it shows it:
 *    1. what kind of file it is + a one-line blurb        (from file-context.js)
 *    2. the load breakdown — what enters context and WHEN  (real sizes)
 *    3. the recommendation at the bottom — documented budget + docs link
 *
 *  All copy is per-type config; all sizes are measured from the file (never
 *  estimated). Tiers that measure nothing (e.g. metadata on a file with no
 *  frontmatter) are skipped, so one config covers every shape.
 */
class ContextLoad extends LitElement {
  static properties = { file: { type: Object } }

  createRenderRoot() { return this }

  render() {
    if (!this.file) return ''
    const { type, content } = this.file
    const cfg = typeContext(type)
    const text = content || ''
    const { meta, body } = splitFrontmatter(text)
    const health = fileHealth(this.file)

    const tiers = cfg.tiers
      .map(t => ({ ...t, ...this._measure(t.measure, { text, meta, body }) }))
      .filter(t => t.present)

    return html`
      <div class="bg-surface border border-edge rounded-lg px-3 py-2.5 mb-4">

        <!-- what it is -->
        <div class="flex items-baseline gap-2 mb-2">
          <span class="flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest
                       text-dim bg-surface2 border border-edge rounded px-1.5 py-0.5">
            ${cfg.label}
          </span>
          ${cfg.blurb ? html`<span class="text-xs text-muted leading-snug">${cfg.blurb}</span>` : ''}
        </div>

        <!-- what loads, and when -->
        <div class="flex flex-col">
          ${tiers.map(t => this._tier(t, health))}
        </div>

        <!-- recommendation -->
        ${this._recommendation(cfg, health)}

      </div>
    `
  }

  /* Real measurement for a tier. Returns { present, tok, detail }. */
  _measure(measure, { text, meta, body }) {
    if (measure === 'resources') {
      const res = this.file.resources || []
      const bytes = res.reduce((s, r) => s + (r.bytes || 0), 0)
      return {
        present: true,
        tok: approxTokens(bytes),
        detail: res.length
          ? `${res.length} file${res.length === 1 ? '' : 's'} · ≈ ${approxTokens(bytes).toLocaleString()} tok`
          : 'none',
        empty: !res.length,
      }
    }
    const slice = measure === 'meta' ? meta : measure === 'body' ? body : text
    if (!slice) return { present: false }
    const tok = approxTokens(slice.length)
    const lines = slice.split('\n').length
    return { present: true, tok, detail: `≈ ${tok.toLocaleString()} tok · ${lines} lines` }
  }

  _tier(t, health) {
    // A budgeted tier turns the documented health status into its accent + warning.
    const budgeted = t.budget && health
    const color = budgeted ? STATUS_META[health.status].color : t.color
    const warn = budgeted && health.status === 'red' ? 'over'
               : budgeted && health.status === 'yellow' ? 'near' : null
    return html`
      <div class="flex items-center gap-2 py-1 text-xs">
        <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:${color}"></span>
        <span class="text-fg flex-shrink-0">${t.label}</span>
        <span class="text-dim truncate">${t.when}</span>
        <span class="ml-auto flex-shrink-0 font-mono ${warn ? 'text-amber-400' : 'text-muted'} ${t.empty ? 'opacity-50' : ''}">
          ${t.detail}${warn ? html` <span class="text-[10px]">(${warn})</span>` : ''}
        </span>
      </div>
    `
  }

  _recommendation(cfg, health) {
    if (!health && !cfg.note && !cfg.docs) return ''

    return html`
      <div class="mt-2 pt-2 border-t border-edge/50 flex items-center gap-2 text-xs">
        ${health ? html`
          <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:${STATUS_META[health.status].color}"></span>
          <span class="text-dim font-mono truncate" title=${health.source}>${health.summary}</span>
        ` : cfg.note ? html`
          <span class="text-dim truncate" title=${cfg.note}>${cfg.note}</span>
        ` : ''}

        ${cfg.docs ? html`
          <a href=${cfg.docs.url || '#'} target=${cfg.docs.url ? '_blank' : '_self'} rel="noreferrer"
             class="ml-auto flex-shrink-0 inline-flex items-center gap-1 ${cfg.docs.url ? '' : 'pointer-events-none opacity-40'}"
             style="color:var(--accent, #c9a227)">
            docs<span aria-hidden="true">↗</span>
          </a>
        ` : ''}
      </div>
    `
  }
}

customElements.define('context-load', ContextLoad)
