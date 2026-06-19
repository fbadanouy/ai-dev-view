# ai-dev-view

A local dashboard for your AI coding sessions. It reads the session logs that
**Kiro CLI**, **Claude Code**, and **Codex CLI** already keep on your machine and
turns them into something you can actually browse: sessions, tickets, tool
calls, models.

![App Demo](https://raw.githubusercontent.com/fbadanouy/ai-dev-view/master/ai-dev-view.gif)

## 🚀 Quick Start

**Prerequisites:** Python 3.9 or higher. Zero external dependencies. No build step required.

**1. Run the setup wizard**

Takes under 5 seconds to configure your Jira-style ticket prefixes and select your providers:

```sh
python3 setup.py
```

**2. Start the server**

Automatically ingests your session logs on the first boot:

```sh
python3 server.py
```

**3. View your dashboard**

Open your browser and navigate to: http://localhost:8765

> **Note:** To refresh data just refresh the page or hit the sync button on the UI (top right, next to theme selector) or run `python3 ingest.py` at any time.

## ✨ Features

- **💬 Sessions** — Browse every session across all your providers. Includes per-provider metrics, searchable chat histories, tool execution logs, and a one-click copy-paste resume command.
- **📁 Files** — A centralized view of all your AI-generated files, complete with a built-in Markdown viewer.
- **📂 Projects** — View every project repository you've touched. Pick a project to filter its specific sessions and drill down into full conversation details.
- **🏷️ Tickets** — Automatically groups your sessions by the JIRA-style ticket mentioned in the logs (based on the prefix defined during setup).
- **📈 Analytics** — Aggregate trends and usage statistics across all your AI coding activities.

## 🗺️ Roadmap (WIP)

We are actively working on surfacing even deeper analytics from your logs:

- **Skills** — Which provider skills you invoke, including failure analytics.
- **Tool Calls** — Track exactly which tools you use most, with failure rates.
- **Models** — Usage breakdowns by the underlying models running your sessions.
- **Agents** — Visibility into the custom agents configured by each provider.
- **MCPs** — Status and usage of the MCP servers wired into each provider.

## 🔒 Privacy First

Everything stays on your machine.

The application operates strictly on a read-only basis. It scans your provider data directories (`~/.kiro`, `~/.claude`, `~/.codex`), extracts the data, and stores it in a local SQLite file situated right next to the application code.

- **No telemetry.** Nothing is sent to the cloud.
- **No modifications.** Your provider logs are never written to or altered.
- **No hallucinations.** Every single value shown on the dashboard traces back to a real field in a real log file. Nothing is estimated, fuzzy-matched, or invented.

## License

[MIT](LICENSE)
