# ai-dev-view

A local dashboard for your AI coding sessions. It reads the session logs that
**Kiro CLI**, **Claude Code**, and **Codex CLI** already keep on your machine and
turns them into something you can actually browse: sessions, tickets, tool
calls, models.

![App Demo](https://raw.githubusercontent.com/fbadanouy/ai-dev-view/master/ai-dev-view.gif)

## Quick start

```sh
python3 setup.py     # one-minute wizard: ticket prefix, providers
python3 server.py    # ingests your sessions on first boot
```

Open http://localhost:8765. That's it — Python 3.9+, no dependencies, no build step.

Re-ingest anytime with `python3 ingest.py`. Providers you don't use are simply
skipped.

## What you get

- **Projects** — every project you've worked in, with its sessions and the AI
  config (skills, agents, MCPs) defined inside it.
- **Sessions** — every session across providers, with per-provider metrics,
  conversation timeline, and a copy-paste resume command.
- **Tickets** — sessions grouped by the JIRA-style ticket they mention
  (the prefix you set in setup).
- **Skills** — which skills you actually invoke, with failure analytics.
- **Tool Calls** — which tools you actually use, with failure analytics.
- **Models** — usage broken down by the models that ran your sessions.
- **Agents** — the custom agents each provider has configured.
- **MCPs** — the MCP servers wired into each provider.
- **Kiro** — your Kiro steering and skill files, browsable.
- **Analytics** — aggregate trends across the above.

## Privacy

Everything stays on your machine. The app **reads** your provider data dirs
(`~/.kiro`, `~/.claude`, `~/.codex`) — it never writes to them — stores what it
finds in a local SQLite file next to the code, and serves it on localhost only.
Nothing is sent anywhere.

One design rule throughout: every value shown traces to a real field in a real
log file. Nothing is estimated, fuzzy-matched, or invented.

## License

[MIT](LICENSE)
