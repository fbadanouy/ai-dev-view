"""Session list, per-turn metrics, conversation messages, and tool calls."""
import json

from providers import claude, codex, kiro

from ..db import execute, query

PROVIDER_MODULES = {'kiro': kiro, 'claude': claude, 'codex': codex}


def get_sessions(provider=None):
    where = 'WHERE s.provider = ?' if provider else ''
    params = (provider,) if provider else ()
    rows = query(f'''
        SELECT
            s.id              AS session_id,
            s.title,
            s.ticket,
            s.cwd,
            s.agent,
            s.model,
            s.provider,
            s.git_branch,
            s.message_count   AS messages,
            s.tool_uses,
            s.request_count,
            ROUND(s.duration_secs / 60.0, 1) AS duration_mins,
            s.max_context_pct AS context_pct,
            s.cycles,
            s.compaction_count,
            s.tool_error_count,
            s.session_created_reason,
            s.created_at      AS created,
            s.updated_at      AS updated,
            sp.value          AS classification,
            GROUP_CONCAT(DISTINCT ss.skill)                      AS skills_csv,
            GROUP_CONCAT(tu.tool_name || ':' || tu.count, ',')   AS tool_counts_csv,
            wf.written_files_csv,
            tg.turns_csv,
            vt.input_tokens,
            vt.output_tokens,
            vt.cache_read_tokens,
            vt.cache_creation_tokens,
            vt.codex_input_tokens,
            vt.codex_cached_input_tokens,
            vt.codex_output_tokens,
            vt.codex_reasoning_output_tokens,
            vt.codex_total_tokens
        FROM sessions s
        LEFT JOIN session_props sp ON sp.session_id = s.id AND sp.key = 'classification'
        LEFT JOIN session_skills ss ON ss.session_id = s.id AND ss.signal = 'invoked'
        LEFT JOIN session_tool_uses tu ON tu.session_id = s.id
        LEFT JOIN (
            SELECT session_id,
                   GROUP_CONCAT(path || ':' || count, '|') AS written_files_csv
            FROM session_file_accesses
            WHERE op = 'write'
            GROUP BY session_id
        ) wf ON wf.session_id = s.id
        LEFT JOIN (
            SELECT session_id,
                   GROUP_CONCAT(COALESCE(number_of_cycles, '') || ':' ||
                                COALESCE(context_usage_percentage, '') || ':' ||
                                COALESCE(output_tokens, codex_output_tokens, ''), '|') AS turns_csv
            FROM (SELECT * FROM session_turns ORDER BY session_id, turn_number)
            GROUP BY session_id
        ) tg ON tg.session_id = s.id
        LEFT JOIN v_session_tokens vt ON vt.session_id = s.id
        {where}
        GROUP BY s.id
        ORDER BY s.updated_at DESC
    ''', params)
    for r in rows:
        csv = r.pop('skills_csv') or ''
        r['skills'] = [s for s in csv.split(',') if s]
        tc_csv = r.pop('tool_counts_csv') or ''
        tool_counts = {}
        for entry in tc_csv.split(','):
            if ':' in entry:
                name, _, cnt = entry.partition(':')
                try:
                    tool_counts[name.strip()] = int(cnt.strip())
                except ValueError:
                    pass
        r['tool_counts'] = tool_counts

        wf_csv = r.pop('written_files_csv') or ''
        written = []
        for entry in wf_csv.split('|'):
            if ':' in entry:
                path, _, cnt = entry.rpartition(':')
                try:
                    written.append({'path': path.strip(), 'count': int(cnt.strip())})
                except ValueError:
                    pass
        written.sort(key=lambda x: -x['count'])
        r['written_files'] = written

        tn_csv = r.pop('turns_csv') or ''
        turns = []
        for entry in tn_csv.split('|'):
            parts = entry.split(':')
            if len(parts) >= 2:
                cyc, ctx = parts[0], parts[1]
                out = parts[2] if len(parts) > 2 else ''
                turns.append({
                    'cycles': int(cyc) if cyc else None,
                    'context_pct': float(ctx) if ctx else None,
                    'out_tokens': int(out) if out else None,
                })
        r['turns'] = turns

    return rows



def get_session_tool_calls(session_id):
    """Per-tool-call outcomes for a session — from DB (populated by ingest)."""
    rows = query('''
        SELECT tool_use_id, turn_number, tool_name, purpose,
               command_preview, mcp_server, outcome, error_msg,
               result_status, result_bytes, result_preview, result_truncated, result_meta
        FROM session_tool_calls
        WHERE session_id = ?
        ORDER BY turn_number, rowid
    ''', (session_id,))
    for r in rows:
        r['result_meta'] = json.loads(r['result_meta']) if r['result_meta'] else None
    return rows


def get_session_messages(session_id):
    """The full conversation: user/assistant messages in stream order."""
    rows = query('''
        SELECT seq, turn_number, role, text, tool_use_ids
        FROM session_messages
        WHERE session_id = ?
        ORDER BY seq
    ''', (session_id,))
    for r in rows:
        r['tool_use_ids'] = json.loads(r['tool_use_ids']) if r['tool_use_ids'] else []
    return rows


def set_session_prop(body):
    """Upsert a user-authored session property (never touched by ingest)."""
    session_id, key, value = body.get('session_id'), body.get('key'), body.get('value')
    if not session_id or not key:
        return {'success': False, 'error': 'session_id and key required'}
    if value in (None, ''):
        execute('DELETE FROM session_props WHERE session_id = ? AND key = ?', (session_id, key))
    else:
        execute('INSERT OR REPLACE INTO session_props (session_id, key, value) VALUES (?, ?, ?)',
                (session_id, key, value))
    return {'success': True}


def get_session_tool_result(session_id, tool_use_id):
    """Full input + result for one tool call, read live from the session's
    provider data dir.

    The single sanctioned live read in the API — everything else is DB-only.
    Providers that don't implement get_full_tool_result return {}.
    """
    row = query('SELECT provider FROM sessions WHERE id = ?', (session_id,))
    if not row:
        return {}
    module = PROVIDER_MODULES.get(row[0]['provider'])
    fn = getattr(module, 'get_full_tool_result', None)
    return fn(session_id, tool_use_id) or {} if fn else {}


def get_session_turn_details(session_id):
    """Per-turn detail with tool breakdown — all from DB."""
    turn_meta = query('''
        SELECT turn_number, number_of_cycles, builtin_tool_uses, total_request_count,
               turn_duration_secs, context_usage_percentage, end_reason, end_timestamp,
               result_status, result_err_kind,
               model_id, is_sidechain, input_tokens, output_tokens,
               cache_read_tokens, cache_creation_tokens, cache_5m_tokens, cache_1h_tokens,
               codex_input_tokens, codex_cached_input_tokens, codex_output_tokens,
               codex_reasoning_output_tokens, codex_total_tokens, codex_model_context_window
        FROM session_turns
        WHERE session_id = ?
        ORDER BY turn_number
    ''', (session_id,))

    tools_by_turn = {}
    for r in query('''
        SELECT turn_number, tool_name
        FROM session_tool_calls
        WHERE session_id = ?
        ORDER BY rowid
    ''', (session_id,)):
        tools_by_turn.setdefault(r['turn_number'], []).append(r['tool_name'])

    details = []
    n = max(len(turn_meta), max(tools_by_turn, default=0))
    for i in range(n):
        t     = turn_meta[i] if i < len(turn_meta) else None
        tools = tools_by_turn.get(i + 1, [])

        duration_secs = (t['turn_duration_secs'] or 0) if t else 0
        cycles        = (t['number_of_cycles']   or 0) if t else 0
        requests      = (t['total_request_count'] or 0) if t else 0
        ctx_pct       = (t['context_usage_percentage'] or 0) if t else 0
        tool_count    = (t['builtin_tool_uses'] or len(tools)) if t else len(tools)

        summary_parts = []
        if tool_count > 5:   summary_parts.append(f'{tool_count} tool calls')
        if duration_secs > 60: summary_parts.append(f'{round(duration_secs/60,1)}m')
        if cycles > 10:      summary_parts.append(f'{cycles} cycles')
        if not summary_parts: summary_parts.append('normal')

        details.append({
            'turn':             i + 1,
            'duration':         duration_secs,
            'cycles':           cycles,
            'requests':         requests,
            'context_pct':      round(ctx_pct, 1),
            'tools':            tool_count if tool_count > 0 else None,
            'tool_breakdown':   tools,
            'summary':          ', '.join(summary_parts),
            'end_reason':       t['end_reason'] if t else None,
            'result_status':    t['result_status'] if t else None,
            'result_err_kind':  t['result_err_kind'] if t else None,
            'model_id':         t['model_id'] if t else None,
            'is_sidechain':     t['is_sidechain'] if t else None,
            'input_tokens':     t['input_tokens'] if t else None,
            'output_tokens':    t['output_tokens'] if t else None,
            'cache_read_tokens':     t['cache_read_tokens'] if t else None,
            'cache_creation_tokens': t['cache_creation_tokens'] if t else None,
            'cache_5m_tokens':  t['cache_5m_tokens'] if t else None,
            'cache_1h_tokens':  t['cache_1h_tokens'] if t else None,
            'codex_input_tokens':            t['codex_input_tokens'] if t else None,
            'codex_cached_input_tokens':     t['codex_cached_input_tokens'] if t else None,
            'codex_output_tokens':           t['codex_output_tokens'] if t else None,
            'codex_reasoning_output_tokens': t['codex_reasoning_output_tokens'] if t else None,
            'codex_total_tokens':            t['codex_total_tokens'] if t else None,
            'codex_model_context_window':    t['codex_model_context_window'] if t else None,
        })

    return details

