# ai-dev-view

> **Local dashboard for AI coding sessions.** Reads the logs Kiro CLI, Claude Code, and Codex CLI already write on your machine. No signup, no cloud, no invented metrics.

Python 3.9+. Stdlib only. Clone and run.

```sh
python3 setup.py     # first run: ticket prefixes, which providers to enable
python3 server.py    # UI + API; ingests on first boot if no DB yet
```

Open http://localhost:8765

Re-ingest anytime with `python3 ingest.py` or **Sync** in the UI (`POST /api/ingest`).

---

## What it does

Your coding agents already log everything locally. ai-dev-view turns those logs into something you can actually browse: sessions across providers, ticket groupings, skill usage, tool-call stats, and per-model activity. When a session is worth continuing, copy the resume command and go.

Everything stays on your machine. The app **only reads** provider data dirs. It never writes to `~/.kiro`, `~/.claude`, or `~/.codex`.

| Tab | What you get |
|---|---|
| **Sessions** | Every session across providers — metrics, conversation timeline, resume command |
| **Tickets** | Sessions grouped by ticket ID (regex prefix from setup, e.g. `PAYS-1234`) |
| **Skills** | Skills invoked via `/skill-name`, with usage stats |
| **Tool Calls** | Built-in tool frequency, errors, failure rates |
| **Models** | Which models ran, session counts |
| **Agents** | Agent configs and session history |
| **MCPs** | MCP server tool usage |
| **Analytics** | Cross-provider activity charts (sessions, messages, tool calls, tokens where recorded) |
| **Kiro** | Kiro grimoire files (skills, agents, steering) — Kiro-only |

**Per-provider metrics** (no cross-provider apples-to-oranges):

| Provider | What the logs actually give you |
|---|---|
| **Kiro** | Cycles, context %, request count (no reliable token data in logs) |
| **Claude** | Input/output/cache tokens from `usage` fields |
| **Codex** | Input/output/reasoning tokens from `token_count` events |

Session detail includes turn mini-graphs, tool-call outcomes, file accesses, and a copy-paste resume command (`kiro-cli --resume-id`, `claude --resume`, `codex resume`).

You can label sessions **work** or **review** — stored in the local DB, survives re-ingest.

---

## Why only real data

Most session dashboards estimate costs, guess titles, or backfill fields the logs never had. ai-dev-view does not.

Every number in the UI traces to a real field in a provider log file, or to a label you set yourself. If the source does not have it, the UI shows nothing (`—`), not a plausible guess. Field-level rules live in [docs/DATA-CONTRACT.md](docs/DATA-CONTRACT.md).

That tradeoff is intentional: you get less hand-wavy analytics, but what you see is what actually happened.

---

## How it works

```
~/.kiro/  ~/.claude/  ~/.codex/
        ↓  providers/*.py  (read only)
        ↓  ingest.py
   ai-dev-view.db
        ↓  api/ + ui/
   http://localhost:8765
```

On first boot, `server.py` runs ingest if `ai-dev-view.db` does not exist yet.

`setup.py` writes `config.json` (ticket prefixes, provider paths, enabled flags). Safe to re-run.

**Stack:** Lit web components, SQLite, Python stdlib HTTP server. UI loads Lit, Tailwind, and Shoelace from CDN. No npm, no pip, no build step.

---

## Supported sources

| Provider | Reads from |
|---|---|
| **Kiro CLI** | `~/.kiro/` (configurable in `config.json`) |
| **Claude Code** | `~/.claude/` |
| **Codex CLI** | `~/.codex/` |

Writes only `config.json` and `ai-dev-view.db` next to the repo.

---

## Known limits

- **Codex `.zst` sessions** are skipped (compressed format; no decompression dependency).
- **Ticket matching** requires prefixes in `config.json` — without them, the Tickets tab stays empty.
- **Codex file reads** are not in the logs; only writes are tracked.
- **Claude / Codex context %** is not shown — the logs do not expose enough to compute it honestly.

---

## Privacy

Reads `~/.kiro`, `~/.claude`, `~/.codex`. Writes only `config.json` and `ai-dev-view.db` beside the code. Serves on localhost. No outbound network calls except CDN assets (Lit, Tailwind, Shoelace, fonts) loaded by the browser.

---

## For agents

If you are an AI agent working in this repo, start with [AGENTS.md](AGENTS.md).

---

## License

[MIT](LICENSE)
