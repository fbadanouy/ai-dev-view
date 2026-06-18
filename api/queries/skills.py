"""Skill list, per-skill sessions, and skill analytics."""
from ..db import query


def get_skills_list():
    """All configured skills, one row per (name, provider), with per-provider analytics."""
    return query('''
        WITH base AS (
            SELECT name, provider, MAX(description) AS description,
                   MAX(path) AS path, MAX(created_at) AS created_at
            FROM skills
            GROUP BY name, provider
        ),
        provider_uses AS (
            SELECT ss.skill, s.provider, ss.session_id, ss.count, s.updated_at
            FROM session_skills ss
            JOIN sessions s ON s.id = ss.session_id
        )
        SELECT
            b.name        AS skill_name,
            b.provider,
            b.description,
            b.path,
            b.created_at,
            COUNT(DISTINCT pu.session_id)                              AS sessions_used,
            COALESCE(SUM(pu.count), 0)                                 AS total_uses,
            CASE WHEN COUNT(DISTINCT pu.session_id) > 0
                 THEN ROUND(CAST(SUM(pu.count) AS REAL) /
                            COUNT(DISTINCT pu.session_id), 2)
                 ELSE NULL END                                         AS avg_per_session,
            MAX(pu.updated_at)                                         AS last_used
        FROM base b
        LEFT JOIN provider_uses pu ON pu.skill = b.name
                                  AND pu.provider = b.provider
        GROUP BY b.name, b.provider
        ORDER BY b.provider, sessions_used DESC
    ''')


def get_skill_sessions(provider, skill_name):
    """Sessions that invoked a given skill, scoped to the provider.

    `spark` is the per-turn activity series (the provider's canonical metric:
    Kiro cycles, Codex output tokens, Claude output tokens) for a sparkline.
    """
    return query('''
        SELECT s.id AS session_id, s.title, s.ticket, s.updated_at,
               s.provider, ss.count,
               (SELECT json_group_array(v) FROM (
                   SELECT COALESCE(number_of_cycles, codex_output_tokens, output_tokens) AS v
                   FROM session_turns WHERE session_id = s.id ORDER BY turn_number
               )) AS spark
        FROM session_skills ss
        JOIN sessions s ON s.id = ss.session_id
        WHERE ss.skill = ? AND s.provider = ? AND ss.signal = 'invoked'
        ORDER BY s.updated_at DESC
        LIMIT 20
    ''', (skill_name, provider))


def get_skill_profile(provider, skill_name):
    """Real per-turn work profile for a (provider, skill): the turns that invoked
    it, total duration of those turns, and the tools used in them.

    Attribution unit is the invoking TURN, never the skill alone — every number
    here is a plain aggregate over real per-turn / per-tool-call fields. Tools are
    "tools used in turns that invoked this skill", not "tools the skill called".
    """
    prof = query('''
        SELECT
            COUNT(DISTINCT st.session_id || ':' || st.turn_number) AS turns,
            SUM(t.turn_duration_secs)                              AS duration_secs
        FROM session_skill_turns st
        JOIN sessions s     ON s.id = st.session_id AND s.provider = ?
        JOIN session_turns t ON t.session_id = st.session_id
                            AND t.turn_number = st.turn_number
        WHERE st.skill = ?
    ''', (provider, skill_name))

    tools = query('''
        SELECT tc.tool_name, COUNT(*) AS calls
        FROM session_skill_turns st
        JOIN sessions s ON s.id = st.session_id AND s.provider = ?
        JOIN session_tool_calls tc ON tc.session_id = st.session_id
                                  AND tc.turn_number = st.turn_number
        WHERE st.skill = ?
        GROUP BY tc.tool_name
        ORDER BY calls DESC, tc.tool_name
    ''', (provider, skill_name))

    p = prof[0] if prof else {'turns': 0, 'duration_secs': None}
    return {
        'turns':         p['turns'] or 0,
        'duration_secs': p['duration_secs'],
        'tool_calls':    sum(t['calls'] for t in tools),
        'tools':         tools,
    }


def get_skill_analytics():
    return query('SELECT * FROM v_skill_analytics')


def get_skill_failure_analytics():
    """Per-skill failure association signals."""
    return query('SELECT * FROM v_skill_failure_signals')
