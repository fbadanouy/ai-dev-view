# Data Contract — what is real, what is forbidden

This is the most important document in the repo. It defines exactly which values are
real (and where they come from), which are legitimately derived, and which have been
**fabricated** in the past and must never be produced again.

> **The rule:** every value the UI shows must trace to a real field in a real file under
> `~/.kiro/`, or be explicit user input (a favorite toggle, a manual rating). If the
> source doesn't have it, show `null` / `0` / "—". Never estimate, default, fuzzy-match,
> or stamp `datetime.now()` onto historical data.

---

## 1. Real session fields (the source of truth)

Each Kiro session is two files in `~/.kiro/sessions/cli/`:

### `<id>.json` — session metadata
Top-level keys: `session_id`, `cwd`, `created_at`, `updated_at`, `title`,
`session_created_reason`, `session_state`.

`session_state.conversation_metadata.user_turn_metadatas[]` is an array of per-turn
objects. **These are the real per-turn metrics:**

| Field | Real? | Notes |
|---|---|---|
| `total_request_count` | ✅ real | model requests in the turn |
| `number_of_cycles` | ✅ real | agent loop cycles — the only reliable per-turn scalar for mini-graphs |
| `builtin_tool_uses` | ✅ real | count of tool calls |
| `turn_duration.secs` | ✅ real | wall-clock seconds |
| `context_usage_percentage` | ✅ real | e.g. `12.28` — present and meaningful |
| `end_reason`, `end_timestamp` | ✅ real | |
| `loop_id.agent_id.name` | ❌ **always `kiro_default`** | do not use — always returns default regardless of actual agent |
| `input_token_count` | ⚠️ **usually 0** | frequently absent — DO NOT rely on or display unless > 0 |
| `output_token_count` | ⚠️ **usually 0** | same |
| `metering_usage` | ⚠️ **usually `[]`** | frequently empty — no reliable token/cost source |

### `<id>.jsonl` — message stream
Newline-delimited JSON. Each line has a `kind`:
- `Prompt` — a user turn. Its `data.content[]` text items hold the user's message.
- `AssistantMessage` — `data.content[]` may contain `toolUse` items with `data.name`.
- `ToolResults` — tool outputs.

**Message count** = number of `Prompt` lines. **Tool breakdown** = `toolUse` names grouped
by `Prompt` boundaries. Both are real and computed live in `server.py`.

---

## 2. Legitimately derived values

These are not stored in `~/.kiro/` but are honest deductions from real fields:

- **Agent** — `session_state.agent_name`. Falls back to `kiro_default` if absent (older
  sessions pre-date the field). **Never use** `loop_id.agent_id.name` — it always returns
  `kiro_default` regardless of which agent actually ran.
- **Ticket** — extracted by the configured ticket-prefix regex (e.g. `PAYS-\d+`, see
  `config.py`) from the session title, then from `Prompt`
  text if absent. (Real if found; `null` if not — never guess one.)
- **Skill usage** — detected **only** by explicit `/skill-name` tokens in `Prompt` text,
  intersected with the set of skills that actually exist in `~/.kiro/skills/`. This is
  the *only* sanctioned skill-detection method.
- **Aggregates** — sums/counts/durations over the real per-turn fields above.
- **`resume_cmd`** — `kiro chat --session <id>`, a deterministic string.

---

## 3. Forbidden — fabrication patterns

Never do any of these:

- ❌ **Token/cost estimates.** No `tokens * 0.00002`, no "100 tokens per tool use", no
  `0.002` cost. Token data is mostly absent (§1); absent means show nothing, not invent.
- ❌ **Fuzzy/keyword skill detection.** Matching a skill because its name (or a word from
  it) appears in a session *title* or anywhere in raw content. Skills are detected by
  explicit `/skill-name` invocation only.
- ❌ **Made-up confidence scores** (`0.9`, `0.8`, `0.6`, …). There is no real confidence
  signal in the source; don't manufacture one.
- ❌ **`datetime.now()` as a timestamp for historical events.** A skill used months ago
  did not happen "now." Use the real timestamp from the source or leave it null.
- ❌ **Estimated complexity / category** guessed from file length or path substrings.
- ❌ **Seeded/hardcoded "recommendations" or insights** that aren't computed from real data.

---

## 4. Known offenders — status: retired

The scripts that previously violated this contract have been moved to `_retired/` and
are no longer in the active pipeline. `ai-dev-view.db` has been rebuilt from scratch using
`ingest.py`, which writes only the real fields listed in §1–2 above.

The new ingestion pipeline is clean. If a future change re-introduces any of the
forbidden patterns in §3, that is a bug — revert it.

---

## 5. Claude provider derivation rules

`~/.claude/projects/<project-slug>/<session-uuid>.jsonl` is the source of truth for
Claude Code sessions. The following rules govern what is real and what must never be
estimated:

| Rule | Detail |
|---|---|
| **Streaming dedupe — keep last** | Assistant records repeat in the JSONL with cumulative usage. The LAST occurrence per `message.id` wins. Summing without this dedupe double-counts tokens and is a measurement error, not a display option. |
| **Turn segmentation** | A `user` record with real text content (not `isMeta`, not `isSidechain`, not tool-result-only) opens a new turn. Everything until the next such record belongs to that turn. |
| **Duration = timestamp arithmetic** | `turn_duration_secs` = last timestamp minus first timestamp in the turn, in whole seconds. No other inference. |
| **Context % intentionally NULL** | Claude Code does not expose context window size in the JSONL; computing a percentage would require assuming a window size, which is estimation. The field is always NULL for Claude sessions. |
| **Tokens are literal `usage` fields** | `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, and the nested `cache_creation.ephemeral_*` fields are summed verbatim from deduped assistant records. NULL if the field is absent. |
| **No cost columns, ever** | Costs are forbidden in this project (see §3). Claude token data is present and real; costs remain out of scope. |

---

## 6. Checklist before adding any displayed value

1. Which exact `~/.kiro/` field (or explicit user input) does this come from?
2. What happens when that field is missing? (Answer must be: show null/0/"—", not a guess.)
3. Am I matching skills by anything other than explicit `/skill-name`? (If yes, stop.)
4. Am I writing a token count, cost, confidence, or timestamp I can't source? (If yes, stop.)

If you can't answer #1 with a concrete field name, the value should not exist.
