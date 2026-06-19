import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

class MasterDetail extends LitElement {
  static properties = {
    listWidth:  { type: String, attribute: 'list-width' },
    storageKey: { type: String, attribute: 'storage-key' },  // persist user-dragged width
    minWidth:   { type: Number, attribute: 'min-width' },
    maxWidth:   { type: Number, attribute: 'max-width' },
    _width:     { state: true },   // px once the user drags / restores; else null → use listWidth
  }

  static styles = css`
    :host {
      display: flex;
      /* _fit() measures the real header offset and sets --md-height in px, so the
         list fits the viewport exactly (no magic header-height constant). Nested
         master-details pass --md-height:100% inline and keep it. */
      height: var(--md-height, calc(100vh - 7.5rem));
      overflow: hidden;
    }
    .list {
      flex-shrink: 0;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
    }
    .handle {
      flex: 0 0 auto;
      width: 5px;
      margin-left: -1px;          /* sit over the border, keep layout width */
      cursor: col-resize;
      background: var(--border);
      transition: background 0.12s;
      touch-action: none;
    }
    .handle:hover,
    .handle.dragging { background: var(--brand, #999); }
    .detail {
      flex: 1;
      overflow-y: auto;
      min-width: 0;
    }
    /* keep text selection from kicking in mid-drag */
    :host(.resizing) { user-select: none; }
  `

  constructor() {
    super()
    this.minWidth = 180
    this.maxWidth = 640
    this._width = null
    this._onMove = this._onMove.bind(this)
    this._onUp = this._onUp.bind(this)
    this._fit = this._fit.bind(this)
  }

  connectedCallback() {
    super.connectedCallback()
    if (this.storageKey) {
      const saved = parseInt(localStorage.getItem(this.storageKey) || '', 10)
      if (Number.isFinite(saved)) this._width = saved
    }
    window.addEventListener('resize', this._fit)
  }

  firstUpdated() { this._fit() }

  /* Size the host to fill from its own top to the viewport bottom, so the list
     scroll area never runs off-screen. Skips nested master-details, which set
     --md-height:100% inline to fill their parent's detail pane. */
  _fit() {
    if (this.style.getPropertyValue('--md-height')) return
    const top = this.getBoundingClientRect().top
    this.style.setProperty('--md-height', `${Math.max(0, window.innerHeight - top)}px`)
  }

  _onDown(e) {
    e.preventDefault()
    const startX = e.clientX
    const startW = this.renderRoot.querySelector('.list').getBoundingClientRect().width
    this._drag = { startX, startW }
    this.classList.add('resizing')
    this.renderRoot.querySelector('.handle')?.classList.add('dragging')
    window.addEventListener('pointermove', this._onMove)
    window.addEventListener('pointerup', this._onUp)
  }

  _onMove(e) {
    if (!this._drag) return
    const next = this._drag.startW + (e.clientX - this._drag.startX)
    this._width = Math.max(this.minWidth, Math.min(this.maxWidth, next))
  }

  _onUp() {
    this._drag = null
    this.classList.remove('resizing')
    this.renderRoot.querySelector('.handle')?.classList.remove('dragging')
    window.removeEventListener('pointermove', this._onMove)
    window.removeEventListener('pointerup', this._onUp)
    if (this.storageKey && this._width != null) {
      localStorage.setItem(this.storageKey, String(Math.round(this._width)))
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('pointermove', this._onMove)
    window.removeEventListener('pointerup', this._onUp)
    window.removeEventListener('resize', this._fit)
  }

  render() {
    const width = this._width != null ? `${this._width}px` : (this.listWidth || '280px')
    return html`
      <div class="list" style="width:${width}">
        <slot name="list"></slot>
      </div>
      <div class="handle" @pointerdown=${e => this._onDown(e)}></div>
      <div class="detail">
        <slot name="detail"></slot>
      </div>
    `
  }
}

customElements.define('master-detail', MasterDetail)
