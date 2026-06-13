"""Skill list, per-skill sessions, and skill analytics."""
from ..db import query


def get_skills_list():
    """All configured skills — returns skill_name field for UI compatibility."""
    return query('SELECT name AS skill_name, description, path, created_at FROM skills ORDER BY name')


def get_skill_sessions(skill_name):
    """Sessions that invoked a given skill."""
    return query('''
        SELECT s.id AS session_id, s.title, s.ticket, s.updated_at, ss.count
        FROM session_skills ss
        JOIN sessions s ON s.id = ss.session_id
        WHERE ss.skill = ? AND ss.signal = 'invoked'
        ORDER BY s.updated_at DESC
        LIMIT 20
    ''', (skill_name,))


def get_skill_analytics():
    return query('SELECT * FROM v_skill_analytics')


def get_skill_failure_analytics():
    """Per-skill failure association signals."""
    return query('SELECT * FROM v_skill_failure_signals')
