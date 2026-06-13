"""MCP servers, their tools, and per-server sessions."""
from ..db import query


def get_mcps():
    servers   = query('SELECT server, tool_prefix, command FROM mcps ORDER BY server')
    analytics = query('SELECT * FROM v_mcp_analytics ORDER BY total_calls DESC')

    tools_by_server = {}
    for row in analytics:
        srv = row['mcp_server']
        if srv not in tools_by_server:
            tools_by_server[srv] = []
        tools_by_server[srv].append({
            'tool_name':     row['tool_name'],
            'sessions_used': row['sessions_used'],
            'total_calls':   row['total_calls'],
            'last_used':     row['last_used'],
        })

    return [{
        'server':      s['server'],
        'tool_prefix': s['tool_prefix'],
        'command':     s['command'],
        'tools':       tools_by_server.get(s['server'], []),
    } for s in servers]


def get_mcp_sessions(server):
    return query('''
        SELECT
            s.id        AS session_id,
            s.title,
            s.ticket,
            s.agent,
            s.updated_at,
            sm.tool_name,
            sm.count
        FROM session_mcps sm
        JOIN sessions s ON s.id = sm.session_id
        WHERE sm.mcp_server = ?
        ORDER BY s.updated_at DESC
    ''', (server,))

