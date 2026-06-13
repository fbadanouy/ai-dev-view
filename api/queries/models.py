"""Model list and per-model sessions."""
from ..db import query


def get_models():
    return query('''
        SELECT
            m.model_id,
            m.model_name,
            m.description,
            m.context_window_tokens,
            m.rate_multiplier,
            m.rate_unit,
            COALESCE(vm.total_sessions, 0)    AS total_sessions,
            COALESCE(vm.total_messages, 0)    AS total_messages,
            COALESCE(vm.total_tool_uses, 0)   AS total_tool_uses,
            COALESCE(vm.avg_duration_mins, 0) AS avg_duration_mins,
            COALESCE(vm.avg_context_pct, 0)   AS avg_context_pct,
            vm.last_used
        FROM models m
        LEFT JOIN v_model_analytics vm ON vm.model_id = m.model_id
        ORDER BY COALESCE(vm.total_sessions, 0) DESC
    ''')


def get_model_sessions(model_id):
    return query('''
        SELECT
            id              AS session_id,
            title,
            ticket,
            agent,
            updated_at,
            message_count   AS messages,
            tool_uses,
            max_context_pct AS context_pct
        FROM sessions
        WHERE model = ?
        ORDER BY updated_at DESC
        LIMIT 20
    ''', (model_id,))

