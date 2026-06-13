"""Agent list (with declared tools/resources) and per-agent sessions."""
from ..db import query


def get_agents():
    rows = query('''
        SELECT
            a.name,
            a.model,
            a.description,
            COALESCE(va.total_sessions, 0)   AS total_sessions,
            COALESCE(va.avg_messages, 0)     AS avg_messages,
            COALESCE(va.total_tool_uses, 0)  AS total_tool_uses,
            COALESCE(va.avg_context_pct, 0)  AS avg_context_pct,
            va.last_used
        FROM agents a
        LEFT JOIN v_agent_analytics va ON va.agent = a.name
        ORDER BY COALESCE(va.total_sessions, 0) DESC
    ''')

    decl_rows = query('SELECT agent, kind, ref FROM agent_declares ORDER BY agent, kind, ref')

    decl_map = {}
    for d in decl_rows:
        agent, kind, ref = d['agent'], d['kind'], d['ref']
        if agent not in decl_map:
            decl_map[agent] = {'tool': [], 'resource': [], 'mcp': [], 'skill': []}
        decl_map[agent][kind].append(ref)

    for r in rows:
        decls          = decl_map.get(r['name'], {})
        r['tools']     = decls.get('tool', [])
        r['resources'] = decls.get('resource', [])

    return rows


def get_agent_sessions(name):
    return query('''
        SELECT
            id              AS session_id,
            title,
            ticket,
            updated_at,
            message_count   AS messages,
            tool_uses,
            max_context_pct AS context_pct
        FROM sessions
        WHERE agent = ?
        ORDER BY updated_at DESC
        LIMIT 20
    ''', (name,))

