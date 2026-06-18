"""Grimoire files (skills/agents/steering docs) and file-access analytics."""
from pathlib import Path

from ..db import query


def _skill_resources(skill_md_path):
    """Sibling files of a SKILL.md (scripts/, references/, assets/, …) with their
    real byte sizes — the 'loaded as needed' tier of progressive disclosure.
    Sizes are real os.stat values; never estimated."""
    out = []
    d = Path(skill_md_path).parent
    if not d.is_dir():
        return out
    for p in sorted(d.rglob('*')):
        if p.is_file() and p.name != 'SKILL.md':
            try:
                size = p.stat().st_size
            except Exception:
                size = None
            out.append({'name': p.name, 'rel': str(p.relative_to(d)), 'bytes': size})
    return out


def get_files():
    rows = query('''
        SELECT id, path, name, type, group_name, provider, scope, project_id
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
        # Skills: list sibling resource files (real sizes) for the disclosure breakdown
        r['resources'] = _skill_resources(r['path']) if r['type'] == 'skill' else []
    return rows


def get_file_access_analytics():
    return query('SELECT * FROM v_file_access_analytics LIMIT 50')
