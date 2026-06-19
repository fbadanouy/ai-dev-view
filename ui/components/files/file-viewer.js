import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { unsafeHTML } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12/lib/marked.esm.js'
import { fmtBytes } from '../../lib/format.js'
import { utf8Bytes, fileHealth, STATUS_META } from '../../lib/file-health.js'
import './context-load.js'

class FileViewer extends LitElement {
  static properties = { file: { type: Object } }

  createRenderRoot() { return this }

  render() {
    if (!this.file) return html`
      <div class="h-full flex items-center justify-center text-dim text-sm">
        Select a file
      </div>
    `

    const { name, path, content } = this.file
    const health = fileHealth(this.file)
    const sizeLabel = content ? fmtBytes(utf8Bytes(content)) : null

    return html`
      <div class="p-6 max-w-3xl">

        <div class="mb-4 pb-4 border-b border-edge">
          <div class="flex items-center gap-2 mb-1">
            <h2 class="text-lg font-semibold text-fg">${name}</h2>
            ${this._healthDot(health)}
          </div>
          <div class="text-xs text-dim font-mono mb-4">
            ${path}${sizeLabel ? html`&nbsp;<span class="text-dim opacity-60">[${sizeLabel}]</span>` : ''}
          </div>
          <context-load .file=${this.file}></context-load>
        </div>

        <div class="md">${unsafeHTML(marked.parse(content || ''))}</div>

      </div>
    `
  }

  _healthDot(health) {
    if (!health || !health.status) return ''
    const m = STATUS_META[health.status]
    const pct = Math.round(health.ratio * 100)
    return html`
      <span class="inline-flex items-center gap-1.5 text-xs" title="${health.summary} — ${health.source}">
        <span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${m.color}"></span>
        <span class="text-dim">${m.label} · ${pct}%</span>
      </span>
    `
  }

}

customElements.define('file-viewer', FileViewer)
