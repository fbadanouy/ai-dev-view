import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import '../layout/master-detail.js'
import './file-viewer.js'

const TYPE_LABEL = { root: 'Root', agent: 'Agents', skill: 'Skills', steering: 'Steering' }
const TYPE_ORDER = ['root', 'agent', 'skill', 'steering']

function groupFiles(files) {
  const byType = {}
  for (const f of files) {
    ;(byType[f.type] = byType[f.type] || []).push(f)
  }

  const sections = []
  for (const type of TYPE_ORDER) {
    if (!byType[type]) continue
    const items = byType[type]

    if (type !== 'steering') {
      sections.push({ label: TYPE_LABEL[type], items, subgroups: null })
      continue
    }

    // steering: split into top-level + subgroups
    const top = items.filter(f => !f.group_name)
    const subMap = {}
    for (const f of items.filter(f => f.group_name)) {
      ;(subMap[f.group_name] = subMap[f.group_name] || []).push(f)
    }
    sections.push({ label: TYPE_LABEL[type], items: top, subgroups: subMap })
  }
  return sections
}

class FilesPage extends LitElement {
  static properties = {
    files:    { type: Array },
    selected: { type: Object },
    loading:  { type: Boolean },
  }

  constructor() {
    super()
    this.files = []
    this.selected = null
    this.loading = true
  }

  createRenderRoot() { return this }

  async connectedCallback() {
    super.connectedCallback()
    const res = await fetch('http://localhost:8765/api/files')
    this.files = await res.json()
    this.selected = this.files[0] ?? null
    this.loading = false
  }

  select(file) { this.selected = file }

  _fileRow(f) {
    const isActive = this.selected?.id === f.id
    const cls = isActive
      ? 'border-l-2 border-yellow-500 bg-yellow-900/10 text-fg'
      : 'border-l-2 border-transparent hover:bg-surface2 text-muted'
    return html`
      <div class="flex items-center justify-between px-3 py-1.5 cursor-pointer text-xs transition-all ${cls}"
           @click=${() => this.select(f)}>
        <span class="truncate">${f.name}</span>
      </div>
    `
  }

  render() {
    if (this.loading) return html`
      <div class="flex items-center gap-3 text-dim py-12 px-6">
        <sl-spinner style="font-size:1.5rem; --track-color:var(--border); --indicator-color:var(--brand)"></sl-spinner>
      </div>
    `

    const sections = groupFiles(this.files)

    return html`
      <master-detail list-width="260px">

        <div slot="list">
          ${sections.map(s => html`
            <div class="px-3 py-1.5 text-xs font-semibold text-dim uppercase tracking-widest border-b border-edge mt-1">
              ${s.label}
            </div>
            ${s.items.map(f => this._fileRow(f))}

            ${s.subgroups ? Object.entries(s.subgroups).map(([group, files]) => html`
              <div class="px-4 py-1 text-xs text-dim uppercase tracking-widest border-b border-edge">
                ${group}
              </div>
              ${files.map(f => this._fileRow(f))}
            `) : ''}
          `)}
        </div>

        <div slot="detail">
          <file-viewer .file=${this.selected}></file-viewer>
        </div>

      </master-detail>
    `
  }
}

customElements.define('files-page', FilesPage)
