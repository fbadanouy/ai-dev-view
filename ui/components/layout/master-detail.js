import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'

class MasterDetail extends LitElement {
  static properties = {
    listWidth: { type: String, attribute: 'list-width' },
  }

  static styles = css`
    :host {
      display: flex;
      /* offset in rem so it tracks the header height at any UI scale */
      height: var(--md-height, calc(100vh - 7.5rem));
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
