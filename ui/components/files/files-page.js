import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { provider } from '../../lib/providers.js'
import { fileHealth, STATUS_META } from '../../lib/file-health.js'
import { getJson } from '../../lib/api.js'
import { asyncView } from '../../lib/async-view.js'
import '../layout/master-detail.js'
import '../ui/search-bar.js'
import './file-viewer.js'

const PROVIDER_ORDER = ['kiro', 'claude', 'codex', 'shared']
const TYPE_LABEL = {
  root: 'Root', instructions: 'Instructions', steering: 'Steering',
  agent: 'Agents', skill: 'Skills', command: 'Commands',
}
const TYPE_ORDER = ['root', 'instructions', 'steering', 'agent', 'skill', 'command']

const USER_KEY = ' user'   // sorts before any project_id

/* Build Provider → Project → Type tree from the flat file list. */
function groupTree(files) {
  const byProv = {}
  for (const f of files) (byProv[f.provider] = byProv[f.provider] || []).push(f)

  const provs = [
    ...PROVIDER_ORDER.filter(p => byProv[p]),
    ...Object.keys(byProv).filter(p => !PROVIDER_ORDER.includes(p)).sort(),
  ]

  return provs.map(p => {
    const byProj = {}
    for (const f of byProv[p]) {
      const key = f.scope === 'user' ? USER_KEY : f.project_id
      ;(byProj[key] = byProj[key] || []).push(f)
    }
    const projKeys = Object.keys(byProj).sort((a, b) =>
      a === USER_KEY ? -1 : b === USER_KEY ? 1 : a.localeCompare(b))

    const projects = projKeys.map(k => {
      const byType = {}
      for (const f of byProj[k]) (byType[f.type] = byType[f.type] || []).push(f)
      const types = [
        ...TYPE_ORDER.filter(t => byType[t]),
        ...Object.keys(byType).filter(t => !TYPE_ORDER.includes(t)).sort(),
      ].map(t => ({ type: t, label: TYPE_LABEL[t] || t, items: byType[t] }))
      return {
        label: k === USER_KEY ? 'User (home)' : (k.split('/').pop() || k),
        count: byProj[k].length,
        types,
      }
    })
    return { provider: p, count: byProv[p].length, projects }
  })
}

class FilesPage extends LitElement {
  static properties = {
    files:    { type: Array },
    selected: { type: Object },
    loading:  { type: Boolean },
    _error:   { state: true },
    _filter:  { state: true },
  }

  constructor() {
    super()
    this.files = []
    this.selected = null
    this.loading = true
    this._error = null
    this._filter = ''
  }

  createRenderRoot() { return this }

  async connectedCallback() {
    super.connectedCallback()
    try {
      this.files = await getJson('/files')
      this.selected = this.files[0] ?? null
    } catch (e) {
      this._error = String(e)
    } finally {
      this.loading = false
    }
  }

  select(file) { this.selected = file }

  _onSelect(e) {
    const item = e.detail.selection?.[0]
    if (item && item.file) this.select(item.file)
  }

  _leaf(f) {
    const health = fileHealth(f)
    const dot = health && health.status
      ? html`<span class="inline-block w-2 h-2 rounded-full flex-shrink-0"
                   style="background:${STATUS_META[health.status].color}"
                   title="${health.summary}"></span>`
      : ''
    return html`
      <sl-tree-item class="leaf" .file=${f} ?selected=${this.selected?.id === f.id}>
        <span class="flex items-center gap-2 w-full min-w-0">
          <span class="flex-1 truncate text-sm">${f.name}</span>
          ${dot}
        </span>
      </sl-tree-item>
    `
  }

  render() {
    return asyncView({ loading: this.loading, error: this._error }, () => this._renderTree())
  }

  _renderTree() {
    const q = this._filter.trim().toLowerCase()
    const matched = q
      ? this.files.filter(f => (f.name || '').toLowerCase().includes(q))
      : this.files
    const tree = groupTree(matched)

    return html`
      <style>
        .files-filter { padding: 0.5rem; border-bottom: 1px solid var(--border); }
        .files-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }
        .files-tree {
          --indent-size: 1rem;
          --indent-guide-width: 1px;
          --indent-guide-color: var(--border);
          font-size: 0.875rem;
          /* extra right padding so dots/counts clear the scrollbar */
          padding: 0.5rem 0.85rem 0.5rem 0.25rem;
        }
        .files-tree sl-tree-item::part(item) {
          border: 0;
          padding: 1px 0;
        }
        .files-tree sl-tree-item::part(label) {
          flex: 1 1 auto;
          min-width: 0;
        }
        /* selected leaf → yellow accent, matching the rest of the app */
        .files-tree sl-tree-item[selected] > .leaf,
        .files-tree sl-tree-item.leaf[selected]::part(item) {
          background: var(--accent-glow, rgba(201,162,39,0.12));
        }
        .files-tree sl-tree-item::part(item--selected) {
          background-color: var(--accent-glow, rgba(201,162,39,0.12));
          box-shadow: inset 2px 0 0 var(--accent, #c9a227);
        }
      </style>

      <master-detail list-width="22.5rem">

        <div slot="list" class="flex flex-col h-full">
          <div class="files-filter">
            <search-bar placeholder="Filter files…"
                        .value=${this._filter}
                        @search=${e => { this._filter = e.detail.value }}></search-bar>
          </div>

          <div class="files-scroll">
          ${!tree.length ? html`
            <div class="px-4 py-6 text-xs text-dim">No files match “${this._filter}”.</div>
          ` : html`
          <sl-tree class="files-tree" selection="leaf" @sl-selection-change=${e => this._onSelect(e)}>
            ${tree.map(prov => html`
              <sl-tree-item expanded>
                <span class="flex items-center gap-2 w-full min-w-0">
                  <span class="text-sm font-bold uppercase tracking-widest ${provider(prov.provider).text}">
                    ${prov.provider}
                  </span>
                  <span class="ml-auto text-xs text-dim">${prov.count}</span>
                </span>

                ${prov.projects.map(proj => html`
                  <sl-tree-item expanded>
                    <span class="flex items-center gap-2 w-full min-w-0">
                      <span class="text-sm font-semibold text-fg/80 truncate">${proj.label}</span>
                      <span class="ml-auto text-xs text-dim">${proj.count}</span>
                    </span>

                    ${proj.types.map(tp => html`
                      <sl-tree-item expanded>
                        <span class="text-[11px] uppercase tracking-wider text-dim">${tp.label}</span>
                        ${tp.items.map(f => this._leaf(f))}
                      </sl-tree-item>
                    `)}
                  </sl-tree-item>
                `)}
              </sl-tree-item>
            `)}
          </sl-tree>
          `}
          </div>
        </div>

        <div slot="detail">
          <file-viewer .file=${this.selected}></file-viewer>
        </div>

      </master-detail>
    `
  }
}

customElements.define('files-page', FilesPage)
