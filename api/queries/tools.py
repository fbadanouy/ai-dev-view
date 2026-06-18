"""Tools browser: aggregate stats, per-tool detail, and failure analytics."""
from collections import Counter

from ..db import query


def get_all_tools():
    """All unique tools with aggregate stats — for the tools browser."""
    # load known mcp prefixes from the mcps table
    known_prefixes = {
        row['tool_prefix']: row['server']
        for row in query('SELECT server, tool_prefix FROM mcps WHERE tool_prefix IS NOT NULL')
    }

    rows = query('''
        SELECT
            tc.tool_name,
            tc.mcp_server,
            COUNT(*)                                                      AS total_calls,
            COUNT(DISTINCT tc.session_id)                                 AS sessions_used,
            COUNT(CASE WHEN tc.outcome = 'error'    THEN 1 END)          AS errors,
            COUNT(CASE WHEN tc.outcome = 'rejected' THEN 1 END)          AS rejections,
            ROUND(100.0 * COUNT(CASE WHEN tc.outcome = 'error' THEN 1 END) / COUNT(*), 1) AS error_pct
        FROM session_tool_calls tc
        GROUP BY tc.tool_name, tc.mcp_server
        ORDER BY total_calls DESC
    ''')

    # collect all prefixes that appear on 2+ tools (inferred MCP groups)
    prefix_counts = Counter()
    for r in rows:
        if not r['mcp_server'] and '_' in r['tool_name']:
            prefix_counts[r['tool_name'].split('_')[0]] += 1
    inferred = {p for p, n in prefix_counts.items() if n >= 2}

    for r in rows:
        if r['mcp_server']:
            continue
        name = r['tool_name']
        # try known mcps table prefixes first
        for prefix, server in known_prefixes.items():
            if name.startswith(prefix):
                r['mcp_server'] = server
                break
        # fall back to inferred prefix groups
        if not r['mcp_server'] and '_' in name:
            prefix = name.split('_')[0]
            if prefix in inferred:
                r['mcp_server'] = prefix

    return rows


def get_tool_detail(tool_name):
    """Stats, sample purposes, sample previews, and recent sessions for one tool."""
    stats = query('''
        SELECT
            COUNT(*)                                                      AS total_calls,
            COUNT(DISTINCT session_id)                                    AS sessions_used,
            MAX(mcp_server)                                               AS mcp_server,
            COUNT(CASE WHEN outcome = 'error'    THEN 1 END)             AS errors,
            COUNT(CASE WHEN outcome = 'rejected' THEN 1 END)             AS rejections,
            ROUND(100.0 * COUNT(CASE WHEN outcome = 'error' THEN 1 END) / COUNT(*), 1) AS error_pct
        FROM session_tool_calls WHERE tool_name = ?
    ''', (tool_name,))[0]

    purposes = [r['purpose'] for r in query('''
        SELECT DISTINCT purpose FROM session_tool_calls
        WHERE tool_name = ? AND purpose IS NOT NULL AND purpose != ''
        LIMIT 10
    ''', (tool_name,))]

    previews = [r['command_preview'] for r in query('''
        SELECT DISTINCT command_preview FROM session_tool_calls
        WHERE tool_name = ? AND command_preview IS NOT NULL AND command_preview != ''
        LIMIT 8
    ''', (tool_name,))]

    sessions = query('''
        SELECT s.id AS session_id, s.title, s.ticket, s.updated_at, s.provider,
               COUNT(tc.tool_use_id) AS call_count,
               (SELECT json_group_array(v) FROM (
                   SELECT COALESCE(number_of_cycles, codex_output_tokens, output_tokens) AS v
                   FROM session_turns WHERE session_id = s.id ORDER BY turn_number
               )) AS spark
        FROM session_tool_calls tc
        JOIN sessions s ON s.id = tc.session_id
        WHERE tc.tool_name = ?
        GROUP BY s.id
        ORDER BY s.updated_at DESC
        LIMIT 10
    ''', (tool_name,))

    return {**stats, 'purposes': purposes, 'previews': previews, 'sessions': sessions}


def get_tool_failure_analytics():
    """Per-tool error and rejection rates."""
    return query('SELECT * FROM v_tool_failure_rate')


def get_tool_error_analytics():
    return query('''
        SELECT error_msg,
               SUM(count)               AS total,
               COUNT(DISTINCT session_id) AS sessions
        FROM session_tool_errors
        GROUP BY error_msg
        ORDER BY total DESC
    ''')
