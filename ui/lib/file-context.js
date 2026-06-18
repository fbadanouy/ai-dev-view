/*  file-context.js — per-type config for the <context-load> panel.
 *
 *  One entry per file `type`. It describes, for that type:
 *    • label / blurb  — what the file IS, in one line ("explain as it shows")
 *    • tiers          — what loads into context and WHEN, in load order
 *    • docs / note    — the recommendation shown at the bottom
 *
 *  Tiers carry only static copy (label + when + which slice to measure). The
 *  <context-load> component computes real sizes from the file itself — never
 *  estimated. A `meta` tier auto-hides when a file has no frontmatter, so the
 *  same config renders cleanly whether or not a `---` header is present.
 *
 *  Honest-by-construction: `budget: true` tiers get a real status only for types
 *  with a DOCUMENTED budget (see BUDGETS in file-health.js). A `docs.url` links to
 *  the official spec for that type; an empty url hides the link (no dead anchor).
 *
 *  measure: 'meta'      → frontmatter block
 *           'body'      → everything after frontmatter
 *           'file'      → the whole file
 *           'resources' → sibling resource files (skills only)
 */

export const TYPE_CONTEXT = {
  skill: {
    label: 'Skill',
    blurb: 'A reusable capability the agent invokes on demand. Loaded progressively — metadata up front, the rest only as a task needs it.',
    tiers: [
      { measure: 'meta',      label: 'Metadata',     when: 'loaded at startup for every skill',  color: '#2aa198' },
      { measure: 'body',      label: 'Instructions', when: 'loaded when the skill is activated',  color: '#b58900', budget: true },
      { measure: 'resources', label: 'Resources',    when: 'loaded only as a task requires them', color: '#787cc9' },
    ],
    docs: { label: 'Skills documentation', url: 'https://agentskills.io/specification#progressive-disclosure' },
    note: '', // e.g. 'Keep SKILL.md under 500 lines (~5,000 tokens).'
  },

  agent: {
    label: 'Agent',
    blurb: 'A subagent with its own model, tools, and system prompt. Runs in its own context window when spawned.',
    tiers: [
      { measure: 'meta', label: 'Metadata',      when: 'frontmatter (name, model, tools…)',     color: '#2aa198' },
      { measure: 'body', label: 'System prompt', when: 'loaded when the subagent is spawned',    color: '#b58900' },
    ],
    docs: { label: 'Subagents documentation', url: 'https://code.claude.com/docs/en/sub-agents' },
    note: 'Subagents have no documented size budget — each runs in its own 200k-token context.',
  },

  steering: {
    label: 'Steering',
    blurb: 'A document that shapes how the agent behaves in this project — conventions, guardrails, and context.',
    tiers: [
      { measure: 'meta', label: 'Metadata', when: 'frontmatter (inclusion rules…)', color: '#2aa198' },
      { measure: 'body', label: 'Guidance', when: 'steering context for the agent',  color: '#b58900' },
    ],
    docs: { label: 'Steering documentation', url: 'https://kiro.dev/docs/steering/' },
    note: '',
  },

  instructions: {
    label: 'Instructions',
    blurb: 'Project memory (CLAUDE.md / AGENTS.md) loaded into every session.',
    tiers: [
      { measure: 'file', label: 'Instructions', when: 'loaded into every session', color: '#b58900', budget: true },
    ],
    docs: { label: 'Memory & instructions documentation', url: 'https://code.claude.com/docs/en/memory' },
    note: '',
  },

  root: {
    label: 'Root config',
    blurb: 'A top-level configuration file applied across the workspace.',
    tiers: [
      { measure: 'file', label: 'Configuration', when: 'loaded across the workspace', color: '#b58900', budget: true },
    ],
    docs: { label: 'AGENTS.md documentation', url: 'https://agents.md/#examples' },
    note: '',
  },

  command: {
    label: 'Command',
    blurb: 'A custom slash command — a saved prompt the user invokes by name.',
    tiers: [
      { measure: 'meta', label: 'Metadata', when: 'frontmatter (description…)',        color: '#2aa198' },
      { measure: 'body', label: 'Prompt',   when: 'loaded when the command is invoked', color: '#b58900' },
    ],
    docs: { label: 'Slash commands documentation', url: '' },
    note: '',
  },
}

/* Safe fallback so the panel always renders something honest for unknown types. */
export function typeContext(type) {
  return (
    TYPE_CONTEXT[type] || {
      label: type || 'File',
      blurb: '',
      tiers: [{ measure: 'file', label: 'Content', when: 'loaded into context', color: '#b58900' }],
      docs: null,
      note: '',
    }
  )
}
