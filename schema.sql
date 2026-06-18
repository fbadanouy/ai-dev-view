-- schema.sql — ai-dev-view dimensional schema
-- Single source of truth for DB structure.
-- Apply with: python3 ingest.py  (or via sqlite3 for inspection)

-- ── Dimensions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,   -- '~'-abbreviated root path; '' = (no project)
    name        TEXT NOT NULL,      -- basename(root) or '(no project)'
    root_path   TEXT,               -- == id for real projects; NULL for ''
    first_seen  TEXT,               -- min(session.created_at)
    last_seen   TEXT                -- max(session.updated_at)
);

CREATE TABLE IF NOT EXISTS agents (
    name          TEXT NOT NULL,
    model         TEXT,
    tools         TEXT,           -- JSON array from config
    allowed_tools TEXT,           -- JSON array from config
    resources     TEXT,           -- JSON array from config
    hooks         TEXT,           -- JSON object from config
    description   TEXT,
    prompt_path   TEXT,
    provider      TEXT NOT NULL,
    scope         TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'plugin' | 'project'
    project_id    TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (provider, scope, project_id, name)
);

CREATE TABLE IF NOT EXISTS skills (
    name        TEXT NOT NULL,
    description TEXT,              -- from SKILL.md frontmatter
    path        TEXT NOT NULL,
    created_at  TEXT,              -- file birth time (ISO 8601)
    provider    TEXT NOT NULL,
    scope       TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'plugin' | 'project'
    project_id  TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (provider, scope, project_id, name)
);

CREATE TABLE IF NOT EXISTS models (
    model_id              TEXT PRIMARY KEY,
    model_name            TEXT,      -- display name (may differ from model_id)
    description           TEXT,
    context_window_tokens INTEGER,
    rate_multiplier       REAL,
    rate_unit             TEXT
);

CREATE TABLE IF NOT EXISTS mcps (
    server      TEXT NOT NULL,
    tool_prefix TEXT,              -- prefix used in tool call names (e.g. "codegraph_")
    command     TEXT,
    provider    TEXT NOT NULL,
    scope       TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'project'
    project_id  TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (provider, scope, project_id, server)
);

CREATE TABLE IF NOT EXISTS tickets (
    key         TEXT PRIMARY KEY   -- e.g. "PAYS-1234"
);

CREATE TABLE IF NOT EXISTS files (
    id          INTEGER PRIMARY KEY,
    path        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,     -- skill, agent, steering, root, instructions, command
    group_name  TEXT,
    provider    TEXT NOT NULL DEFAULT '',  -- kiro|claude|codex|shared (AGENTS.md)
    scope       TEXT NOT NULL DEFAULT 'user',
    project_id  TEXT NOT NULL DEFAULT ''
);

-- ── Facts ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
    id                      TEXT PRIMARY KEY,
    title                   TEXT,
    cwd                     TEXT,
    agent                   TEXT REFERENCES agents(name),
    model                   TEXT REFERENCES models(model_id),
    ticket                  TEXT REFERENCES tickets(key),
    created_at              TEXT,
    updated_at              TEXT,
    message_count           INTEGER DEFAULT 0,
    tool_uses               INTEGER DEFAULT 0,  -- real builtin_tool_uses aggregate
    request_count           INTEGER DEFAULT 0,
    duration_secs           INTEGER DEFAULT 0,
    max_context_pct         REAL    DEFAULT 0,
    cycles                  INTEGER DEFAULT 0,
    compaction_count        INTEGER DEFAULT 0,
    tool_error_count        INTEGER DEFAULT 0,  -- count of Error results in ToolResults
    session_created_reason  TEXT,               -- 'subagent', 'new_session', etc. from root field
    provider                TEXT NOT NULL,
    git_branch              TEXT,
    project_id              TEXT REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS session_turns (
    id                       INTEGER PRIMARY KEY,
    session_id               TEXT    NOT NULL REFERENCES sessions(id),
    turn_number              INTEGER NOT NULL,
    number_of_cycles         INTEGER,
    builtin_tool_uses        INTEGER,
    total_request_count      INTEGER,
    turn_duration_secs       INTEGER,
    context_usage_percentage REAL,
    end_reason               TEXT,
    end_timestamp            TEXT,
    result_status            TEXT,   -- 'ok' | 'err' — from result.Ok / result.Err key presence
    result_err_kind          TEXT,   -- e.g. 'interrupted', from result.Err.Stream.kind.kind
    model_id                 TEXT,
    is_sidechain             INTEGER,
    input_tokens             INTEGER,
    output_tokens            INTEGER,
    cache_read_tokens        INTEGER,
    cache_creation_tokens    INTEGER,
    cache_5m_tokens                INTEGER,  -- ephemeral_5m_input_tokens sum; NULL if field absent
    cache_1h_tokens                INTEGER,
    codex_input_tokens             INTEGER,  -- sums of last_token_usage fields; NULL for kiro/claude
    codex_cached_input_tokens      INTEGER,
    codex_output_tokens            INTEGER,
    codex_reasoning_output_tokens  INTEGER,
    codex_total_tokens             INTEGER,  -- literal total_tokens field summed, not recomputed
    codex_model_context_window     INTEGER,  -- literal info.model_context_window, stored verbatim per turn
    UNIQUE(session_id, turn_number)
);

-- ── Bridges ─────────────────────────────────────────────────────

-- Skills used in a session, detected from real tool activity: a SKILL.md
-- load (file read / shell read / Skill tool), an explicit /skill-name token,
-- or a <command-name> harness block. Aggregate per (session, skill).
CREATE TABLE IF NOT EXISTS session_skills (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    skill      TEXT NOT NULL REFERENCES skills(name),
    signal     TEXT NOT NULL DEFAULT 'invoked',
    count      INTEGER DEFAULT 1,
    PRIMARY KEY (session_id, skill, signal)
);

-- Turn anchor for skill use: which turn(s) each skill was detected in. Lets the
-- UI attribute REAL per-turn activity (tools driven, duration) to a skill without
-- estimating — the unit of attribution is the invoking turn, never the skill alone.
CREATE TABLE IF NOT EXISTS session_skill_turns (
    session_id  TEXT NOT NULL REFERENCES sessions(id),
    skill       TEXT NOT NULL REFERENCES skills(name),
    turn_number INTEGER NOT NULL,
    count       INTEGER DEFAULT 1,   -- detections of this skill within the turn
    PRIMARY KEY (session_id, skill, turn_number)
);

-- MCP tool calls mapped to their server via mcp.json prefix matching
CREATE TABLE IF NOT EXISTS session_mcps (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    mcp_server TEXT NOT NULL,
    tool_name  TEXT NOT NULL,
    count      INTEGER DEFAULT 1,
    PRIMARY KEY (session_id, mcp_server, tool_name)
);

-- Built-in tool call counts per session (from AssistantMessage toolUse, non-MCP)
CREATE TABLE IF NOT EXISTS session_tool_uses (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    tool_name  TEXT NOT NULL,
    count      INTEGER DEFAULT 1,
    PRIMARY KEY (session_id, tool_name)
);

-- Files actually read/written in a session (from ToolResults FileRead/FileWrite)
CREATE TABLE IF NOT EXISTS session_file_accesses (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    path       TEXT NOT NULL,
    op         TEXT NOT NULL CHECK(op IN ('read','write')),
    count      INTEGER DEFAULT 1,
    PRIMARY KEY (session_id, path, op)
);

-- Tool errors from ToolResults (result.Error.Custom) — raw messages, no inference
CREATE TABLE IF NOT EXISTS session_tool_errors (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    error_msg  TEXT NOT NULL,
    count      INTEGER DEFAULT 1,
    PRIMARY KEY (session_id, error_msg)
);

-- Per-tool-call outcome: links AssistantMessage toolUse → ToolResults via toolUseId.
-- toolUseId is only unique WITHIN a session (forked sessions copy their parent's
-- history), so the key is composite.
CREATE TABLE IF NOT EXISTS session_tool_calls (
    tool_use_id      TEXT NOT NULL,
    session_id       TEXT NOT NULL REFERENCES sessions(id),
    turn_number      INTEGER,
    tool_name        TEXT NOT NULL,
    purpose          TEXT,    -- __tool_use_purpose from input (literal, never reworded)
    command_preview  TEXT,    -- input.command truncated to 300 chars
    mcp_server       TEXT,    -- null if builtin
    outcome          TEXT,    -- 'success' | 'error' | 'rejected' | 'unknown'
    error_msg        TEXT,    -- raw Error message if outcome='error'
    result_status    TEXT,    -- literal status field from the toolResult ('success' | 'error')
    result_bytes     INTEGER, -- measured size of the full result payload (real measurement)
    result_preview   TEXT,    -- head of the real payload, truncated (see result_truncated)
    result_truncated INTEGER, -- 1 if result_preview is a truncated prefix of the payload
    result_meta      TEXT,    -- JSON of per-tool literal fields (shell exit_status, grep numMatches, ...)
    PRIMARY KEY (session_id, tool_use_id)
);

-- The conversation itself: user prompts + assistant messages, in stream order.
-- turn_number comes from the session JSON's message_ids mapping (real linkage).
-- tool_use_ids joins an assistant message to session_tool_calls.
CREATE TABLE IF NOT EXISTS session_messages (
    session_id   TEXT    NOT NULL REFERENCES sessions(id),
    seq          INTEGER NOT NULL,  -- order within the session's message stream
    turn_number  INTEGER,
    role         TEXT    NOT NULL CHECK(role IN ('user','assistant')),
    text         TEXT,
    tool_use_ids TEXT,              -- JSON array of toolUseIds (assistant only)
    PRIMARY KEY (session_id, seq)
);

-- Every ticket mention per session (rebuilt by ingest; literal regex matches)
CREATE TABLE IF NOT EXISTS session_tickets (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    ticket     TEXT NOT NULL REFERENCES tickets(key),
    source     TEXT NOT NULL CHECK(source IN ('title','prompt')),
    count      INTEGER DEFAULT 1,
    PRIMARY KEY (session_id, ticket, source)
);

-- User-authored session properties (e.g. classification: work | review).
-- NEVER written or deleted by ingest — survives every rebuild.
CREATE TABLE IF NOT EXISTS session_props (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    key        TEXT NOT NULL,
    value      TEXT,
    PRIMARY KEY (session_id, key)
);

-- Legacy bridge — never written to; kept to avoid breaking schema migrations
CREATE TABLE IF NOT EXISTS session_files (
    session_id TEXT    NOT NULL REFERENCES sessions(id),
    file_id    INTEGER NOT NULL REFERENCES files(id),
    count      INTEGER DEFAULT 1,
    PRIMARY KEY (session_id, file_id)
);

-- What an agent is *configured* to have (tools, mcps, skills, resources)
CREATE TABLE IF NOT EXISTS agent_declares (
    agent TEXT NOT NULL REFERENCES agents(name),
    kind  TEXT NOT NULL,  -- tool | mcp | skill | resource
    ref   TEXT NOT NULL,
    PRIMARY KEY (agent, kind, ref)
);

-- ── Indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sessions_agent    ON sessions(agent);
CREATE INDEX IF NOT EXISTS idx_sessions_model    ON sessions(model);
CREATE INDEX IF NOT EXISTS idx_sessions_ticket   ON sessions(ticket);
CREATE INDEX IF NOT EXISTS idx_sessions_updated  ON sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_sessions_project  ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_session_turns_sid ON session_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_session_skills_sk ON session_skills(skill);
CREATE INDEX IF NOT EXISTS idx_sst_skill         ON session_skill_turns(skill);
CREATE INDEX IF NOT EXISTS idx_sst_session       ON session_skill_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_session_mcps_srv  ON session_mcps(mcp_server);
CREATE INDEX IF NOT EXISTS idx_session_tools_sid  ON session_tool_uses(session_id);
CREATE INDEX IF NOT EXISTS idx_session_tools_name ON session_tool_uses(tool_name);
CREATE INDEX IF NOT EXISTS idx_sfa_session   ON session_file_accesses(session_id);
CREATE INDEX IF NOT EXISTS idx_errors_session ON session_tool_errors(session_id);
CREATE INDEX IF NOT EXISTS idx_sfa_path    ON session_file_accesses(path);
CREATE INDEX IF NOT EXISTS idx_stc_session  ON session_tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_stc_tool     ON session_tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_stc_outcome  ON session_tool_calls(outcome);
CREATE INDEX IF NOT EXISTS idx_smsg_session ON session_messages(session_id, turn_number);

-- ── Analytics Views ──────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS v_skill_analytics AS
SELECT
    ss.skill                              AS skill_name,
    sk.description,
    COUNT(DISTINCT ss.session_id)         AS sessions_used,
    SUM(ss.count)                         AS total_uses,
    ROUND(AVG(ss.count), 2)               AS avg_per_session,
    MAX(s.updated_at)                     AS last_used
FROM session_skills ss
JOIN sessions s ON s.id = ss.session_id
LEFT JOIN (SELECT name, MAX(description) AS description FROM skills GROUP BY name) sk
       ON sk.name = ss.skill
GROUP BY ss.skill
ORDER BY sessions_used DESC;

CREATE VIEW IF NOT EXISTS v_agent_analytics AS
SELECT
    agent,
    COUNT(*)                              AS total_sessions,
    SUM(message_count)                    AS total_messages,
    ROUND(AVG(message_count), 1)          AS avg_messages,
    SUM(tool_uses)                        AS total_tool_uses,
    ROUND(AVG(max_context_pct), 1)        AS avg_context_pct,
    MAX(updated_at)                       AS last_used
FROM sessions
WHERE agent IS NOT NULL
GROUP BY agent
ORDER BY total_sessions DESC;

CREATE VIEW IF NOT EXISTS v_file_analytics AS
SELECT
    f.id,
    f.name,
    f.type,
    COUNT(DISTINCT sf.session_id)         AS sessions_count,
    COALESCE(SUM(sf.count), 0)            AS total_accesses,
    MAX(s.updated_at)                     AS last_accessed
FROM files f
LEFT JOIN session_files sf ON f.id = sf.file_id
LEFT JOIN sessions s ON s.id = sf.session_id
GROUP BY f.id
ORDER BY sessions_count DESC;

CREATE VIEW IF NOT EXISTS v_model_analytics AS
SELECT
    m.model_id,
    m.model_name,
    m.context_window_tokens,
    m.rate_multiplier,
    m.rate_unit,
    COUNT(s.id)                           AS total_sessions,
    SUM(s.message_count)                  AS total_messages,
    SUM(s.tool_uses)                      AS total_tool_uses,
    ROUND(AVG(s.duration_secs / 60.0), 1) AS avg_duration_mins,
    ROUND(AVG(s.max_context_pct), 1)      AS avg_context_pct,
    MAX(s.updated_at)                     AS last_used
FROM models m
LEFT JOIN sessions s ON s.model = m.model_id
GROUP BY m.model_id
ORDER BY total_sessions DESC;

CREATE VIEW IF NOT EXISTS v_file_access_analytics AS
SELECT
    path,
    SUM(CASE WHEN op='read'  THEN count ELSE 0 END) AS total_reads,
    SUM(CASE WHEN op='write' THEN count ELSE 0 END) AS total_writes,
    COUNT(DISTINCT CASE WHEN op='read'  THEN session_id END) AS read_sessions,
    COUNT(DISTINCT CASE WHEN op='write' THEN session_id END) AS write_sessions,
    MAX(s.updated_at) AS last_accessed
FROM session_file_accesses sfa
JOIN sessions s ON s.id = sfa.session_id
GROUP BY path
ORDER BY (read_sessions + write_sessions) DESC;

CREATE VIEW IF NOT EXISTS v_tool_analytics AS
SELECT
    tool_name,
    COUNT(DISTINCT session_id)             AS sessions_used,
    SUM(count)                             AS total_calls,
    ROUND(AVG(count), 1)                   AS avg_per_session
FROM session_tool_uses
GROUP BY tool_name
ORDER BY total_calls DESC;

CREATE VIEW IF NOT EXISTS v_mcp_analytics AS
SELECT
    sm.mcp_server,
    sm.tool_name,
    COUNT(DISTINCT sm.session_id)         AS sessions_used,
    SUM(sm.count)                         AS total_calls,
    MAX(s.updated_at)                     AS last_used
FROM session_mcps sm
JOIN sessions s ON s.id = sm.session_id
GROUP BY sm.mcp_server, sm.tool_name
ORDER BY total_calls DESC;

CREATE VIEW IF NOT EXISTS v_session_failures AS
SELECT
    s.id,
    s.title,
    s.session_created_reason,
    s.agent,
    COUNT(CASE WHEN tc.outcome = 'error'              THEN 1 END) AS tool_errors,
    COUNT(CASE WHEN tc.outcome = 'rejected'           THEN 1 END) AS tool_rejections,
    COUNT(CASE WHEN st.result_status = 'err'          THEN 1 END) AS failed_turns,
    COUNT(CASE WHEN st.end_reason = 'ToolUseRejected' THEN 1 END) AS rejected_turns,
    s.tool_error_count
FROM sessions s
LEFT JOIN session_tool_calls tc ON tc.session_id = s.id
LEFT JOIN session_turns st ON st.session_id = s.id
GROUP BY s.id;

CREATE VIEW IF NOT EXISTS v_tool_failure_rate AS
SELECT
    tool_name,
    COUNT(*)                                                          AS total_calls,
    COUNT(CASE WHEN outcome = 'error'    THEN 1 END)                 AS errors,
    COUNT(CASE WHEN outcome = 'rejected' THEN 1 END)                 AS rejections,
    ROUND(100.0 * COUNT(CASE WHEN outcome = 'error' THEN 1 END)
          / COUNT(*), 1)                                             AS error_pct
FROM session_tool_calls
GROUP BY tool_name
ORDER BY errors DESC;

CREATE VIEW IF NOT EXISTS v_session_tokens AS
SELECT
    session_id,
    SUM(input_tokens)                    AS input_tokens,
    SUM(output_tokens)                   AS output_tokens,
    SUM(cache_read_tokens)               AS cache_read_tokens,
    SUM(cache_creation_tokens)           AS cache_creation_tokens,
    SUM(cache_5m_tokens)                 AS cache_5m_tokens,
    SUM(cache_1h_tokens)                 AS cache_1h_tokens,
    SUM(codex_input_tokens)              AS codex_input_tokens,
    SUM(codex_cached_input_tokens)       AS codex_cached_input_tokens,
    SUM(codex_output_tokens)             AS codex_output_tokens,
    SUM(codex_reasoning_output_tokens)   AS codex_reasoning_output_tokens,
    SUM(codex_total_tokens)              AS codex_total_tokens
FROM session_turns
GROUP BY session_id;

CREATE VIEW IF NOT EXISTS v_skill_failure_signals AS
SELECT
    ss.skill,
    COUNT(DISTINCT ss.session_id)                                          AS sessions_used,
    SUM(CASE WHEN sf.tool_errors    > 0 THEN 1 ELSE 0 END)               AS sessions_with_errors,
    SUM(CASE WHEN sf.failed_turns   > 0 THEN 1 ELSE 0 END)               AS sessions_with_failed_turns,
    ROUND(100.0 * SUM(CASE WHEN sf.tool_errors > 0 THEN 1 ELSE 0 END)
          / COUNT(DISTINCT ss.session_id), 1)                             AS error_session_pct
FROM session_skills ss
JOIN v_session_failures sf ON sf.id = ss.session_id
GROUP BY ss.skill
ORDER BY error_session_pct DESC;
