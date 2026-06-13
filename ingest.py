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

ROOT       = Path(__file__).parent
DB_PATH     = ROOT / 'ai-dev-view.db'
SCHEMA_PATH = ROOT / 'schema.sql'


# ── Schema ───────────────────────────────────────────────────────

def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def apply_schema(conn):
    """Apply schema.sql idempotently (all CREATE IF NOT EXISTS)."""
    # Views carry no data and are always rebuilt from session_turns — drop so
    # apply_schema recreates them with any definition changes from schema.sql.
    conn.execute('DROP VIEW IF EXISTS v_session_tokens')
    conn.executescript(SCHEMA_PATH.read_text())
    conn.commit()


# ── Dimension writers ────────────────────────────────────────────

PROVIDERS = [(n, m) for n, m in
             [('kiro', kiro), ('claude', claude_provider), ('codex', codex_provider)]
             if config.provider_enabled(n)]


def write_skills(conn):
    all_skills = []
    for pname, provider in PROVIDERS:
        skills = provider.read_skills()
        conn.executemany(
            'INSERT OR REPLACE INTO skills (name, description, path, created_at, provider) VALUES (?, ?, ?, ?, ?)',
            [(s['name'], s['description'], s['path'], s.get('created_at'), pname) for s in skills]
        )
        all_skills.extend(skills)
    conn.commit()
    print(f'  skills:  {len(all_skills)}')
    return {s['name'] for s in all_skills}


def write_mcps(conn):
    all_mcps = []
    for pname, provider in PROVIDERS:
        mcps = provider.read_mcps()
        conn.executemany(
            'INSERT OR REPLACE INTO mcps (server, tool_prefix, command, provider) VALUES (?, ?, ?, ?)',
            [(m['server'], m['tool_prefix'], m.get('command', ''), pname) for m in mcps]
        )
        all_mcps.extend(mcps)
    conn.commit()
    print(f'  mcps:    {len(all_mcps)}')
    return {m['tool_prefix']: m['server'] for m in all_mcps}


def write_agents(conn):
    total = 0
    for pname, provider in PROVIDERS:
        agents = provider.read_agents()
        for a in agents:
            conn.execute('''
                INSERT OR REPLACE INTO agents
                  (name, model, tools, allowed_tools, resources, hooks, description, prompt_path, provider)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (a['name'], a['model'], a['tools'], a['allowed_tools'],
                  a['resources'], a['hooks'], a['description'], a['prompt_path'], pname))
            for kind, ref in (a.get('declares') or []):
                conn.execute(
                    'INSERT OR IGNORE INTO agent_declares (agent, kind, ref) VALUES (?, ?, ?)',
                    (a['name'], kind, ref)
                )
        total += len(agents)
    conn.commit()
    print(f'  agents:  {total}')


def write_files(conn):
    files = kiro.scan_files() if config.provider_enabled('kiro') else []  # kiro-only in v1
    # INSERT OR IGNORE keeps stable file ids on re-runs
    conn.executemany('''
        INSERT OR IGNORE INTO files (path, name, type, group_name)
        VALUES (?, ?, ?, ?)
    ''', [(f['path'], f['name'], f['type'], f['group_name']) for f in files])
    conn.commit()
    print(f'  files:   {len(files)}')


# ── Session writer ───────────────────────────────────────────────

def write_sessions(conn, actual_skills, mcp_prefix_map, limit=None):
    def mcp_server_for(tool_name, record_mcp_server=None):
        if record_mcp_server:
            return record_mcp_server
        for prefix, server in mcp_prefix_map.items():
            if tool_name.startswith(prefix):
                return server
        return None

    done = 0
    for _pname, provider in PROVIDERS:
        for s in provider.read_sessions(limit=limit):
            sid = s['id']

            for ticket in {s['ticket'], *(t for t, _, _ in s['ticket_mentions'])} - {None}:
                conn.execute('INSERT OR IGNORE INTO tickets (key) VALUES (?)', (ticket,))
            conn.execute('INSERT OR IGNORE INTO agents (name) VALUES (?)', (s['agent'],))
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
                   session_created_reason, provider, git_branch)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (sid, s['title'], s['cwd'], s['agent'], model_id, s['ticket'],
                  s['created_at'], s['updated_at'], s['message_count'], s['tool_uses'],
                  s['request_count'], s['duration_secs'], s['max_context_pct'],
                  s['cycles'], s['compaction_count'], s['tool_error_count'],
                  s['session_created_reason'], s['provider'],
                  s.get('git_branch')))

            # Full rebuild per session: clear derived rows so removed data can't linger.
            # session_props is user-authored and deliberately NOT in this list.
            for table in ('session_turns', 'session_messages', 'session_tool_calls',
                          'session_skills', 'session_mcps', 'session_tool_uses',
                          'session_file_accesses', 'session_tool_errors', 'session_tickets'):
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

            # Skills: only explicit /skill-name tokens that match a real configured skill
            conn.executemany('''
                INSERT INTO session_skills (session_id, skill, signal, count)
                VALUES (?, ?, 'invoked', ?)
            ''', [(sid, skill, count) for skill, count in s['skill_counts'].items()
                  if skill in actual_skills])

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
    actual_skills  = write_skills(conn)
    mcp_prefix_map = write_mcps(conn)
    write_agents(conn)
    write_files(conn)
    write_sessions(conn, actual_skills, mcp_prefix_map, limit=limit)
    conn.close()
    print('Done.')


if __name__ == '__main__':
    main()
