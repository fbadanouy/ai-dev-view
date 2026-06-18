#!/usr/bin/env python3
"""
ingest.py — ingestion orchestrator for ai-dev-view.

Each providers/ module reads its data dir and emits provider-neutral records;
this script persists them to ai-dev-view.db. Idempotent; safe to re-run.
Never invents or estimates values.

Usage:
    python3 ingest.py                   # ingest all sessions
    python3 ingest.py --limit 20        # ingest most-recent N sessions
"""

import json
import sqlite3
import sys
from pathlib import Path

import config
from providers import kiro, claude as claude_provider, codex as codex_provider
from providers.projects import resolve_project

ROOT       = Path(__file__).parent
DB_PATH     = ROOT / 'ai-dev-view.db'
SCHEMA_PATH = ROOT / 'schema.sql'

CONFIG_DIRNAME = {'kiro': '.kiro', 'claude': '.claude', 'codex': '.codex'}


# ── Schema ───────────────────────────────────────────────────────

def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def apply_schema(conn):
    """Apply schema.sql idempotently (all CREATE IF NOT EXISTS)."""
    conn.execute('DROP VIEW IF EXISTS v_session_tokens')
    conn.execute('DROP VIEW IF EXISTS v_skill_analytics')   # redefined this release
    # v2 migration: dimension tables changed shape (scope/project_id, wider PKs).
    # They are fully rebuilt from disk each ingest, so dropping is safe.
    for t in ('skills', 'agents', 'mcps', 'files'):
        conn.execute(f'DROP TABLE IF EXISTS {t}')
    # sessions gains project_id (keep the table + its user-authored neighbors intact)
    cols = [r[1] for r in conn.execute('PRAGMA table_info(sessions)')]
    if cols and 'project_id' not in cols:
        conn.execute('ALTER TABLE sessions ADD COLUMN project_id TEXT')
    conn.executescript(SCHEMA_PATH.read_text())
    conn.commit()


# ── Provider list ────────────────────────────────────────────────

PROVIDERS = [(n, m) for n, m in
             [('kiro', kiro), ('claude', claude_provider), ('codex', codex_provider)]
             if config.provider_enabled(n)]


# ── Session collection ───────────────────────────────────────────

def collect_sessions(limit=None):
    out = []
    for _pname, provider in PROVIDERS:
        for s in provider.read_sessions(limit=limit):
            out.append(s)
    return out


# ── Project resolution ───────────────────────────────────────────

def write_projects(conn, sessions):
    home = Path.home()
    cache, meta, sid_pid = {}, {}, {}
    for s in sessions:
        cwd = s.get('cwd') or ''
        if cwd not in cache:
            cache[cwd] = resolve_project(cwd, home)
        pid, name, root_path = cache[cwd]
        sid_pid[s['id']] = pid
        m = meta.setdefault(pid, {'name': name, 'root_path': root_path,
                                  'first_seen': s.get('created_at') or '',
                                  'last_seen':  s.get('updated_at') or ''})
        c, u = s.get('created_at') or '', s.get('updated_at') or ''
        if c and (not m['first_seen'] or c < m['first_seen']): m['first_seen'] = c
        if u and (not m['last_seen']  or u > m['last_seen']):  m['last_seen']  = u
    for pid, m in meta.items():
        conn.execute('INSERT OR REPLACE INTO projects (id, name, root_path, first_seen, last_seen) '
                     'VALUES (?, ?, ?, ?, ?)',
                     (pid, m['name'], m['root_path'], m['first_seen'] or None, m['last_seen'] or None))
    conn.commit()
    roots = {m['root_path'] for m in meta.values() if m['root_path']}
    print(f'  projects:{len(meta)}')
    return sid_pid, roots


# ── Dimension writers ────────────────────────────────────────────

def _expand(root):
    """'~/web-app' -> Path('/Users/.../web-app')"""
    return Path(str(Path.home()) + root[1:]) if root.startswith('~') else Path(root)


def write_skills(conn, project_roots):
    user_names = {}   # pname → set of skill names
    proj_names  = {}  # (pname, pid) → set of skill names
    for pname, provider in PROVIDERS:
        batches = [('user', '', provider.read_skills())]
        if pname == 'claude':
            batches.append(('plugin', '', provider.read_plugin_skills()))
        for root in project_roots:
            base = _expand(root) / CONFIG_DIRNAME[pname]
            if base.exists():
                batches.append(('project', root, provider.read_skills(base)))
        for scope, pid, skills in batches:
            for s in skills:
                conn.execute(
                    'INSERT OR REPLACE INTO skills '
                    '(name, description, path, created_at, provider, scope, project_id) '
                    'VALUES (?, ?, ?, ?, ?, ?, ?)',
                    (s['name'], s['description'], s['path'], s.get('created_at'), pname, scope, pid))
                if scope in ('user', 'plugin'):
                    user_names.setdefault(pname, set()).add(s['name'])
                else:
                    proj_names.setdefault((pname, pid), set()).add(s['name'])
    conn.commit()
    total_user = sum(len(v) for v in user_names.values())
    total_proj = sum(len(v) for v in proj_names.values())
    print(f'  skills:  user={total_user} projects={total_proj}')
    return user_names, proj_names


def write_mcps(conn, project_roots):
    prefix_map = {}
    for pname, provider in PROVIDERS:
        batches = [('user', '', provider.read_mcps())]
        for root in project_roots:
            if pname == 'claude':
                mcps = provider.read_mcps(project_root=_expand(root))
            else:
                base = _expand(root) / CONFIG_DIRNAME[pname]
                mcps = provider.read_mcps(base) if base.exists() else []
            if mcps:
                batches.append(('project', root, mcps))
        for scope, pid, mcps in batches:
            for m in mcps:
                conn.execute(
                    'INSERT OR REPLACE INTO mcps (server, tool_prefix, command, provider, scope, project_id) '
                    'VALUES (?, ?, ?, ?, ?, ?)',
                    (m['server'], m['tool_prefix'], m.get('command', ''), pname, scope, pid))
                prefix_map[m['tool_prefix']] = m['server']
    conn.commit()
    print(f'  mcps:    {len(prefix_map)}')
    return prefix_map


def write_agents(conn, project_roots):
    total = 0
    for pname, provider in PROVIDERS:
        batches = [('user', '', provider.read_agents())]
        if pname == 'claude':
            batches.append(('plugin', '', provider.read_plugin_agents()))
        for root in project_roots:
            base = _expand(root) / CONFIG_DIRNAME[pname]
            if base.exists():
                batches.append(('project', root, provider.read_agents(base)))
        for scope, pid, agents in batches:
            for a in agents:
                conn.execute(
                    'INSERT OR REPLACE INTO agents '
                    '(name, model, tools, allowed_tools, resources, hooks, description, '
                    ' prompt_path, provider, scope, project_id) '
                    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    (a['name'], a['model'], a['tools'], a['allowed_tools'], a['resources'],
                     a['hooks'], a['description'], a['prompt_path'], pname, scope, pid))
                for kind, ref in (a.get('declares') or []):
                    conn.execute('INSERT OR IGNORE INTO agent_declares (agent, kind, ref) VALUES (?, ?, ?)',
                                 (a['name'], kind, ref))
                total += 1
    conn.commit()
    print(f'  agents:  {total}')


def _root_docs(root_dir):
    """Provider-agnostic instruction docs at a project/home root.
    AGENTS.md is the shared cross-tool convention; CLAUDE.md is Claude's."""
    out = []
    a = root_dir / 'AGENTS.md'
    if a.exists():
        out.append((str(a), 'AGENTS.md', 'root', None, 'shared'))
    c = root_dir / 'CLAUDE.md'
    if c.exists():
        out.append((str(c), 'CLAUDE.md', 'instructions', None, 'claude'))
    return out


def write_files(conn, project_roots):
    rows = []   # (path, name, type, group_name, provider, scope, project_id)

    # Per-provider config-dir docs: home (~/.<provider>) + each project's .<provider>
    for pname, provider in PROVIDERS:
        home_base = config.provider_path(pname)
        if home_base.exists():
            for f in provider.scan_files(base=home_base):
                rows.append((f['path'], f['name'], f['type'], f['group_name'],
                             f['provider'], 'user', ''))
        for root in project_roots:
            base = _expand(root) / CONFIG_DIRNAME[pname]
            if base.exists():
                for f in provider.scan_files(base=base, project_root=_expand(root)):
                    rows.append((f['path'], f['name'], f['type'], f['group_name'],
                                 f['provider'], 'project', root))

    # Shared root instruction docs (AGENTS.md / CLAUDE.md): home + each project root
    scopes = [(Path.home(), 'user', '')] + [(_expand(root), 'project', root) for root in project_roots]
    for root_dir, scope, pid in scopes:
        for path, name, ftype, group, prov in _root_docs(root_dir):
            rows.append((path, name, ftype, group, prov, scope, pid))

    conn.executemany(
        'INSERT OR IGNORE INTO files (path, name, type, group_name, provider, scope, project_id) '
        'VALUES (?, ?, ?, ?, ?, ?, ?)', rows)
    conn.commit()
    print(f'  files:   {len(rows)}')


# ── Session writer ───────────────────────────────────────────────

def write_sessions(conn, sessions, sid_pid, user_skills, proj_skills, mcp_prefix_map):
    def mcp_server_for(tool_name, record_mcp_server=None):
        if record_mcp_server:
            return record_mcp_server
        for prefix, server in mcp_prefix_map.items():
            if tool_name.startswith(prefix):
                return server
        return None

    done = 0
    for s in sessions:
        sid = s['id']
        pid = sid_pid.get(sid, '')

        for ticket in {s['ticket'], *(t for t, _, _ in s['ticket_mentions'])} - {None}:
            conn.execute('INSERT OR IGNORE INTO tickets (key) VALUES (?)', (ticket,))
        conn.execute("INSERT OR IGNORE INTO agents (name, provider, scope, project_id) "
                     "VALUES (?, ?, 'user', '')", (s['agent'], s['provider']))
        model_id = None
        if s['model']:
            m = s['model']
            model_id = m['model_id']
            conn.execute('''
                INSERT OR REPLACE INTO models
                  (model_id, model_name, description, context_window_tokens,
                   rate_multiplier, rate_unit)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (m['model_id'], m['model_name'], m['description'],
                  m['context_window_tokens'], m['rate_multiplier'], m['rate_unit']))
        # Per-turn model_ids also need FK targets in models
        for t in s.get('turns', []):
            if t.get('model_id') and t['model_id'] != model_id:
                conn.execute(
                    'INSERT OR IGNORE INTO models (model_id, model_name) VALUES (?, ?)',
                    (t['model_id'], t['model_id'])
                )

        conn.execute('''
            INSERT OR REPLACE INTO sessions
              (id, title, cwd, agent, model, ticket, created_at, updated_at,
               message_count, tool_uses, request_count, duration_secs,
               max_context_pct, cycles, compaction_count, tool_error_count,
               session_created_reason, provider, git_branch, project_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (sid, s['title'], s['cwd'], s['agent'], model_id, s['ticket'],
              s['created_at'], s['updated_at'], s['message_count'], s['tool_uses'],
              s['request_count'], s['duration_secs'], s['max_context_pct'],
              s['cycles'], s['compaction_count'], s['tool_error_count'],
              s['session_created_reason'], s['provider'],
              s.get('git_branch'), pid))

        # Full rebuild per session: clear derived rows so removed data can't linger.
        # session_props is user-authored and deliberately NOT in this list.
        for table in ('session_turns', 'session_messages', 'session_tool_calls',
                      'session_skills', 'session_skill_turns', 'session_mcps',
                      'session_tool_uses', 'session_file_accesses',
                      'session_tool_errors', 'session_tickets'):
            conn.execute(f'DELETE FROM {table} WHERE session_id = ?', (sid,))

        conn.executemany('''
            INSERT INTO session_tickets (session_id, ticket, source, count)
            VALUES (?, ?, ?, ?)
        ''', [(sid, t, source, count) for t, source, count in s['ticket_mentions']])

        conn.executemany('''
            INSERT INTO session_turns
              (session_id, turn_number, number_of_cycles, builtin_tool_uses,
               total_request_count, turn_duration_secs, context_usage_percentage,
               end_reason, end_timestamp, result_status, result_err_kind,
               model_id, is_sidechain, input_tokens, output_tokens,
               cache_read_tokens, cache_creation_tokens, cache_5m_tokens, cache_1h_tokens,
               codex_input_tokens, codex_cached_input_tokens, codex_output_tokens,
               codex_reasoning_output_tokens, codex_total_tokens, codex_model_context_window)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [(sid, t['turn_number'], t['number_of_cycles'], t['builtin_tool_uses'],
               t['total_request_count'], t['turn_duration_secs'],
               t['context_usage_percentage'], t['end_reason'], t['end_timestamp'],
               t['result_status'], t['result_err_kind'],
               t.get('model_id'), t.get('is_sidechain'),
               t.get('input_tokens'), t.get('output_tokens'),
               t.get('cache_read_tokens'), t.get('cache_creation_tokens'),
               t.get('cache_5m_tokens'), t.get('cache_1h_tokens'),
               t.get('codex_input_tokens'), t.get('codex_cached_input_tokens'),
               t.get('codex_output_tokens'), t.get('codex_reasoning_output_tokens'),
               t.get('codex_total_tokens'), t.get('codex_model_context_window'))
              for t in s['turns']])

        conn.executemany('''
            INSERT INTO session_messages
              (session_id, seq, turn_number, role, text, tool_use_ids)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', [(sid, m['seq'], m['turn_number'], m['role'], m['text'],
               json.dumps(m['tool_use_ids']) if m['tool_use_ids'] else None)
              for m in s['messages']])

        conn.executemany('''
            INSERT INTO session_tool_calls
              (tool_use_id, session_id, turn_number, tool_name, purpose,
               command_preview, mcp_server, outcome, error_msg,
               result_status, result_bytes, result_preview, result_truncated, result_meta)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [(tc['tool_use_id'], sid, tc['turn_number'], tc['tool_name'],
               tc['purpose'], tc['command_preview'],
               mcp_server_for(tc['tool_name'], tc.get('mcp_server')),
               tc['outcome'], tc['error_msg'], tc['result_status'], tc['result_bytes'],
               tc['result_preview'], tc['result_truncated'], tc['result_meta'])
              for tc in s['tool_calls']])

        # Skills: only tokens that match skills actually installed for this provider
        provider = s.get('provider', '')
        allowed = user_skills.get(provider, set()) | proj_skills.get((provider, pid), set())
        conn.executemany(
            "INSERT INTO session_skills (session_id, skill, signal, count) VALUES (?, ?, 'invoked', ?)",
            [(sid, skill, count) for skill, count in s['skill_counts'].items() if skill in allowed])

        # Turn anchor: aggregate (skill, turn) detections, same provider filter.
        # turn may be None if a detection couldn't be tied to a turn — drop those.
        skill_turn_counts = {}
        for skill, turn in s.get('skill_turns', []):
            if skill in allowed and turn is not None:
                skill_turn_counts[(skill, turn)] = skill_turn_counts.get((skill, turn), 0) + 1
        conn.executemany(
            "INSERT INTO session_skill_turns (session_id, skill, turn_number, count) VALUES (?, ?, ?, ?)",
            [(sid, skill, turn, count) for (skill, turn), count in skill_turn_counts.items()])

        mcp_rows, builtin_rows = [], []
        for tool_name, count in s['tool_counts'].items():
            server = mcp_server_for(tool_name)
            if server:
                mcp_rows.append((sid, server, tool_name, count))
            else:
                builtin_rows.append((sid, tool_name, count))
        conn.executemany(
            'INSERT INTO session_mcps (session_id, mcp_server, tool_name, count) VALUES (?, ?, ?, ?)',
            mcp_rows)
        conn.executemany(
            'INSERT INTO session_tool_uses (session_id, tool_name, count) VALUES (?, ?, ?)',
            builtin_rows)

        conn.executemany(
            'INSERT INTO session_file_accesses (session_id, path, op, count) VALUES (?, ?, ?, ?)',
            [(sid, path, op, count) for (op, path), count in s['file_accesses'].items()])

        conn.executemany(
            'INSERT INTO session_tool_errors (session_id, error_msg, count) VALUES (?, ?, ?)',
            [(sid, msg, count) for msg, count in s['tool_errors'].items()])

        done += 1

    conn.commit()
    print(f'  sessions:{done}')


# ── Main ─────────────────────────────────────────────────────────

def main():
    limit = None
    if '--limit' in sys.argv:
        limit = int(sys.argv[sys.argv.index('--limit') + 1])

    print(f'Ingesting → {DB_PATH}')
    conn = connect()
    apply_schema(conn)
    sessions = collect_sessions(limit=limit)
    sid_pid, roots = write_projects(conn, sessions)
    user_skills, proj_skills = write_skills(conn, roots)
    mcp_prefix_map = write_mcps(conn, roots)
    write_agents(conn, roots)
    write_files(conn, roots)
    write_sessions(conn, sessions, sid_pid, user_skills, proj_skills, mcp_prefix_map)
    conn.close()
    print('Done.')


if __name__ == '__main__':
    main()
