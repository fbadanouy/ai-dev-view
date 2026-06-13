import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

class MasterDetail extends LitElement {
  static properties = {
    listWidth: { type: String },
  }

  static styles = css`
    :host {
      display: flex;
      height: var(--md-height, calc(100vh - 120px));
      overflow: hidden;
    }
    .list {
      flex-shrink: 0;
      border-right: 1px solid var(--border);
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
    }
    .detail {
      flex: 1;
      overflow-y: auto;
      min-width: 0;
    }
  `

  render() {
    const width = this.listWidth || '280px'
    return html`
      <div class="list" style="width:${width}">
        <slot name="list"></slot>
      </div>
      <div class="detail">
        <slot name="detail"></slot>
      </div>
    `
  }
}

customElements.define('master-detail', MasterDetail)
