"""Projects: list with rollups, and per-project detail (sessions + AI config)."""
from urllib.parse import unquote
from ..db import query

# Time-bucket granularity, picked from the project's real span — never zero-fill.
_BUCKETS = {'day': '%Y-%m-%d', 'week': '%Y-W%W', 'month': '%Y-%m'}


def _project_timeseries(pid):
    """Per-provider session counts + total tool-use sum per time bucket, over the
    project's real span.

    Sessions are split by provider (stacked bars, matching the analytics hero
    chart); tool uses are summed across providers (one line). Bucket granularity
    adapts to the span (day ≤ 31d, week ≤ 180d, else month). Buckets are the real
    ones that have data; gaps are simply absent — nothing is zero-filled or faked.
    """
    span = query("SELECT julianday(MAX(created_at)) - julianday(MIN(created_at)) AS d "
                 "FROM sessions WHERE project_id = ? AND created_at != ''", (pid,))
    d = (span[0]['d'] if span else None) or 0
    bucket = 'day' if d <= 31 else 'week' if d <= 180 else 'month'
    fmt = _BUCKETS[bucket]
    rows = query(f"SELECT strftime('{fmt}', created_at) AS b, provider, COUNT(*) AS sessions, "
                 f"COALESCE(SUM(tool_uses), 0) AS tool_uses "
                 f"FROM sessions WHERE project_id = ? AND created_at != '' "
                 f"GROUP BY 1, 2 ORDER BY 1", (pid,))

    buckets = sorted({r['b'] for r in rows})
    idx = {b: i for i, b in enumerate(buckets)}
    providers = ('kiro', 'claude', 'codex')

    sessions = {p: [None] * len(buckets) for p in providers}
    tool_uses = [None] * len(buckets)
    for r in rows:
        i = idx[r['b']]
        if r['provider'] in sessions:
            sessions[r['provider']][i] = r['sessions']
        if r['tool_uses'] is not None:
            tool_uses[i] = (tool_uses[i] or 0) + r['tool_uses']

    return {
        'bucket':    bucket,
        'buckets':   buckets,
        'sessions':  sessions,     # {provider: [counts per bucket]}
        'tool_uses': tool_uses,    # summed across providers
    }


def get_projects():
    return query('''
        SELECT p.id, p.name, p.root_path, p.first_seen, p.last_seen,
               COUNT(s.id)                          AS session_count,
               COALESCE(SUM(s.duration_secs), 0)    AS total_duration_secs,
               COALESCE(SUM(s.tool_uses), 0)        AS total_tool_uses,
               GROUP_CONCAT(DISTINCT s.provider)    AS providers
        FROM projects p
        LEFT JOIN sessions s ON s.project_id = p.id
        GROUP BY p.id
        ORDER BY p.last_seen DESC NULLS LAST
    ''')


def get_project_detail(id):
    pid = unquote(id)
    return {
        'sessions': query('SELECT id AS session_id, title, provider, agent, model, ticket, '
                          'updated_at, duration_secs, tool_uses, message_count, '
                          '(SELECT json_group_array(v) FROM ('
                          '  SELECT COALESCE(number_of_cycles, codex_output_tokens, output_tokens) AS v '
                          '  FROM session_turns WHERE session_id = s.id ORDER BY turn_number'
                          ')) AS spark '
                          'FROM sessions s WHERE project_id = ? ORDER BY updated_at DESC', (pid,)),
        'skills':   query("SELECT name, description, path, provider FROM skills "
                          "WHERE scope='project' AND project_id = ? ORDER BY name", (pid,)),
        'agents':   query("SELECT name, model, description, provider FROM agents "
                          "WHERE scope='project' AND project_id = ? ORDER BY name", (pid,)),
        'mcps':     query("SELECT server, tool_prefix, command, provider FROM mcps "
                          "WHERE scope='project' AND project_id = ? ORDER BY server", (pid,)),
        'files':    query("SELECT path, name, type, group_name, provider FROM files "
                          "WHERE scope='project' AND project_id = ? ORDER BY provider, type, name", (pid,)),
        'models':   query('SELECT model AS model_id, COUNT(*) AS n FROM sessions '
                          'WHERE project_id = ? AND model IS NOT NULL GROUP BY model ORDER BY n DESC', (pid,)),
        'tickets':  query('SELECT DISTINCT ticket FROM sessions '
                          'WHERE project_id = ? AND ticket IS NOT NULL ORDER BY ticket', (pid,)),
        'timeseries': _project_timeseries(pid),
    }
