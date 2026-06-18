import { html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
import '../components/sessions/session-card-stats-kiro.js'
import '../components/sessions/session-card-stats-claude.js'
import '../components/sessions/session-card-stats-codex.js'

/*  Provider descriptor registry — the ONLY place in the UI that knows
 *  which providers exist and how they differ.
 *
 *  Adding a provider = add one entry here (plus an optional stats
 *  component if its metrics warrant one). No other component changes.
 *
 *  Descriptor shape:
 *    label      String                     short display name
 *    text       String                     accent text class (inline label)
 *    badge      String                     badge classes (detail header)
 *    color      String                     raw hex — for canvas/SVG (charts, dots)
 *    resumeCmd  (id) => String | null      CLI command to resume a session
 *    statsCard  (session, maxes) => html   per-provider card metrics
 */

export const PROVIDERS = {
  kiro: {
    label: 'kiro',
    text:  'text-provider-kiro',
    badge: 'bg-purple-950/50 text-purple-400 border border-purple-900',
    color: '#787cc9',
    resumeCmd: id => `kiro-cli --resume-id ${id}`,
    statsCard: (s, m) => html`<session-card-stats-kiro .session=${s} .maxes=${m}></session-card-stats-kiro>`,
  },

  claude: {
    label: 'claude',
    text:  'text-provider-claude',
    badge: 'bg-orange-950/50 text-orange-400 border border-orange-900',
    color: '#d26437',
    resumeCmd: id => `claude --resume ${id}`,
    statsCard: (s, m) => html`<session-card-stats-claude .session=${s} .maxes=${m}></session-card-stats-claude>`,
  },

  codex: {
    label: 'codex',
    text:  'text-provider-codex',
    badge: 'bg-zinc-900 text-zinc-400 border border-zinc-700',
    color: '#88a7b8',
    resumeCmd: id => `codex resume ${id}`,
    statsCard: (s, m) => html`<session-card-stats-codex .session=${s} .maxes=${m}></session-card-stats-codex>`,
  },
}

// Unknown providers render honestly as unknown — never masquerade as a known one.
const UNKNOWN = {
  label: '?',
  text:  'text-muted',
  badge: 'bg-surface2 text-muted border border-edge-strong',
  color: '#888888',
  resumeCmd: null,
  statsCard: () => html``,
}

export const provider = name => PROVIDERS[name] ?? UNKNOWN
