"""Grimoire files (skills/agents/steering docs) and file-access analytics."""
from pathlib import Path

from ..db import query


def get_files():
    rows = query('''
        SELECT id, path, name, type, group_name
        FROM files
        ORDER BY name
    ''')
    # Attach live file content so the grimoire tab can render it
    for r in rows:
        try:
            r['content'] = Path(r['path']).read_text()
        except Exception:
            r['content'] = ''
        r['label'] = r['name']
        r['group'] = r['type']
    return rows


def get_file_access_analytics():
    return query('SELECT * FROM v_file_access_analytics LIMIT 50')
