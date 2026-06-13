# AGENTS.md — ai-dev-view

> Entry point for any AI agent working in this repo. This file follows the
> [agents.md](https://agents.md) convention.

## What this project is

ai-dev-view is a **local dashboard for AI coding-assistant usage**. It reads the
session logs of supported providers (Kiro CLI, Claude Code, Codex CLI), ingests them
into a local SQLite database, and lets a developer inspect their sessions, skills,
tool calls, and tickets with real usage metrics.

It only ever *reads* the providers' data directories (`~/.kiro/`, `~/.claude/`,
`~/.codex/`), never writes to them. Nothing leaves the machine.

## The cardinal rule: only real data

**Never invent, estimate, fuzzy-match, or backfill data.** Every number, label, and
relationship shown in the UI must trace back to a real field in a real file under a
provider's data directory. If a value is not present in the source, the correct
behavior is to show nothing (null / "—"), not a plausible guess.

Before you write code that produces a metric, you must be able to point to the exact
source field it comes from. See **[docs/DATA-CONTRACT.md](docs/DATA-CONTRACT.md)** for
the authoritative list of what is real, what is derived, and what must never be faked.

## Layout

- `setup.py` — interactive first-run wizard; writes `config.json` (ticket prefixes,
  provider data dirs, enabled providers). Safe to re-run.
- `config.py` — the only module that reads `config.json`; everything user-specific
  goes through it (never hardcode ticket prefixes or provider paths).
- `server.py` — entry point: `python3 server.py [port]` serves UI + API on **:8765**.
- `api/` — `app.py` (HTTP + route table, serves `ui/`), `db.py` (DB access),
  `queries/` (SQL grouped by entity). Reads solely from `ai-dev-view.db`.
- `ingest.py` — single ingestion pipeline: provider data dirs → `ai-dev-view.db`.
  Idempotent; run to refresh data.
- `providers/` — one reader module per provider (`kiro.py`, `claude.py`, `codex.py`);
  each emits provider-neutral records.
- `schema.sql` — single source of truth for DB structure (dimensional schema).
- `ui/` — the frontend: Lit web components, no build step (Lit/Tailwind/Shoelace via
  CDN), served by `server.py`.
- `ai-dev-view.db` — generated SQLite store; never committed.

## Running it

```sh
python3 setup.py           # first time only — writes config.json
python3 server.py          # first boot runs ingest automatically
open http://localhost:8765
```

Re-ingest anytime with `python3 ingest.py` or `POST /api/ingest`.
