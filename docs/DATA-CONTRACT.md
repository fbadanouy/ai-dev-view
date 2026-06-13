# Data Contract

Defines which values are real (and where they come from), which are legitimately
derived, and which must never be invented. Authoritative implementation:
`providers/*.py` → `ingest.py` → `schema.sql` → `api/queries/*`.

> **Rule:** every value the UI shows must trace to a real field in a provider's
> data directory (`~/.kiro/`, `~/.claude/`, `~/.codex/`), or to explicit user
> input stored in `session_props`. If the source doesn't have it, show `null` /
> `0` / "—". Never estimate, default, fuzzy-match, or stamp `datetime.now()` onto
> historical data.

---

## Pipeline

```
provider data dirs          ingest.py              ai-dev-view.db         API / UI
─────────────────    ──────────────────────    ─────────────────    ─────────────
~/.kiro/      ──┐
~/.claude/    ──┼──► providers/*.py read_*  ──► INSERT only real   ──► read DB only
~/.codex/     ──┘    emit neutral dicts         fields from §1–3       (no re-parse)
```

`server.py` serves the UI and API; it does not parse session logs. Re-ingest with
`python3 ingest.py` or `POST /api/ingest`.

---

## 1. Kiro (`~/.kiro/`)

Adapter: `providers/kiro.py`. Config path: `config.provider_path('kiro')`.

### Session files

Each session is two files under `sessions/cli/`:

- `<id>.json` — metadata (`session_id`, `cwd`, `created_at`, `updated_at`, `title`,
  `session_created_reason`, `session_state`)
- `<id>.jsonl` — message stream (newline-delimited JSON, `kind` per line)

### Real per-turn fields

From `session_state.conversation_metadata.user_turn_metadatas[]`:

| Field | Real? | Notes |
|---|---|---|
| `total_request_count` | ✅ | model requests in the turn |
| `number_of_cycles` | ✅ | agent loop cycles — reliable per-turn scalar for mini-graphs |
| `builtin_tool_uses` | ✅ | count of tool calls |
| `turn_duration.secs` | ✅ | wall-clock seconds |
| `context_usage_percentage` | ✅ | e.g. `12.28` |
| `end_reason`, `end_timestamp` | ✅ | |
| `result.Ok` / `result.Err` | ✅ | mapped to `result_status` / `result_err_kind` |
| `message_ids` | ✅ | links JSONL messages to turn numbers |
| `loop_id.agent_id.name` | ❌ | always `kiro_default` — do not use |
| `input_token_count` | ⚠️ | usually 0 — not ingested for Kiro |
| `output_token_count` | ⚠️ | usually 0 — not ingested for Kiro |
| `metering_usage` | ⚠️ | usually `[]` — no reliable token/cost source |

### Real stream fields (`<id>.jsonl`)

| `kind` | Use |
|---|---|
| `Prompt` | user turn; `data.content[]` text items → message text, skill/ticket extraction |
| `AssistantMessage` | `data.content[]` `toolUse` items → tool names, `toolUseId`, inputs |
| `ToolResults` | tool outputs, errors, file read/write paths |

**Message count** = `Prompt` lines. **Tool breakdown** = `toolUse` names grouped by
turn. Both computed in `kiro.py` at ingest time.

### Kiro-only derived values

| Value | Source |
|---|---|
| **Agent** | `session_state.agent_name`; falls back to `kiro_default` if absent |
| **Model** | `session_state.rts_model_state.model_info`; `NULL` when `model_id` is `"auto"` |
| **Primary ticket** | first match in title; else `NULL` (prompt mentions stored separately) |
| **Ticket mentions** | regex on title + prompt text (`config.ticket_re()`) |
| **Rejected tool calls** | last `toolUse` of a turn where `end_reason == 'ToolUseRejected'` |
| **File accesses** | `FileRead` / `FileWrite` paths from `ToolResults` |
| **Compaction count** | compaction events in the JSONL stream |

Kiro `session_turns` token columns (`input_tokens`, `codex_*`, etc.) are always
`NULL`.

---

## 2. Claude Code (`~/.claude/`)

Adapter: `providers/claude.py`. Config path: `config.provider_path('claude')`.

### Session files

`projects/<project-slug>/<session-uuid>.jsonl` — one file per session. Subagent
sidechains under `<session-uuid>/subagents/*.jsonl` are merged with
`isSidechain` set.

### Derivation rules

| Rule | Detail |
|---|---|
| **Streaming dedupe — keep last** | Assistant records repeat with cumulative usage. LAST occurrence per `message.id` wins. Summing without dedupe double-counts tokens. |
| **Turn segmentation** | A `user` record with real text content (not `isMeta`, not `isSidechain`, not tool-result-only) opens a new turn. |
| **Duration** | `turn_duration_secs` = last timestamp minus first in the turn, whole seconds. |
| **Context %** | Always `NULL`. Computing a percentage would require assuming a window size. |
| **Tokens** | Summed verbatim from deduped assistant `usage` fields: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`. `NULL` when absent. |
| **No cost columns** | Costs are out of scope (see §5). |
| **Agent** | Literal `'claude-code'` |
| **Title** | Last `ai-title` record's `aiTitle` |
| **cwd** | Most common `cwd` across records |
| **git_branch** | Most recent non-empty `gitBranch` |
| **Primary model** | Most-used `model_id` across turns; lexicographic tie-break |
| **Compaction** | `system` records with `subtype` in `('compaction', 'compact')` |
| **Ticket regex on prompts** | Harness-injected blocks (`<system-reminder>`, `!` output, etc.) stripped before matching |

Claude `session_turns` columns `number_of_cycles`, `context_usage_percentage`, and
all `codex_*` columns are `NULL`. Session `max_context_pct` is `0`.

---

## 3. Codex CLI (`~/.codex/`)

Adapter: `providers/codex.py`. Config path: `config.provider_path('codex')`.

### Session files

`sessions/**/*.jsonl` and `archived_sessions/**/*.jsonl` (active dir wins on
duplicate relative paths). `.jsonl.zst` compressed sessions are **skipped** (no
decompression dependency).

### Derivation rules

| Rule | Detail |
|---|---|
| **Turn segmentation** | `event_msg` with `task_started` / `task_complete` / `turn_aborted` by `turn_id`. Legacy files without task events fall back to `user_message` records. |
| **Duration** | First-to-last timestamp in the turn, whole seconds. |
| **Context %** | Always `NULL`. `codex_model_context_window` stores the literal `info.model_context_window` (or `task_started.model_context_window` fallback) — not converted to a percentage. |
| **Tokens — preferred** | Per turn, sum `last_token_usage` deltas across `token_count` events. |
| **Tokens — fallback** | When `last_token_usage` is absent, diff consecutive `total_token_usage` values, clamped ≥ 0. |
| **Tokens — replay guard** | Subagent files may replay parent `token_count` events at file start (`thread_spawn`). Events in that burst seed diff baselines but are not summed. |
| **Never sum `total_token_usage` directly** | It is cumulative; summing it is a measurement error. |
| **No usable token records** | All `codex_*` columns stay `NULL` for that turn/session. |
| **Agent** | Literal `'codex-cli'` |
| **Title** | First line of first `user_message`, max 80 chars |
| **cwd / git_branch** | From `session_meta` payload |
| **Primary model** | Most-used per-turn `model_id`; lexicographic tie-break |
| **File accesses** | Writes only, from `patch_apply_end.changes`. Reads are not derivable from Codex logs. |
| **Ticket mentions** | Title + user messages + `git_branch` (branch matches stored under `prompt` source) |
| **Compaction** | Records with `type == 'compacted'` |

Codex `session_turns` Claude token columns (`input_tokens`, `cache_*`) and
`number_of_cycles` are `NULL`. Session `max_context_pct` is `0`.

---

## 4. Cross-provider rules

These apply to all enabled providers during ingest.

### Skills

- Detected **only** by explicit `/skill-name` tokens in user message text
  (`/[a-z][a-z0-9-]+/`).
- Intersected with skills that actually exist under the provider's skills dir
  (`~/.kiro/skills/`, `~/.claude/skills/`, `~/.codex/skills/`).
- Stored in `session_skills` with `signal = 'invoked'`.
- **Never** match by title, keyword, or fuzzy name similarity.

### Tickets

- Regex from `config.json` → `config.ticket_re()` (e.g. `PAYS-\d+`).
- `sessions.ticket` = first match in title only; `NULL` if none.
- All mentions (title + prompts, and git branch for Codex) in `session_tickets`
  with literal counts per source.

### Tool calls

- MCP tools identified by prefix from each provider's MCP config
  (`~/.kiro/settings/mcp.json`, `~/.claude.json`, `~/.codex/config.toml`).
- `session_tool_calls` stores literal `purpose`, truncated `command_preview`
  (300 chars), measured `result_bytes`, truncated `result_preview` (700 chars).
- Outcomes: `success` | `error` | `rejected` | `unknown` — from real result data,
  not inferred.

### Resume commands (UI only)

Not stored in the DB. Derived in `ui/lib/providers.js`:

| Provider | Command |
|---|---|
| kiro | `kiro-cli --resume-id <id>` |
| claude | `claude --resume <id>` |
| codex | `codex resume <id>` |

### User-authored data

`session_props` is written by the API, **never** by ingest. Survives re-ingest.

| Key | Values | Purpose |
|---|---|---|
| `classification` | `work` \| `review` | user-assigned session label |

---

## 5. Forbidden — never produce these

- **Token/cost estimates.** No `tokens * 0.00002`, no "100 tokens per tool use", no
  flat cost multipliers. Absent token data → show nothing.
- **Fuzzy/keyword skill detection.** Skills require explicit `/skill-name` invocation.
- **Made-up confidence scores.** No real confidence signal exists in the sources.
- **`datetime.now()` on historical events.** Use source timestamps or `NULL`.
- **Estimated complexity / category** from file length, path substrings, or heuristics.
- **Hardcoded recommendations** not computed from ingested data.
- **Assumed context window sizes** to fabricate context percentages (Claude, Codex).
- **Re-parsing provider logs in the API/UI.** Read `ai-dev-view.db` only.

---

## 6. Checklist before adding a displayed value

1. Which exact provider file + field (or `session_props` key) does this come from?
2. What happens when that field is missing? (Must be: `null` / `0` / "—".)
3. Am I matching skills by anything other than explicit `/skill-name`? (Stop.)
4. Am I writing a token count, cost, confidence, or timestamp I can't source? (Stop.)
5. Am I parsing `~/.kiro|claude|codex/` outside `providers/*.py`? (Stop.)

If you can't answer #1 with a concrete field name, the value should not exist.
