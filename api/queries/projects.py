"""Projects: list with rollups, and per-project detail (sessions + AI config)."""
from urllib.parse import unquote
from ..db import query


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
                          'updated_at, duration_secs, tool_uses, message_count '
                          'FROM sessions WHERE project_id = ? ORDER BY updated_at DESC', (pid,)),
        'skills':   query("SELECT name, description, path, provider FROM skills "
                          "WHERE scope='project' AND project_id = ? ORDER BY name", (pid,)),
        'agents':   query("SELECT name, model, description, provider FROM agents "
                          "WHERE scope='project' AND project_id = ? ORDER BY name", (pid,)),
        'mcps':     query("SELECT server, tool_prefix, command, provider FROM mcps "
                          "WHERE scope='project' AND project_id = ? ORDER BY server", (pid,)),
        'files':    query("SELECT path, name, type, group_name FROM files "
                          "WHERE scope='project' AND project_id = ? ORDER BY type, name", (pid,)),
        'models':   query('SELECT model AS model_id, COUNT(*) AS n FROM sessions '
                          'WHERE project_id = ? AND model IS NOT NULL GROUP BY model ORDER BY n DESC', (pid,)),
        'tickets':  query('SELECT DISTINCT ticket FROM sessions '
                          'WHERE project_id = ? AND ticket IS NOT NULL ORDER BY ticket', (pid,)),
    }
