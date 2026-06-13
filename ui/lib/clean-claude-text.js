/*  cleanClaudeText(raw) → { clean: string, annotations: Annotation[] }
 *
 *  Strips harness-injected XML tags from Claude Code session messages and
 *  returns human-readable prose. Safe to call on any provider — if no known
 *  tags are found, clean === raw.trimmed and annotations === [].
 *
 *  Annotation: { type: string, label: string, detail?: string }
 *    type:  'command' | 'stdout' | 'task' | 'thinking' | 'reminder'
 *    label: short display string for the chip
 *    detail: full stripped content (optional, for expand-on-demand)
 */

// Tags that are stripped silently — pure harness noise, no signal for the user.
const SILENT_TAGS = new Set([
  'system-reminder',
  'local-command-caveat',
])

// ANSI escape sequences (bold, colour, reset, etc.)
const ANSI_RE = /\x1b\[[0-9;]*m/g

export function cleanClaudeText(raw) {
  if (!raw) return { clean: '', annotations: [] }

  const annotations = []
  let text = raw

  // ── Slash command group ───────────────────────────────────────────
  // command-name + command-message + command-args travel together.
  // Collapse the group into one 'command' annotation.
  text = text.replace(
    /<command-name>([\s\S]*?)<\/command-name>\s*<command-message>([\s\S]*?)<\/command-message>\s*(?:<command-args>([\s\S]*?)<\/command-args>)?/g,
    (_, _name, _msg, args) => {
      const cmd  = _name.trim() || _msg.trim()
      const argv = (args ?? '').trim()
      annotations.push({ type: 'command', label: argv ? `${cmd} ${argv}` : cmd })
      return ''
    }
  )

  // ── local-command-stdout ─────────────────────────────────────────
  text = text.replace(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/g, (_, content) => {
    const stripped = content.replace(ANSI_RE, '').trim()
    const label    = stripped.length > 60 ? stripped.slice(0, 60) + '…' : stripped
    annotations.push({ type: 'stdout', label, detail: stripped })
    return ''
  })

  // ── task-notification ────────────────────────────────────────────
  text = text.replace(/<task-notification>([\s\S]*?)<\/task-notification>/g, (_, content) => {
    // extract task-id if present
    const idMatch = content.match(/<task-id>([\s\S]*?)<\/task-id>/)
    const id = idMatch ? idMatch[1].trim().slice(0, 12) : ''
    annotations.push({ type: 'task', label: id ? `task ${id}` : 'task notification' })
    return ''
  })

  // ── thinking blocks (antml:thinking / antml-thinking) ────────────
  text = text.replace(/<antml[-:]thinking>([\s\S]*?)<\/antml[-:]thinking>/g, (_, content) => {
    const chars = content.trim().length
    const kb    = chars > 1000 ? `${(chars / 1000).toFixed(1)}k` : `${chars}`
    annotations.push({ type: 'thinking', label: `thinking · ${kb} chars` })
    return ''
  })

  // ── silent strips ────────────────────────────────────────────────
  for (const tag of SILENT_TAGS) {
    const re = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'g')
    text = text.replace(re, '')
  }

  // ── residual ANSI codes ──────────────────────────────────────────
  text = text.replace(ANSI_RE, '')

  // ── normalise whitespace ─────────────────────────────────────────
  text = text.replace(/\n{3,}/g, '\n\n').trim()

  return { clean: text, annotations }
}
