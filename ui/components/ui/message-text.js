import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { unsafeHTML } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12/lib/marked.esm.js'
import { cleanClaudeText } from '../../lib/clean-claude-text.js'

/*  <message-text>
 *
 *  Renders message prose with harness-injected tags stripped.
 *  Always safe to use — if there's nothing to strip, renders text as-is.
 *
 *  Props:
 *    text     String   raw message text (may contain harness XML tags)
 *    preview  Boolean  single-line truncated mode (for collapsed bubbles)
 *    markdown Boolean  render prose as markdown (assistant messages, full mode
 *                      only — never affects preview or harness-stripped chips)
 *
 *  Annotation chip colours by type:
 *    command  → indigo   (slash commands the user invoked)
 *    stdout   → slate    (local command output)
 *    task     → amber    (task notifications)
 *    thinking → violet   (assistant reasoning blocks)
 */

const CHIP_STYLES = {
  command:  { bg: 'bg-indigo-950/60',  border: 'border-indigo-800',  text: 'text-indigo-400',  icon: '/' },
  stdout:   { bg: 'bg-inset',   border: 'border-edge-strong',   text: 'text-muted',   icon: '$' },
  task:     { bg: 'bg-amber-950/60',   border: 'border-amber-800',   text: 'text-amber-400',   icon: '⚙' },
  thinking: { bg: 'bg-violet-950/60',  border: 'border-violet-800',  text: 'text-violet-400',  icon: '💭' },
}

class MessageText extends LitElement {
  static properties = {
    text:     { type: String },
    preview:  { type: Boolean },
    markdown: { type: Boolean },
  }

  createRenderRoot() { return this }

  render() {
    const { clean, annotations } = cleanClaudeText(this.text)

    // Preview mode: single line, truncated, annotations as inline dot-count
    if (this.preview) {
      const prose = clean || (annotations.length ? '' : (this.text ?? ''))
      const line  = prose.replace(/\s+/g, ' ').trim()
      return html`
        <span class="flex items-center gap-1 min-w-0 max-w-full overflow-hidden">
          <span class="truncate">${line || (annotations.length ? annotations[0].label : '')}</span>
          ${annotations.length && line ? html`
            <span class="flex-shrink-0 text-xs text-dim">+${annotations.length}</span>
          ` : ''}
        </span>
      `
    }

    // Full mode: prose block + annotation chips
    return html`
      ${clean ? (this.markdown
        ? html`<div class="md break-words text-fg">${unsafeHTML(marked.parse(clean))}</div>`
        : html`<div class="whitespace-pre-wrap break-words leading-relaxed text-fg">${clean}</div>`)
      : ''}

      ${annotations.length ? html`
        <div class="flex flex-wrap gap-1.5 ${clean ? 'mt-2' : ''}">
          ${annotations.map(a => {
            const s = CHIP_STYLES[a.type] ?? CHIP_STYLES.stdout
            return html`
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border
                           text-xs font-medium ${s.bg} ${s.border} ${s.text}"
                    title=${a.detail ?? a.label}>
                <span class="opacity-60">${s.icon}</span>
                ${a.label}
              </span>
            `
          })}
        </div>
      ` : ''}
    `
  }
}

customElements.define('message-text', MessageText)
