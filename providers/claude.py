"""Claude Code provider adapter — reads ~/.claude (never writes it).

Emits provider-neutral dicts with the same shape as kiro.py:332-358,
plus 'provider' and 'git_branch' keys and per-turn token/model fields.

CRITICAL: streaming-dedupe rule — assistant records repeat in JSONL as
content streams, each carrying cumulative usage. Keep the LAST occurrence
per message id so token sums are not doubled (documented in claude-view).
"""
import json
import os
import re
from collections import Counter
from pathlib import Path

import config

HOME        = Path.home()
CLAUDE      = config.provider_path('claude')
PROJECTS_DIR = CLAUDE / 'projects'

PREVIEW_LEN = 700   # mirror kiro.py
COMMAND_LEN = 300   # mirror kiro.py

_SKILL_RE  = re.compile(r'/([a-z][a-z0-9-]+)')
_TICKET_RE = config.ticket_re()

# Claude Code records an explicit slash-command invocation as a harness block
# <command-name>/foo</command-name> (plugin skills come through namespaced as
# /plugin:skill). This is the canonical "the user invoked /skill" signal — the
# free-text _SKILL_RE never sees it because _is_real_prompt strips harness blocks.
# We take the last ':'-segment so /frontend-design:frontend-design → frontend-design;
# non-skill built-ins (/compact, /model, …) fall out at the actual-skill filter.
_COMMAND_NAME_RE = re.compile(r'<command-name>\s*/?([a-z0-9:_-]+)\s*</command-name>', re.I)

# Harness-injected blocks inside user messages (system reminders, ! command
# output, slash-command groups). Their content is data, not the user's words —
# stripped before ticket matching so pass-through IDs don't count as mentions.
_HARNESS_RE = re.compile(
    r'<(system-reminder|local-command-stdout|local-command-caveat|'
    r'command-name|command-message|command-args|task-notification)>'
    r'[\s\S]*?</\1>'
)


# ── Dimensions ───────────────────────────────────────────────────

def read_skills(base=None):
    base = base or CLAUDE
    skills_dir = base / 'skills'
    if not skills_dir.exists():
        return []
    out = []
    for skill_file in sorted(skills_dir.glob('*/SKILL.md')):
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
            'provider':    'claude',
        })
    return out


def read_plugin_skills():
    """Skills from the home Claude plugin cache (~/.claude/plugins/cache)."""
    cache = CLAUDE / 'plugins' / 'cache'
    out = []
    for skill_file in sorted(cache.glob('*/*/*/skills/*/SKILL.md')):
        try:
            description = _parse_frontmatter(skill_file.read_text()).get('description', '')
        except Exception:
            description = ''
        out.append({'name': skill_file.parent.name, 'description': description,
                    'path': str(skill_file), 'created_at': None, 'provider': 'claude'})
    return out


def read_plugin_agents():
    """Agents from the home Claude plugin cache (~/.claude/plugins/cache)."""
    cache = CLAUDE / 'plugins' / 'cache'
    out = []
    for af in sorted(cache.glob('*/*/*/agents/*.md')):
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
            'provider':      'claude',
        })
    return out


def read_mcps(project_root=None):
    if project_root is None:
        cfg_path = HOME / '.claude.json'
        if not cfg_path.exists():
            return []
        try:
            servers = json.loads(cfg_path.read_text()).get('mcpServers', {})
        except Exception:
            return []
    else:
        cfg_path = project_root / '.mcp.json'
        if not cfg_path.exists():
            return []
        try:
            servers = json.loads(cfg_path.read_text()).get('mcpServers', {})
        except Exception:
            return []
    return [{
        'server':      name,
        'tool_prefix': f'mcp__{name}__',
        'command':     cfg.get('command', ''),
        'provider':    'claude',
    } for name, cfg in servers.items()]


def read_agents(base=None):
    base = base or CLAUDE
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
            'provider':      'claude',
        })
    return out


def scan_files():
    # Kiro grimoire concept doesn't map to Claude Code in v1
    return []


# ── Sessions ─────────────────────────────────────────────────────

def read_sessions(limit=None):
    """Yield one provider-neutral record per .jsonl under ~/.claude/projects/*/."""
    if not PROJECTS_DIR.exists():
        print('  claude: not found, skipped')
        return

    files = []
    for jsonl in PROJECTS_DIR.glob('*/*.jsonl'):
        # skip subagent files (handled inside _parse_claude_jsonl)
        if '/subagents/' in str(jsonl):
            continue
        files.append(jsonl)
    files.sort(key=os.path.getmtime, reverse=True)
    if limit:
        files = files[:limit]

    for jl in files:
        try:
            rec = _parse_claude_session(jl)
        except Exception:
            continue
        if rec:
            yield rec


# ── Core parser ──────────────────────────────────────────────────

def _parse_claude_session(jl):
    """Parse one .jsonl session file and return a provider-neutral record."""
    lines = []
    try:
        lines = jl.read_text().splitlines()
    except Exception:
        return None

    # Step A — single pass, streaming-dedupe on assistant records.
    # Key: message.id or record uuid. Last occurrence wins.
    raw_records = []        # all records in order (after dedupe for assistant)
    assistant_by_id = {}    # id → (index-in-raw_records, record) — for dedupe
    last_ai_title = None
    session_id = jl.stem

    for line in lines:
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue

        rtype = rec.get('type', '')

        if rtype == 'ai-title':
            last_ai_title = rec.get('aiTitle')
            raw_records.append(rec)
            continue

        if rtype == 'assistant':
            msg = rec.get('message') or {}
            msg_id = msg.get('id') or rec.get('uuid', '')
            if msg_id in assistant_by_id:
                # overwrite in-place so order is preserved at first position
                idx, _ = assistant_by_id[msg_id]
                raw_records[idx] = rec
                assistant_by_id[msg_id] = (idx, rec)
            else:
                idx = len(raw_records)
                raw_records.append(rec)
                assistant_by_id[msg_id] = (idx, rec)
            continue

        raw_records.append(rec)

    # Collect subagent files if present
    subagent_dir = jl.parent / jl.stem / 'subagents'
    subagent_records = []
    if subagent_dir.exists():
        for sa_jl in sorted(subagent_dir.glob('*.jsonl')):
            sub_recs = _load_jsonl_deduped(sa_jl)
            for r in sub_recs:
                r['isSidechain'] = True  # mark as sidechain
            subagent_records.extend(sub_recs)

    all_records = raw_records + subagent_records

    # Step B — turn segmentation.
    # A user record with real prompt content opens a new turn.
    # Tool-result-only user records do NOT open turns.
    turns_data = []      # list of {'records': [...], 'turn_number': n}
    current_turn = None

    for rec in all_records:
        rtype = rec.get('type', '')
        if rtype == 'user':
            if _is_real_prompt(rec):
                current_turn = {'records': [rec], 'turn_number': len(turns_data) + 1}
                turns_data.append(current_turn)
            elif current_turn is not None:
                current_turn['records'].append(rec)
        elif current_turn is not None:
            current_turn['records'].append(rec)
        # records before the first real prompt are silently ignored

    # Step C + D — extract per-turn values and tool calls
    turns = []
    all_tool_calls = []
    all_messages = []
    seq = 0
    skill_counts = {}
    tool_counts = {}
    file_accesses = {}
    tool_errors_map = {}

    # build tool_result lookup: tool_use_id → (is_error, content_str)
    # from user records' message.content tool_result blocks
    tool_results_lookup = {}  # tool_use_id → {'is_error': bool, 'content': str}
    for rec in all_records:
        if rec.get('type') != 'user':
            continue
        msg = rec.get('message') or {}
        content = msg.get('content') if isinstance(msg, dict) else []
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get('type') == 'tool_result':
                tid = block.get('tool_use_id', '')
                is_err = bool(block.get('is_error'))
                inner = block.get('content', '')
                if isinstance(inner, list):
                    parts = []
                    for c in inner:
                        if isinstance(c, dict) and c.get('type') == 'text':
                            parts.append(c.get('text', ''))
                        elif isinstance(c, str):
                            parts.append(c)
                    inner = '\n'.join(parts)
                elif not isinstance(inner, str):
                    inner = json.dumps(inner)
                tool_results_lookup[tid] = {'is_error': is_err, 'content': inner}

    for turn_info in turns_data:
        turn_recs = turn_info['records']
        turn_num  = turn_info['turn_number']

        is_sidechain = 1 if any(r.get('isSidechain') for r in turn_recs) else 0

        # collect deduped assistant records for this turn (already deduped globally)
        asst_recs = [r for r in turn_recs if r.get('type') == 'assistant']

        # model_id: last assistant record's model
        model_id = None
        for r in asst_recs:
            mid = (r.get('message') or {}).get('model')
            if mid:
                model_id = mid

        # request ids
        request_ids = set()
        for r in asst_recs:
            rid = r.get('requestId')
            if rid:
                request_ids.add(rid)

        # token sums from usage fields
        tok = {'input': 0, 'output': 0, 'cache_read': 0,
               'cache_creation': 0, 'cache_5m': None, 'cache_1h': None}
        for r in asst_recs:
            usage = (r.get('message') or {}).get('usage') or {}
            tok['input']           += usage.get('input_tokens', 0) or 0
            tok['output']          += usage.get('output_tokens', 0) or 0
            tok['cache_read']      += usage.get('cache_read_input_tokens', 0) or 0
            tok['cache_creation']  += usage.get('cache_creation_input_tokens', 0) or 0
            cc = usage.get('cache_creation') or {}
            v5m = cc.get('ephemeral_5m_input_tokens')
            v1h = cc.get('ephemeral_1h_input_tokens')
            if v5m is not None:
                tok['cache_5m'] = (tok['cache_5m'] or 0) + v5m
            if v1h is not None:
                tok['cache_1h'] = (tok['cache_1h'] or 0) + v1h

        # turn timestamps + duration
        timestamps = []
        for r in turn_recs:
            ts = r.get('timestamp')
            if ts:
                timestamps.append(ts)
        turn_duration = None
        if len(timestamps) >= 2:
            try:
                turn_duration = int(_ts_to_secs(timestamps[-1]) - _ts_to_secs(timestamps[0]))
            except Exception:
                pass

        # builtin tool uses: count tool_use blocks across assistant records
        builtin_tool_use_count = 0
        turn_tool_calls = []
        for r in asst_recs:
            msg_content = (r.get('message') or {}).get('content') or []
            for block in msg_content:
                if not isinstance(block, dict):
                    continue
                if block.get('type') != 'tool_use':
                    continue
                builtin_tool_use_count += 1
                tool_id   = block.get('id', '')
                tool_name = block.get('name', '')
                inp       = block.get('input') or {}
                command   = inp.get('command')
                if command and len(command) > COMMAND_LEN:
                    command = command[:COMMAND_LEN]
                purpose = inp.get('description')

                mcp_server = None
                if tool_name.startswith('mcp__'):
                    parts = tool_name.split('__')
                    if len(parts) >= 2:
                        mcp_server = parts[1]

                if tool_name:
                    tool_counts[tool_name] = tool_counts.get(tool_name, 0) + 1
                    if tool_name in ('Read', 'Write', 'Edit', 'NotebookEdit'):
                        path = inp.get('file_path')
                        if path:
                            path = path.replace(str(HOME), '~')
                            op = 'read' if tool_name == 'Read' else 'write'
                            file_accesses[(op, path)] = file_accesses.get((op, path), 0) + 1

                res_info = tool_results_lookup.get(tool_id)
                if res_info is None:
                    outcome, error_msg = 'unknown', None
                    result_bytes, result_preview, result_truncated = None, None, None
                elif res_info['is_error']:
                    content_str = res_info['content']
                    outcome     = 'error'
                    error_msg   = content_str[:COMMAND_LEN]
                    txt = content_str.replace(str(HOME), '~')
                    tool_errors_map[txt] = tool_errors_map.get(txt, 0) + 1
                    result_bytes     = len(json.dumps(res_info['content']))
                    result_preview   = content_str[:PREVIEW_LEN] or None
                    result_truncated = 1 if len(content_str) > PREVIEW_LEN else 0
                else:
                    content_str      = res_info['content']
                    outcome          = 'success'
                    error_msg        = None
                    result_bytes     = len(json.dumps(res_info['content']))
                    result_preview   = content_str[:PREVIEW_LEN] or None
                    result_truncated = 1 if len(content_str) > PREVIEW_LEN else 0

                turn_tool_calls.append({
                    'tool_use_id':      tool_id,
                    'turn_number':      turn_num,
                    'tool_name':        tool_name,
                    'purpose':          purpose,
                    'command_preview':  command,
                    'mcp_server':       mcp_server,
                    'outcome':          outcome,
                    'error_msg':        error_msg,
                    'result_status':    None,
                    'result_bytes':     result_bytes,
                    'result_preview':   result_preview,
                    'result_truncated': result_truncated,
                    'result_meta':      None,
                })

        all_tool_calls.extend(turn_tool_calls)

        # end reason / timestamp from last assistant record
        last_asst = asst_recs[-1] if asst_recs else None
        end_reason    = (last_asst.get('message') or {}).get('stop_reason') if last_asst else None
        end_timestamp = last_asst.get('timestamp') if last_asst else None

        turns.append({
            'turn_number':              turn_num,
            'number_of_cycles':         None,      # Kiro-only
            'builtin_tool_uses':        builtin_tool_use_count,
            'total_request_count':      len(request_ids),
            'turn_duration_secs':       turn_duration,
            'context_usage_percentage': None,      # would require assuming context window
            'end_reason':               end_reason,
            'end_timestamp':            end_timestamp,
            'result_status':            None,
            'result_err_kind':          None,
            'model_id':                 model_id,
            'is_sidechain':             is_sidechain,
            'input_tokens':             tok['input'] or None,
            'output_tokens':            tok['output'] or None,
            'cache_read_tokens':        tok['cache_read'] or None,
            'cache_creation_tokens':    tok['cache_creation'] or None,
            'cache_5m_tokens':          tok['cache_5m'],
            'cache_1h_tokens':          tok['cache_1h'],
        })

        # messages: user prompt + assistant text. Slash-command / stdout records
        # are no longer turn-openers (see _is_real_prompt) but still render — as
        # system-only strips — under the real turn they occurred in. Only
        # tool-result-only records (no extractable text) are dropped here.
        for r in turn_recs:
            rtype = r.get('type', '')
            if rtype == 'user':
                text = _extract_user_text(r)
                if not text:
                    continue  # tool-result-only → not a message
                if _is_real_prompt(r):
                    for sk in _SKILL_RE.findall(text):
                        skill_counts[sk] = skill_counts.get(sk, 0) + 1
                # Explicit slash-command invocations live in <command-name> blocks,
                # which are stripped from real-prompt text — count them separately.
                for cmd in _COMMAND_NAME_RE.findall(text):
                    sk = cmd.lstrip('/').split(':')[-1].lower()
                    if sk:
                        skill_counts[sk] = skill_counts.get(sk, 0) + 1
                seq += 1
                all_messages.append({
                    'seq': seq, 'turn_number': turn_num, 'role': 'user',
                    'text': text, 'tool_use_ids': None,
                })
            elif rtype == 'assistant':
                msg_content = (r.get('message') or {}).get('content') or []
                text_parts = []
                tool_ids = []
                for block in msg_content:
                    if not isinstance(block, dict):
                        continue
                    if block.get('type') == 'text':
                        text_parts.append(block.get('text', ''))
                    elif block.get('type') == 'tool_use':
                        tid = block.get('id')
                        if tid:
                            tool_ids.append(tid)
                text = ' '.join(p for p in text_parts if p) or None
                if text or tool_ids:
                    seq += 1
                    all_messages.append({
                        'seq': seq, 'turn_number': turn_num, 'role': 'assistant',
                        'text': text, 'tool_use_ids': tool_ids or None,
                    })

    # Step E — session-level fields
    all_timestamps = [r.get('timestamp') for r in all_records if r.get('timestamp')]
    created_at  = all_timestamps[0]  if all_timestamps else ''
    updated_at  = all_timestamps[-1] if all_timestamps else ''

    # cwd: most common across records
    cwds = [r.get('cwd') for r in all_records if r.get('cwd')]
    cwd = Counter(cwds).most_common(1)[0][0].replace(str(HOME), '~') if cwds else ''

    # git_branch: most recent non-empty
    git_branch = None
    for r in reversed(all_records):
        gb = r.get('gitBranch')
        if gb:
            git_branch = gb
            break

    # primary model: most-used model_id across turns, lexicographic tie-break
    model_counts: Counter = Counter()
    for t in turns:
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
            'model_name':            primary_model_id,  # literal; no separate name field
            'description':           None,
            'context_window_tokens': None,
            'rate_multiplier':       None,
            'rate_unit':             None,
        }

    # title from last ai-title record
    title = last_ai_title or '(untitled)'

    # tickets
    title_tickets = [t.upper() for t in _TICKET_RE.findall(title)]
    ticket_counts = {}
    for msg in all_messages:
        if msg['role'] == 'user' and msg.get('text'):
            for tm in _TICKET_RE.findall(_HARNESS_RE.sub('', msg['text'])):
                t = tm.upper()
                ticket_counts[t] = ticket_counts.get(t, 0) + 1
    ticket = title_tickets[0] if title_tickets else None  # primary from title only
    ticket_mentions = (
        [(t, 'title', n) for t, n in ((t, title_tickets.count(t)) for t in dict.fromkeys(title_tickets))] +
        [(t, 'prompt', n) for t, n in ticket_counts.items()]
    )

    # compaction_count: system records with compaction subtype
    compaction_count = sum(
        1 for r in all_records
        if r.get('type') == 'system' and r.get('subtype') in ('compaction', 'compact')
    )

    return {
        'id':                     session_id,
        'title':                  title[:80],
        'cwd':                    cwd,
        'agent':                  'claude-code',
        'model':                  model,
        'ticket':                 ticket,
        'ticket_mentions':        ticket_mentions,
        'created_at':             created_at,
        'updated_at':             updated_at,
        'session_created_reason': None,
        'message_count':          sum(1 for m in all_messages if m['role'] == 'user'),
        'tool_uses':              sum(t['builtin_tool_uses'] for t in turns),
        'request_count':          sum(t['total_request_count'] for t in turns),
        'duration_secs':          sum(t['turn_duration_secs'] or 0 for t in turns),
        'cycles':                 0,
        'max_context_pct':        0,
        'compaction_count':       compaction_count,
        'tool_error_count':       sum(tool_errors_map.values()),
        'turns':                  turns,
        'messages':               all_messages,
        'tool_calls':             all_tool_calls,
        'skill_counts':           skill_counts,
        'tool_counts':            tool_counts,
        'file_accesses':          file_accesses,
        'tool_errors':            tool_errors_map,
        # NEW keys
        'provider':               'claude',
        'git_branch':             git_branch,
    }


# ── Helpers ──────────────────────────────────────────────────────

def _load_jsonl_deduped(jl):
    """Load a JSONL file applying the same streaming-dedupe as the main parser."""
    records = []
    assistant_by_id = {}
    try:
        lines = jl.read_text().splitlines()
    except Exception:
        return []
    for line in lines:
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get('type') == 'assistant':
            msg_id = (rec.get('message') or {}).get('id') or rec.get('uuid', '')
            if msg_id in assistant_by_id:
                idx, _ = assistant_by_id[msg_id]
                records[idx] = rec
                assistant_by_id[msg_id] = (idx, rec)
            else:
                idx = len(records)
                records.append(rec)
                assistant_by_id[msg_id] = (idx, rec)
        else:
            records.append(rec)
    return records


def _is_real_prompt(rec):
    """True if this user record opens a new turn (has real text content).

    Harness-only records — slash-command groups (/model, /effort, …) and their
    local-command output — are noise, not the user's words. They must not open a
    turn: stripping _HARNESS_RE leaves nothing real behind. (Same definition the
    UI uses in cleanClaudeText to render these as system-only strips.)
    """
    if rec.get('isMeta') or rec.get('isSidechain'):
        return False
    msg = rec.get('message') or {}
    content = msg.get('content') if isinstance(msg, dict) else msg
    if isinstance(content, str):
        return bool(_HARNESS_RE.sub('', content).strip())
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict):
                if block.get('type') == 'tool_result':
                    continue  # tool-result-only → not a real prompt
                if block.get('type') == 'text' and _HARNESS_RE.sub('', block.get('text', '')).strip():
                    return True
            elif isinstance(block, str) and _HARNESS_RE.sub('', block).strip():
                return True
        # nothing but tool_result / harness blocks → not a real prompt
        return False
    return False


def _extract_user_text(rec):
    msg = rec.get('message') or {}
    content = msg.get('content') if isinstance(msg, dict) else msg
    if isinstance(content, str):
        return content.strip() or None
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get('type') == 'text':
                parts.append(block.get('text', ''))
            elif isinstance(block, str):
                parts.append(block)
        return ' '.join(p for p in parts if p).strip() or None
    return None


def _ts_to_secs(ts):
    """Parse an ISO 8601 timestamp to float seconds since epoch."""
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
