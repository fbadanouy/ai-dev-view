"""Codex CLI provider adapter — reads ~/.codex (never writes it).

Emits provider-neutral dicts with the same shape as claude.py:489-518.
Turn segmentation: task_started/task_complete/turn_aborted by turn_id;
user_message fallback for legacy files with no task events.

Token rule (CRITICAL): per turn, sum last_token_usage deltas across
token_count events. total_token_usage is cumulative — never sum it directly.
Fallback when last_token_usage absent: diff consecutive totals, clamped ≥ 0.
Sessions with no usable token records leave all codex_* columns NULL.
"""

import glob
import json
import os
import re
from collections import Counter
from pathlib import Path

import config

HOME         = Path.home()
CODEX        = config.provider_path('codex')
SESSIONS_DIR = CODEX / 'sessions'
ARCHIVED_DIR = CODEX / 'archived_sessions'

PREVIEW_LEN = 700
COMMAND_LEN = 300

_SKILL_RE      = re.compile(r'/([a-z][a-z0-9-]+)')
_SKILL_PATH_RE = re.compile(r'/skills/(?:\.system/)?([a-z][a-z0-9-]+)/SKILL\.md')
_TICKET_RE     = config.ticket_re()


# ── Dimensions ───────────────────────────────────────────────────

def read_skills(base=None):
    base = base or CODEX
    out = []
    for scan_base in (base / 'skills', base / 'skills' / '.system'):
        if not scan_base.exists():
            continue
        for skill_file in sorted(scan_base.glob('*/SKILL.md')):
            try:
                text = skill_file.read_text()
                description = _parse_frontmatter(text).get('description', '')
            except Exception:
                description = ''
            out.append({
                'name':        skill_file.parent.name,
                'description': description,
                'path':        str(skill_file),
                'created_at':  None,
                'provider':    'codex',
            })
    return out


def read_mcps(base=None):
    base = base or CODEX
    cfg_path = base / 'config.toml'
    if not cfg_path.exists():
        return []
    try:
        import tomllib
        with open(cfg_path, 'rb') as f:
            cfg = tomllib.load(f)
    except Exception:
        return []
    servers = cfg.get('mcp_servers', {})
    out = []
    for name, srv in servers.items():
        cmd = srv.get('command', '')
        args = srv.get('args', [])
        command = ' '.join([cmd] + [str(a) for a in args]) if args else cmd
        out.append({
            'server':      name,
            'tool_prefix': f'mcp__{name}__',
            'command':     command,
            'provider':    'codex',
        })
    return out


def read_agents(base=None):
    base = base or CODEX
    agents_dir = base / 'agents'
    if not agents_dir.exists():
        return []
    out = []
    for af in sorted(agents_dir.glob('*.md')):
        try:
            text = af.read_text()
            fm = _parse_frontmatter(text)
        except Exception:
            continue
        out.append({
            'name':          af.stem,
            'model':         fm.get('model'),
            'tools':         None,
            'allowed_tools': None,
            'resources':     None,
            'hooks':         None,
            'description':   fm.get('description'),
            'prompt_path':   str(af),
            'declares':      [],
            'provider':      'codex',
        })
    return out


def scan_files(base=None, project_root=None):
    """Codex instruction/doc markdown from a .codex dir: AGENTS.md (this dir's
    own copy) + agents / skills (incl .system) / prompts. The project-root
    AGENTS.md is scanned centrally as 'shared'.
    """
    base = base or CODEX
    out = []
    am = base / 'AGENTS.md'
    if am.exists():
        out.append({'path': str(am), 'name': 'AGENTS.md', 'type': 'instructions',
                    'group_name': None, 'provider': 'codex'})
    scan = [
        ('agents/*.md',               'agent',   lambda p: os.path.basename(p)[:-3]),
        ('skills/*/SKILL.md',         'skill',   lambda p: p.split('/skills/')[1].split('/')[0]),
        ('skills/.system/*/SKILL.md', 'skill',   lambda p: p.split('/.system/')[1].split('/')[0]),
        ('prompts/*.md',              'command', lambda p: os.path.basename(p)[:-3]),
    ]
    for pattern, group, namer in scan:
        for path in sorted(glob.glob(str(base / pattern))):
            out.append({'path': path, 'name': namer(path), 'type': group,
                        'group_name': None, 'provider': 'codex'})
    return out


# ── Sessions ─────────────────────────────────────────────────────

def read_sessions(limit=None):
    if not SESSIONS_DIR.exists():
        print('  codex: not found, skipped')
        return

    # Collect .jsonl files from sessions/ and archived_sessions/ (if present).
    # sessions/ wins on duplicate relative path — build set of relative paths seen.
    seen_rel = set()
    files = []

    for jl in SESSIONS_DIR.rglob('*.jsonl'):
        rel = jl.relative_to(SESSIONS_DIR)
        seen_rel.add(rel)
        files.append(jl)

    if ARCHIVED_DIR.exists():
        for jl in ARCHIVED_DIR.rglob('*.jsonl'):
            rel = jl.relative_to(ARCHIVED_DIR)
            if rel not in seen_rel:
                files.append(jl)

    # .zst files exist in newer Codex builds but require an external dependency — skip.
    zst_count = sum(1 for jl in SESSIONS_DIR.rglob('*.jsonl.zst'))
    if zst_count:
        print(f'  codex: skipping {zst_count} .zst compressed session(s) (no dependency)')

    files.sort(key=os.path.getmtime, reverse=True)
    if limit:
        files = files[:limit]

    for jl in files:
        try:
            rec = _parse_codex_session(jl)
        except Exception:
            continue
        if rec:
            yield rec


# ── Core parser ──────────────────────────────────────────────────

def _parse_codex_session(jl):
    try:
        raw_lines = jl.read_text().splitlines()
    except Exception:
        return None

    records = []
    for line in raw_lines:
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    # Pull out session_meta (first occurrence)
    session_meta_payload = None
    for r in records:
        if r.get('type') == 'session_meta':
            session_meta_payload = r.get('payload', {})
            break

    # Derive session id: prefer session_meta.id, fallback to ULID in filename
    session_id = None
    if session_meta_payload:
        session_id = session_meta_payload.get('id')
    if not session_id:
        # filename: rollout-<datetime>-<ulid>.jsonl
        name = jl.stem  # strip .jsonl
        parts = name.split('-', 3)  # rollout, YYYY, MM, rest
        # last segment after splitting on - may be the ulid; just use the stem
        session_id = name

    # ── Step A — turn segmentation ───────────────────────────────
    # Track current turn_context state (model/cwd updates before task_started)
    current_tc_model = None
    current_tc_cwd   = None

    # turns_data: list of dicts keyed by turn_id
    turns_order  = []    # turn_ids in order
    turns_map    = {}    # turn_id → {records, turn_context_model, open, ...}

    # thread_spawn replay guard: collect timestamps from the burst at the start of
    # the file (all sharing the same second) so we can skip their token events.
    # ccusage issue #950: subagent files begin by replaying parent token_counts.
    thread_spawn_seen = False
    replay_ts_second  = None   # ISO second prefix of the replay burst
    in_replay_burst   = False

    # Check for thread_spawn marker early in the file
    for r in records[:20]:
        if r.get('type') == 'event_msg' and r.get('payload', {}).get('type') == 'thread_spawn':
            thread_spawn_seen = True
            replay_ts_second = (r.get('timestamp') or '')[:19]  # YYYY-MM-DDTHH:MM:SS
            in_replay_burst = True
            break

    # Fallback: for legacy files with no task_started events, we collect user_message
    # events and synthesize turns. We detect which mode after the pass.
    legacy_user_turns = []  # list of {records} for legacy mode

    active_turn_id = None

    for r in records:
        rtype = r.get('type', '')
        p     = r.get('payload', {})
        ts    = r.get('timestamp', '')

        # End the replay burst when we move past its second
        if in_replay_burst and ts and ts[:19] != replay_ts_second:
            in_replay_burst = False

        if rtype == 'turn_context':
            current_tc_model = p.get('model')
            current_tc_cwd   = p.get('cwd')
            # Newer Codex emits turn_context AFTER task_started, so the model wasn't
            # known when the turn opened. Back-fill the active turn's model here.
            if active_turn_id and current_tc_model:
                td = turns_map.get(active_turn_id)
                if td and not td.get('model'):
                    td['model'] = current_tc_model
            continue

        if rtype == 'event_msg':
            etype = p.get('type', '')

            if etype == 'task_started':
                tid = p.get('turn_id')
                if tid and tid not in turns_map:
                    turns_map[tid] = {
                        'turn_id':            tid,
                        'records':            [r],
                        'model':              current_tc_model,
                        'open':               True,
                        'task_started_ctx_window': p.get('model_context_window'),
                        # token accumulators
                        'codex_input':        None,
                        'codex_cached_input': None,
                        'codex_output':       None,
                        'codex_reasoning':    None,
                        'codex_total':        None,
                        'codex_ctx_window':   None,
                        # for the consecutive-totals-diff fallback
                        'prev_total_input':   None,
                        'prev_total_output':  None,
                        'prev_total_cached':  None,
                        'prev_total_reasoning': None,
                        'prev_total_total':   None,
                        # response count (model calls)
                        'request_count':      0,
                        # tool pairing
                        'call_ids':           [],
                    }
                    turns_order.append(tid)
                    active_turn_id = tid
                    in_replay_burst = False  # new real turn ends any replay burst
                continue

            if etype in ('task_complete', 'turn_aborted'):
                tid = p.get('turn_id')
                if tid and tid in turns_map:
                    turns_map[tid]['records'].append(r)
                    turns_map[tid]['open'] = False
                    turns_map[tid]['end_event'] = r
                    if active_turn_id == tid:
                        active_turn_id = None
                continue

            if etype == 'user_message':
                legacy_user_turns.append(r)

            # All other event_msg records go into the active turn
            if active_turn_id and active_turn_id in turns_map:
                turns_map[active_turn_id]['records'].append(r)

                if etype == 'token_count':
                    info = p.get('info')
                    td = turns_map[active_turn_id]
                    if not in_replay_burst and info is not None:
                        last = info.get('last_token_usage')
                        total = info.get('total_token_usage')
                        ctx_win = info.get('model_context_window')
                        if ctx_win is not None:
                            td['codex_ctx_window'] = ctx_win

                        if last is not None:
                            # Preferred path: sum last_token_usage deltas
                            td['codex_input']     = (td['codex_input']     or 0) + (last.get('input_tokens',            0) or 0)
                            td['codex_cached_input'] = (td['codex_cached_input'] or 0) + (last.get('cached_input_tokens', 0) or 0)
                            td['codex_output']    = (td['codex_output']    or 0) + (last.get('output_tokens',           0) or 0)
                            td['codex_reasoning'] = (td['codex_reasoning'] or 0) + (last.get('reasoning_output_tokens', 0) or 0)
                            td['codex_total']     = (td['codex_total']     or 0) + (last.get('total_tokens',            0) or 0)
                            td['request_count']  += 1
                        elif total is not None:
                            # Fallback: diff consecutive cumulative totals, clamp ≥ 0
                            def _clamp_diff(new, prev):
                                if new is None:
                                    return None
                                if prev is None:
                                    return new
                                return max(0, new - prev)

                            d_input     = _clamp_diff(total.get('input_tokens'),            td['prev_total_input'])
                            d_cached    = _clamp_diff(total.get('cached_input_tokens'),     td['prev_total_cached'])
                            d_output    = _clamp_diff(total.get('output_tokens'),           td['prev_total_output'])
                            d_reasoning = _clamp_diff(total.get('reasoning_output_tokens'), td['prev_total_reasoning'])
                            d_total     = _clamp_diff(total.get('total_tokens'),            td['prev_total_total'])

                            if d_input is not None:
                                td['codex_input']     = (td['codex_input']     or 0) + d_input
                            if d_cached is not None:
                                td['codex_cached_input'] = (td['codex_cached_input'] or 0) + d_cached
                            if d_output is not None:
                                td['codex_output']    = (td['codex_output']    or 0) + d_output
                            if d_reasoning is not None:
                                td['codex_reasoning'] = (td['codex_reasoning'] or 0) + d_reasoning
                            if d_total is not None:
                                td['codex_total']     = (td['codex_total']     or 0) + d_total
                            td['request_count'] += 1

                            td['prev_total_input']     = total.get('input_tokens')
                            td['prev_total_cached']    = total.get('cached_input_tokens')
                            td['prev_total_output']    = total.get('output_tokens')
                            td['prev_total_reasoning'] = total.get('reasoning_output_tokens')
                            td['prev_total_total']     = total.get('total_tokens')
                    elif in_replay_burst and info is not None:
                        # Seed the prev_total snapshot from the replay burst so the
                        # first real diff is correct, but don't add to sums.
                        td = turns_map[active_turn_id]
                        total = info.get('total_token_usage')
                        if total is not None:
                            td['prev_total_input']     = total.get('input_tokens')
                            td['prev_total_cached']    = total.get('cached_input_tokens')
                            td['prev_total_output']    = total.get('output_tokens')
                            td['prev_total_reasoning'] = total.get('reasoning_output_tokens')
                            td['prev_total_total']     = total.get('total_tokens')

            continue

        if rtype == 'response_item':
            if active_turn_id and active_turn_id in turns_map:
                turns_map[active_turn_id]['records'].append(r)
            continue

        # session_meta and turn_context already handled; skip everything else silently

    # ── Legacy fallback ──────────────────────────────────────────
    # If no task_started events found, synthesize turns from user_message events
    if not turns_order and legacy_user_turns:
        for i, r in enumerate(legacy_user_turns):
            synthetic_id = f'synthetic-{i}'
            turns_map[synthetic_id] = {
                'turn_id':            synthetic_id,
                'records':            [r],
                'model':              current_tc_model,
                'open':               False,
                'task_started_ctx_window': None,
                'codex_input':        None,
                'codex_cached_input': None,
                'codex_output':       None,
                'codex_reasoning':    None,
                'codex_total':        None,
                'codex_ctx_window':   None,
                'prev_total_input':   None,
                'prev_total_output':  None,
                'prev_total_cached':  None,
                'prev_total_reasoning': None,
                'prev_total_total':   None,
                'request_count':      0,
                'call_ids':           [],
                'end_event':          None,
            }
            turns_order.append(synthetic_id)

    # ── Step D — tool calls ──────────────────────────────────────
    # First pass: collect response_items per turn, build call_id maps for pairing.
    # Also collect end-event enrichments (mcp_tool_call_end, patch_apply_end).

    all_tool_calls = []

    # Build per-turn call_id maps across all records
    # function_call/custom_tool_call: call_id → tool record
    # function_call_output/custom_tool_call_output: call_id → output record
    # mcp_tool_call_end: call_id → event
    # patch_apply_end: call_id → event

    for turn_number, turn_id in enumerate(turns_order, start=1):
        td = turns_map[turn_id]
        turn_recs = td['records']

        fc_by_call_id  = {}   # call_id → response_item payload (function_call/custom_tool_call/web_search_call/local_shell_call)
        out_by_call_id = {}   # call_id → output payload
        mcp_end_by_call_id = {}
        patch_end_by_call_id = {}
        web_search_end_ids = set()

        for r in turn_recs:
            rtype = r.get('type', '')
            p     = r.get('payload', {})

            if rtype == 'response_item':
                ptype = p.get('type', '')
                call_id = p.get('call_id', '')
                if ptype in ('function_call', 'custom_tool_call', 'local_shell_call'):
                    fc_by_call_id[call_id] = p
                elif ptype == 'web_search_call':
                    # no call_id in web_search_call — use a synthetic key
                    key = p.get('call_id') or f'ws-{len(fc_by_call_id)}'
                    fc_by_call_id[key] = p
                elif ptype in ('function_call_output', 'custom_tool_call_output'):
                    out_by_call_id[call_id] = p

            elif rtype == 'event_msg':
                etype = p.get('type', '')
                if etype == 'mcp_tool_call_end':
                    cid = p.get('call_id', '')
                    if cid:
                        mcp_end_by_call_id[cid] = p
                elif etype == 'patch_apply_end':
                    cid = p.get('call_id', '')
                    if cid:
                        patch_end_by_call_id[cid] = p
                elif etype == 'web_search_end':
                    web_search_end_ids.add(p.get('call_id', ''))

        for call_id, fc_p in fc_by_call_id.items():
            ptype = fc_p.get('type', '')
            tool_name = fc_p.get('name', '')

            # command_preview: prefer parsed 'command' field inside arguments for shell calls
            raw_args = fc_p.get('arguments', '')
            command_preview = None
            if raw_args:
                if ptype == 'local_shell_call':
                    try:
                        parsed = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                        command_preview = str(parsed.get('cmd') or parsed.get('command') or raw_args)
                    except Exception:
                        command_preview = str(raw_args)
                else:
                    command_preview = str(raw_args)
                if len(command_preview) > COMMAND_LEN:
                    command_preview = command_preview[:COMMAND_LEN]

            # mcp_server: from mcp_tool_call_end (authoritative) or mcp__ name prefix
            mcp_server = None
            if call_id in mcp_end_by_call_id:
                mcp_server = mcp_end_by_call_id[call_id].get('invocation', {}).get('server')
            elif tool_name.startswith('mcp__'):
                parts = tool_name.split('__')
                if len(parts) >= 2:
                    mcp_server = parts[1]

            # outcome
            outcome = 'unknown'
            error_msg = None
            result_bytes = None
            result_preview = None
            result_truncated = None

            if call_id in patch_end_by_call_id:
                pe = patch_end_by_call_id[call_id]
                outcome = 'success' if pe.get('success') else 'error'
                if outcome == 'error':
                    stderr = pe.get('stderr', '') or ''
                    error_msg = stderr[:COMMAND_LEN] or None

            elif call_id in mcp_end_by_call_id:
                res = mcp_end_by_call_id[call_id].get('result', {})
                outcome = 'error' if 'Err' in res else 'success'
                if outcome == 'error':
                    err_val = res.get('Err', '')
                    error_msg = str(err_val)[:COMMAND_LEN]

            elif call_id in out_by_call_id:
                out_p = out_by_call_id[call_id]
                raw_output = out_p.get('output', '')
                out_str = raw_output if isinstance(raw_output, str) else json.dumps(raw_output)
                # Presence of output without an explicit error shape → success
                outcome = 'success'
                result_bytes = len(out_str)
                result_preview = out_str[:PREVIEW_LEN] or None
                result_truncated = 1 if len(out_str) > PREVIEW_LEN else 0

            elif ptype == 'web_search_call':
                outcome = 'success' if call_id in web_search_end_ids else 'unknown'

            all_tool_calls.append({
                'tool_use_id':      call_id,
                'turn_number':      turn_number,
                'tool_name':        tool_name,
                'purpose':          None,  # Codex has no description field — leave NULL
                'command_preview':  command_preview,
                'mcp_server':       mcp_server,
                'outcome':          outcome,
                'error_msg':        error_msg,
                'result_status':    None,
                'result_bytes':     result_bytes,
                'result_preview':   result_preview,
                'result_truncated': result_truncated,
                'result_meta':      None,
            })

    # ── Step C — per-turn values ─────────────────────────────────
    turns_out = []
    all_messages = []
    skill_counts = {}
    skill_turns  = []   # (skill, turn_number) per detection; turn anchor for attribution
    tool_counts  = {}
    file_accesses = {}
    tool_errors_map = {}
    seq = 0

    for turn_number, turn_id in enumerate(turns_order, start=1):
        td = turns_map[turn_id]
        turn_recs = td['records']

        # timestamps for duration
        timestamps = [r.get('timestamp') for r in turn_recs if r.get('timestamp')]
        turn_duration = None
        if len(timestamps) >= 2:
            try:
                turn_duration = int(_ts_to_secs(timestamps[-1]) - _ts_to_secs(timestamps[0]))
            except Exception:
                pass

        # end reason / timestamp
        end_event = td.get('end_event')
        end_reason = None
        end_timestamp = None
        if end_event:
            end_reason    = end_event.get('payload', {}).get('type')
            end_timestamp = end_event.get('timestamp')

        # builtin tool uses: function_call + local_shell_call + custom_tool_call + web_search_call
        builtin_tool_use_count = 0
        for r in turn_recs:
            if r.get('type') == 'response_item':
                ptype = r.get('payload', {}).get('type', '')
                if ptype in ('function_call', 'local_shell_call', 'custom_tool_call', 'web_search_call'):
                    builtin_tool_use_count += 1
                    tool_name = r.get('payload', {}).get('name', '')
                    if tool_name:
                        tool_counts[tool_name] = tool_counts.get(tool_name, 0) + 1

        # file_accesses from patch_apply_end.changes
        for r in turn_recs:
            if r.get('type') == 'event_msg' and r.get('payload', {}).get('type') == 'patch_apply_end':
                changes = r.get('payload', {}).get('changes', {})
                for path in changes:
                    abbrev = path.replace(str(HOME), '~')
                    # reads are not derivable from codex logs — only writes are tracked
                    file_accesses[('write', abbrev)] = file_accesses.get(('write', abbrev), 0) + 1

        # skill detection from SKILL.md reads in shell commands (function_call or local_shell_call)
        for r in turn_recs:
            if r.get('type') == 'response_item':
                ri_p = r.get('payload', {})
                if ri_p.get('type') in ('function_call', 'local_shell_call'):
                    raw_args = ri_p.get('arguments', '')
                    if raw_args:
                        args_str = raw_args if isinstance(raw_args, str) else json.dumps(raw_args)
                        m = _SKILL_PATH_RE.search(args_str)
                        if m:
                            sk = m.group(1)
                            skill_counts[sk] = skill_counts.get(sk, 0) + 1
                            skill_turns.append((sk, turn_number))

        # total_request_count: token_count events with non-null info in this turn
        request_count = td['request_count'] or None

        # codex_model_context_window: last non-null info.model_context_window in turn,
        # fallback to task_started.model_context_window
        ctx_window = td.get('codex_ctx_window') or td.get('task_started_ctx_window')

        turns_out.append({
            'turn_number':              turn_number,
            'number_of_cycles':         None,
            'builtin_tool_uses':        builtin_tool_use_count,
            'total_request_count':      request_count,
            'turn_duration_secs':       turn_duration,
            'context_usage_percentage': None,  # intentionally NULL; store literal fields instead
            'end_reason':               end_reason,
            'end_timestamp':            end_timestamp,
            'result_status':            None,
            'result_err_kind':          None,
            'model_id':                 td.get('model'),
            'is_sidechain':             None,
            'input_tokens':             None,   # Claude columns — NULL for codex
            'output_tokens':            None,
            'cache_read_tokens':        None,
            'cache_creation_tokens':    None,
            'cache_5m_tokens':          None,
            'cache_1h_tokens':          None,
            'codex_input_tokens':            td['codex_input'],
            'codex_cached_input_tokens':     td['codex_cached_input'],
            'codex_output_tokens':           td['codex_output'],
            'codex_reasoning_output_tokens': td['codex_reasoning'],
            'codex_total_tokens':            td['codex_total'],
            'codex_model_context_window':    ctx_window,
        })

        # messages: from user_message / agent_message event payloads only —
        # response_item message records duplicate the same content; pick one source.
        turn_call_ids = [tc['tool_use_id'] for tc in all_tool_calls if tc['turn_number'] == turn_number]
        for r in turn_recs:
            if r.get('type') != 'event_msg':
                continue
            p     = r.get('payload', {})
            etype = p.get('type', '')
            if etype == 'user_message':
                text = p.get('message', '')
                if text:
                    for sk in _SKILL_RE.findall(text):
                        skill_counts[sk] = skill_counts.get(sk, 0) + 1
                        skill_turns.append((sk, turn_number))
                    seq += 1
                    all_messages.append({
                        'seq': seq, 'turn_number': turn_number, 'role': 'user',
                        'text': text, 'tool_use_ids': None,
                    })
            elif etype == 'agent_message':
                text = p.get('message', '')
                if text or turn_call_ids:
                    seq += 1
                    all_messages.append({
                        'seq': seq, 'turn_number': turn_number, 'role': 'assistant',
                        'text': text or None,
                        'tool_use_ids': turn_call_ids or None,
                    })

    # ── Step E — session record ──────────────────────────────────

    all_timestamps = [r.get('timestamp') for r in records if r.get('timestamp')]
    created_at = all_timestamps[0]  if all_timestamps else ''
    updated_at = all_timestamps[-1] if all_timestamps else ''

    sm = session_meta_payload or {}
    cwd = sm.get('cwd', '')
    if cwd:
        cwd = cwd.replace(str(HOME), '~')

    git_branch = None
    git = sm.get('git') or {}
    if isinstance(git, dict):
        git_branch = git.get('branch') or None

    # title: first user_message text, first line, max 80 chars
    title = '(untitled)'
    for msg in all_messages:
        if msg['role'] == 'user' and msg.get('text'):
            first_line = msg['text'].splitlines()[0].strip()
            if first_line:
                title = first_line[:80]
                break

    # tickets: from title, user messages, and git_branch
    title_tickets = [t.upper() for t in _TICKET_RE.findall(title)]
    ticket_counts = {}
    for msg in all_messages:
        if msg['role'] == 'user' and msg.get('text'):
            for tm in _TICKET_RE.findall(msg['text']):
                t = tm.upper()
                ticket_counts[t] = ticket_counts.get(t, 0) + 1
    if git_branch:
        for tm in _TICKET_RE.findall(git_branch):
            t = tm.upper()
            ticket_counts[t] = ticket_counts.get(t, 0) + 1
    ticket = title_tickets[0] if title_tickets else None  # primary from title only
    ticket_mentions = (
        [(t, 'title', n) for t, n in ((t, title_tickets.count(t)) for t in dict.fromkeys(title_tickets))] +
        [(t, 'prompt', n) for t, n in ticket_counts.items()]
    )

    # primary model: most-used per-turn model_id, lexicographic tie-break
    model_counts: Counter = Counter()
    for t in turns_out:
        if t['model_id']:
            model_counts[t['model_id']] += 1
    primary_model_id = None
    if model_counts:
        max_count = max(model_counts.values())
        candidates = sorted(k for k, v in model_counts.items() if v == max_count)
        primary_model_id = candidates[0]

    model = None
    if primary_model_id:
        model = {
            'model_id':              primary_model_id,
            'model_name':            primary_model_id,
            'description':           None,
            'context_window_tokens': None,
            'rate_multiplier':       None,
            'rate_unit':             None,
        }

    compaction_count = sum(1 for r in records if r.get('type') == 'compacted')

    return {
        'id':                     session_id,
        'title':                  title,
        'cwd':                    cwd,
        'agent':                  'codex-cli',
        'model':                  model,
        'ticket':                 ticket,
        'ticket_mentions':        ticket_mentions,
        'created_at':             created_at,
        'updated_at':             updated_at,
        'session_created_reason': None,
        'message_count':          sum(1 for m in all_messages if m['role'] == 'user'),
        'tool_uses':              sum(t['builtin_tool_uses'] for t in turns_out),
        'request_count':          sum(t['total_request_count'] or 0 for t in turns_out),
        'duration_secs':          sum(t['turn_duration_secs'] or 0 for t in turns_out),
        'cycles':                 0,
        'max_context_pct':        0,
        'compaction_count':       compaction_count,
        'tool_error_count':       sum(tool_errors_map.values()),
        'turns':                  turns_out,
        'messages':               all_messages,
        'tool_calls':             all_tool_calls,
        'skill_counts':           skill_counts,
        'skill_turns':            skill_turns,
        'tool_counts':            tool_counts,
        'file_accesses':          file_accesses,
        'tool_errors':            tool_errors_map,
        'provider':               'codex',
        'git_branch':             git_branch,
    }


# ── Helpers ──────────────────────────────────────────────────────

def _ts_to_secs(ts):
    from datetime import datetime, timezone
    ts = ts.rstrip('Z')
    if '.' in ts:
        dt = datetime.strptime(ts, '%Y-%m-%dT%H:%M:%S.%f')
    else:
        dt = datetime.strptime(ts, '%Y-%m-%dT%H:%M:%S')
    return dt.replace(tzinfo=timezone.utc).timestamp()


def _parse_frontmatter(text):
    if not text.startswith('---'):
        return {}
    end = text.find('\n---', 3)
    if end == -1:
        return {}
    result = {}
    for line in text[3:end].strip().splitlines():
        if ':' in line:
            k, _, v = line.partition(':')
            result[k.strip()] = v.strip().strip('"').strip("'")
    return result
