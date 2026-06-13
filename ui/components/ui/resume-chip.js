import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { provider } from '../../lib/providers.js'

/*  <resume-chip>
 *
 *  Derives and copies the CLI resume command for a session.
 *  Pure frontend — no backend involvement.
 *
 *  Props:
 *    session-id  String   the session UUID
 *    provider    String   provider name (see lib/providers.js)
 */

class ResumeChip extends LitElement {
  static properties = {
    sessionId: { type: String, attribute: 'session-id' },
    provider:  { type: String },
    _copied:   { state: true },
  }

  createRenderRoot() { return this }

  get cmd() {
    const fn = provider(this.provider).resumeCmd
    return fn && this.sessionId ? fn(this.sessionId) : null
  }

  async copy(e) {
    e.stopPropagation()
    await navigator.clipboard.writeText(this.cmd)
    this._copied = true
    setTimeout(() => this._copied = false, 1500)
  }

  render() {
    if (!this.cmd) return html``
    return html`
      <button class="inline-flex items-center gap-1.5 bg-inset border border-edge rounded
                     px-2 py-1 text-[11px] font-mono text-muted hover:border-edge-strong
                     hover:text-fg transition-colors max-w-[14rem]"
              title="Click to copy: ${this.cmd}"
              @click=${e => this.copy(e)}>
        <span class="truncate min-w-0">${this.cmd}</span>
        <span class="flex-shrink-0 ${this._copied ? 'text-emerald-400' : 'text-dim'}">
          ${this._copied ? '✓' : '⎘'}
        </span>
      </button>
    `
  }
}

customElements.define('resume-chip', ResumeChip)
