import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { unsafeHTML } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12/lib/marked.esm.js'

class FileViewer extends LitElement {
  static properties = { file: { type: Object } }

  createRenderRoot() { return this }

  render() {
    if (!this.file) return html`
      <div class="h-full flex items-center justify-center text-dim text-sm">
        Select a file
      </div>
    `

    const { name, type, group_name, path, content } = this.file

    return html`
      <div class="p-6 max-w-3xl">

        <div class="mb-6 pb-4 border-b border-edge">
          <h2 class="text-lg font-semibold text-fg mb-1">${name}</h2>
          <div class="text-xs text-dim font-mono">${path}</div>
          <div class="flex gap-2 mt-2">
            <span class="text-xs px-2 py-0.5 rounded bg-surface2 text-muted uppercase tracking-widest">${type}</span>
            ${group_name ? html`<span class="text-xs px-2 py-0.5 rounded bg-surface2 text-muted">${group_name}</span>` : ''}
          </div>
        </div>

        <style>
          .md h1,.md h2,.md h3 { color:var(--text-base); font-weight:600; margin:1.5rem 0 .5rem; font-family:'JetBrains Mono',monospace; }
          .md h1 { font-size:1.4rem; } .md h2 { font-size:1.1rem; } .md h3 { font-size:.95rem; }
          .md p  { color:var(--text-muted); line-height:1.7; margin:.75rem 0; font-size:.85rem; }
          .md ul,.md ol { color:var(--text-muted); padding-left:1.25rem; margin:.75rem 0; font-size:.85rem; }
          .md li { margin:.25rem 0; }
          .md code { background:#1e293b; color:#7dd3fc; padding:1px 5px; border-radius:3px; font-size:.8rem; }
          .md pre  { background:#0f172a; border:1px solid #1e293b; border-radius:6px; padding:1rem; overflow-x:auto; margin:1rem 0; }
          .md pre code { background:none; color:var(--text-muted); padding:0; }
          .md table { width:100%; border-collapse:collapse; font-size:.8rem; margin:1rem 0; }
          .md th { background:#1e293b; color:var(--text-base); padding:.5rem .75rem; text-align:left; border:1px solid #334155; }
          .md td { color:var(--text-muted); padding:.5rem .75rem; border:1px solid #1e293b; }
          .md tr:nth-child(even) td { background:#0f172a; }
          .md blockquote { border-left:3px solid #c9a227; padding-left:1rem; color:#64748b; margin:1rem 0; }
          .md a { color:#c9a227; text-decoration:none; } .md a:hover { text-decoration:underline; }
          .md hr { border-color:#1e293b; margin:1.5rem 0; }
        </style>

        <div class="md">${unsafeHTML(marked.parse(content || ''))}</div>

      </div>
    `
  }
}

customElements.define('file-viewer', FileViewer)
