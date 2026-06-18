/*  file-health.js — size/context "health" for AI config files.
 *
 *  Honest by construction: byte/char/line counts are exact; token figures are an
 *  explicit approximation (~4 chars/token) since no offline tokenizer ships here.
 *  A health status only exists for file types with a DOCUMENTED budget — others
 *  return null (no badge), never a fabricated limit.
 *
 *  Sources (official Claude Code docs):
 *    skills.md  — keep SKILL.md under 500 lines; ~5000-token per-skill budget
 *    memory.md  — target CLAUDE.md under 200 lines
 *  Subagents have NO documented size budget (bounded by the 200k context window),
 *  so the 'agent' type intentionally gets no health status.
 */

export const approxTokens = chars => Math.round(chars / 4)
export const utf8Bytes = s => new TextEncoder().encode(s).length

export function splitFrontmatter(content) {
  if (!content || !content.startsWith('---')) return { meta: null, body: content || '' }
  const end = content.indexOf('\n---', 3)
  if (end === -1) return { meta: null, body: content }
  const close = content.indexOf('\n', end + 1)
  const cut = close === -1 ? content.length : close + 1
  return { meta: content.slice(0, cut), body: content.slice(cut) }
}

// Documented budgets per file type. `basis`: 'body' measures the post-frontmatter
// body (skills' on-activation payload); 'file' measures the whole file (memory docs).
export const BUDGETS = {
  skill:        { lines: 500, tokens: 5000, basis: 'body', source: 'Skills guidance: SKILL.md under 500 lines' },
  instructions: { lines: 200,               basis: 'file', source: 'Memory guidance: CLAUDE.md under 200 lines' },
  root:         { lines: 200,               basis: 'file', source: 'Treated like CLAUDE.md (under 200 lines)' },
}

// Skill listing truncates description + when_to_use beyond this many chars.
export const SKILL_DESC_CHAR_CAP = 1536

// ratio → status. Lean until 60%, growing to 85%, then near/over the limit.
export function statusFor(ratio) {
  if (ratio == null) return null
  if (ratio < 0.6)  return 'green'
  if (ratio < 0.85) return 'yellow'
  return 'red'
}

export const STATUS_META = {
  green:  { color: '#859900', label: 'lean' },
  yellow: { color: '#b58900', label: 'growing' },
  red:    { color: '#d95294', label: 'near/over limit' },
}

/*  Returns { status, ratio, summary, source } for a file, or null if its type has
 *  no documented budget. `file` needs { type, content }. */
export function fileHealth(file) {
  if (!file) return null
  const b = BUDGETS[file.type]
  if (!b) return null

  const { body } = splitFrontmatter(file.content || '')
  const text = b.basis === 'body' ? body : (file.content || '')
  const lines = text ? text.split('\n').length : 0
  const tok = approxTokens(text.length)

  const ratios = []
  const parts = []
  if (b.lines)  { ratios.push(lines / b.lines); parts.push(`${lines}/${b.lines} lines`) }
  if (b.tokens) { ratios.push(tok / b.tokens);  parts.push(`≈${tok.toLocaleString()}/${b.tokens.toLocaleString()} tok`) }
  const ratio = ratios.length ? Math.max(...ratios) : null

  return { status: statusFor(ratio), ratio, summary: parts.join(' · '), source: b.source }
}
