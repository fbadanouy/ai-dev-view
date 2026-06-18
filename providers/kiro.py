"""Kiro provider adapter — the ONLY module that knows the ~/.kiro layout.

Reads ~/.kiro (never writes it) and emits provider-neutral dicts that
ingest.py persists to ai-dev-view.db. A future provider (Claude Code, ...)
implements these same read_* functions against its own on-disk format;
nothing downstream changes.

Every value emitted here is a literal field from a real file. Extractors
copy fields and measure sizes — they never estimate or reword.
"""
import glob
import json
import os
import re
from datetime import datetime
from pathlib import Path

import config

HOME         = Path.home()
KIRO         = config.provider_path('kiro')
SESSIONS_DIR = KIRO / 'sessions' / 'cli'

_TICKET_RE      = config.ticket_re()
_SKILL_PATH_RE  = re.compile(r'/skills/(?:\.system/)?([a-z][a-z0-9-]+)/SKILL\.md')

PREVIEW_LEN = 700   # chars of real payload kept in result_preview
COMMAND_LEN = 300   # chars of input.command kept in command_preview


def _parse_frontmatter(text):
    """Return dict of simple key:value pairs from a YAML frontmatter block."""
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


# ── Dimensions ───────────────────────────────────────────────────

def read_skills(base=None):
    """Skills from <base>/skills/*/SKILL.md (defaults to ~/.kiro)."""
    base = base or KIRO
    out = []
    for skill_file in sorted(base.glob('skills/*/SKILL.md')):
        try:
            description = _parse_frontmatter(skill_file.read_text()).get('description', '')
        except Exception:
            description = ''
        try:
            created_at = datetime.fromtimestamp(skill_file.stat().st_birthtime).isoformat()
        except Exception:
            created_at = None
        out.append({
            'name':        skill_file.parent.name,
            'description': description,
            'path':        str(skill_file),
            'created_at':  created_at,
        })
    return out


def read_mcps(base=None):
    """MCP servers from <base>/settings/mcp.json (defaults to ~/.kiro)."""
    base = base or KIRO
    mcp_path = base / 'settings' / 'mcp.json'
    if not mcp_path.exists():
        return []
    try:
        servers = json.loads(mcp_path.read_text()).get('mcpServers', {})
    except Exception:
        return []
    return [{
        'server':      name,
        'tool_prefix': f'{name}_',
        'command':     cfg.get('command', ''),
    } for name, cfg in servers.items()]


def read_agents(base=None):
    """Agents from <base>/agents/*.json, with their declared tools/resources."""
    base = base or KIRO
    out = []
    for af in sorted(base.glob('agents/*.json')):
        try:
            data = json.loads(af.read_text())
        except Exception:
            continue
        name = data.get('name', af.stem)

        declares = []
        seen = set()
        for t in data.get('tools', []) + data.get('allowedTools', []):
            ref = str(t)
            if ref not in seen:
                declares.append(('tool', ref))
                seen.add(ref)
        for r in data.get('resources', []):
            if isinstance(r, str):
                ref = r
            elif isinstance(r, dict):
                ref = r.get('source') or r.get('name') or json.dumps(r)
            else:
                ref = str(r)
            declares.append(('resource', ref))

        out.append({
            'name':          name,
            'model':         data.get('model'),
            'tools':         json.dumps(data.get('tools', [])),
            'allowed_tools': json.dumps(data.get('allowedTools', [])),
            'resources':     json.dumps(data.get('resources', [])),
            'hooks':         json.dumps(data.get('hooks', {})),
            'description':   data.get('description'),
            'prompt_path':   data.get('prompt'),
            'declares':      declares,
        })
    return out


def scan_files(base=None, project_root=None):
    """Kiro grimoire docs from a .kiro dir: steering / skill / agent markdown.

    Root-level AGENTS.md is provider-agnostic (read by every tool) and is scanned
    centrally by ingest as provider='shared', not here.
    """
    base = base or KIRO
    SCAN = [
        (str(base / 'steering/**/*.md'),   'steering'),
        (str(base / 'skills/**/SKILL.md'), 'skill'),
        (str(base / 'agents/*.md'),        'agent'),
    ]
    out = []
    for pattern, group in SCAN:
        for path in sorted(glob.glob(pattern, recursive=True)):
            if group == 'steering':
                rel        = os.path.relpath(path, str(base / 'steering')).replace('.md', '')
                name       = rel
                group_name = rel.split('/')[0] if '/' in rel else None
            elif group == 'skill':
                name, group_name = path.split('/skills/')[1].split('/')[0], None
            else:
                name, group_name = os.path.basename(path).replace('.md', ''), None
            out.append({'path': path, 'name': name, 'type': group,
                        'group_name': group_name, 'provider': 'kiro'})
    return out


# ── Tool result extraction ───────────────────────────────────────
# A toolResult's content is a list of {kind: 'text'|'json', data: ...}.
# We keep: the literal status, the measured payload size, a truncated
# head of the real payload, and per-tool literal fields.

def _extract_result_meta(tool_name, items):
    """Copy literal per-tool fields out of json payload items."""
    meta = {}
    for item in items:
        if item.get('kind') != 'json' or not isinstance(item.get('data'), dict):
            continue
        d = item['data']
        if tool_name == 'shell':
            meta['exit_status']  = d.get('exit_status')
            meta['stdout_bytes'] = len(d.get('stdout') or '')
            meta['stderr_bytes'] = len(d.get('stderr') or '')
        elif tool_name == 'grep':
            for k in ('numFiles', 'numMatches', 'truncated'):
                if k in d:
                    meta[k] = d[k]
        elif tool_name == 'glob':
            for k in ('totalFiles', 'truncated'):
                if k in d:
                    meta[k] = d[k]
        elif tool_name == 'web_search':
            for k in ('totalResults', 'error'):
                if k in d and d[k] is not None:
                    meta[k] = d[k]
        elif 'isError' in d:
            meta['isError'] = d['isError']
    return meta or None


def _payload_text(tool_name, items):
    """Concatenate the real textual payload of a result, for the preview."""
    parts = []
    for item in items:
        kind = item.get('kind')
        if kind == 'text':
            parts.append(str(item.get('data', '')))
        elif kind == 'json':
            d = item.get('data')
            if tool_name == 'shell' and isinstance(d, dict):
                for k in ('stdout', 'stderr'):
                    if d.get(k):
                        parts.append(d[k])
            else:
                parts.append(json.dumps(d))
    return '\n'.join(p for p in parts if p)


def _extract_result(tool_name, tool_result):
    """tool_result = {toolUseId, status, content: [...]} from a ToolResults entry."""
    items = tool_result.get('content') or []
    text  = _payload_text(tool_name, items)
    meta  = _extract_result_meta(tool_name, items)
    return {
        'result_status':    tool_result.get('status'),
        'result_bytes':     len(json.dumps(items)),
        'result_preview':   text[:PREVIEW_LEN] or None,
        'result_truncated': 1 if len(text) > PREVIEW_LEN else 0,
        'result_meta':      json.dumps(meta) if meta else None,
    }


# ── Sessions ─────────────────────────────────────────────────────

def read_sessions(limit=None):
    """Yield one provider-neutral record per session under ~/.kiro/sessions/cli."""
    json_files = sorted(SESSIONS_DIR.glob('*.json'), key=os.path.getmtime, reverse=True)
    if limit:
        json_files = json_files[:limit]
    for jf in json_files:
        try:
            meta = json.loads(jf.read_text())
        except Exception:
            continue
        if not meta.get('session_id'):
            continue
        yield _parse_session(jf, meta)


def _parse_session(jf, meta):
    session_id = meta['session_id']
    state      = meta.get('session_state') or {}
    turns_meta = (state.get('conversation_metadata') or {}).get('user_turn_metadatas', [])

    # Agent from session_state.agent_name (the real field).
    # loop_id.agent_id.name always says kiro_default even for custom agents.
    agent = state.get('agent_name') or 'kiro_default'

    # Model from session_state.rts_model_state.model_info.
    # model_id == "auto" means Kiro chose dynamically — we can't know which model ran.
    mi    = ((state.get('rts_model_state') or {}).get('model_info') or {})
    model = None
    if mi.get('model_id') and mi.get('model_id') != 'auto':
        model = {
            'model_id':              mi.get('model_id'),
            'model_name':            mi.get('model_name'),
            'description':           mi.get('description'),
            'context_window_tokens': mi.get('context_window_tokens'),
            'rate_multiplier':       mi.get('rate_multiplier'),
            'rate_unit':             mi.get('rate_unit'),
        }

    title = meta.get('title', '')
    title_tickets = [t.upper() for t in _TICKET_RE.findall(title)]

    # message_id → turn_number: the real linkage between stream and turn metadata
    mid_to_turn = {}
    for i, t in enumerate(turns_meta):
        for mid in (t.get('message_ids') or []):
            if mid:
                mid_to_turn[mid] = i + 1

    turns = []
    for i, t in enumerate(turns_meta):
        ctx    = t.get('context_usage_percentage')
        result = t.get('result') or {}
        if 'Ok' in result:
            result_status, result_err_kind = 'ok', None
        elif 'Err' in result:
            result_status   = 'err'
            result_err_kind = ((result.get('Err') or {})
                               .get('Stream', {}).get('kind', {}).get('kind'))
        else:
            result_status, result_err_kind = None, None
        turns.append({
            'turn_number':              i + 1,
            'number_of_cycles':         t.get('number_of_cycles'),
            'builtin_tool_uses':        t.get('builtin_tool_uses'),
            'total_request_count':      t.get('total_request_count'),
            'turn_duration_secs':       t.get('turn_duration', {}).get('secs') or None,
            'context_usage_percentage': round(ctx, 4) if ctx else None,
            'end_reason':               t.get('end_reason'),
            'end_timestamp':            t.get('end_timestamp'),
            'result_status':            result_status,
            'result_err_kind':          result_err_kind,
        })
    turn_end_reason = {t['turn_number']: t['end_reason'] for t in turns}

    parsed = _parse_jsonl(jf.with_suffix('.jsonl'), mid_to_turn)

    # Primary ticket: first in title, else first mentioned in a prompt.
    # ALL mentions are also emitted, with literal counts per source.
    ticket = title_tickets[0] if title_tickets else None  # primary from title only
    ticket_mentions = (
        [(t, 'title', n) for t, n in ((t, title_tickets.count(t)) for t in dict.fromkeys(title_tickets))] +
        [(t, 'prompt', n) for t, n in parsed['ticket_counts'].items()]
    )

    # Rejected tool calls: the last toolUse of a turn that ended ToolUseRejected
    rejected_ids = set()
    for turn_num, end_reason in turn_end_reason.items():
        if end_reason == 'ToolUseRejected':
            last_id = None
            for tid, ta in parsed['tool_call_attempts'].items():
                if ta['turn_number'] == turn_num:
                    last_id = tid
            if last_id:
                rejected_ids.add(last_id)

    tool_calls = []
    for tid, attempt in parsed['tool_call_attempts'].items():
        res = parsed['tool_call_results'].get(tid)
        if tid in rejected_ids:
            outcome, error_msg = 'rejected', None
        elif res is None:
            outcome, error_msg = 'unknown', None
        elif res['success']:
            outcome, error_msg = 'success', None
        else:
            outcome, error_msg = 'error', res['error_msg']
        payload = parsed['tool_call_payloads'].get(tid) or {}
        tool_calls.append({
            'tool_use_id':      tid,
            'turn_number':      attempt['turn_number'],
            'tool_name':        attempt['tool_name'],
            'purpose':          attempt['purpose'],
            'command_preview':  attempt['command'],
            'mcp_server':       attempt['mcp_server'],
            'outcome':          outcome,
            'error_msg':        error_msg,
            'result_status':    payload.get('result_status'),
            'result_bytes':     payload.get('result_bytes'),
            'result_preview':   payload.get('result_preview'),
            'result_truncated': payload.get('result_truncated'),
            'result_meta':      payload.get('result_meta'),
        })

    ctx_pcts = [t.get('context_usage_percentage') for t in turns if t.get('context_usage_percentage')]
    return {
        'id':                     session_id,
        'provider':               'kiro',
        'title':                  title[:80] if title else '(untitled)',
        'cwd':                    meta.get('cwd', '').replace(str(HOME), '~'),
        'agent':                  agent,
        'model':                  model,                      # dict or None
        'ticket':                 ticket,
        'ticket_mentions':        ticket_mentions,            # [(ticket, source, count)]
        'created_at':             meta.get('created_at', ''),
        'updated_at':             meta.get('updated_at', ''),
        'session_created_reason': meta.get('session_created_reason'),
        'message_count':          parsed['prompt_count'],
        'tool_uses':              sum(t.get('builtin_tool_uses') or 0 for t in turns),
        'request_count':          sum(t.get('total_request_count') or 0 for t in turns),
        'duration_secs':          sum(t.get('turn_duration_secs') or 0 for t in turns),
        'cycles':                 sum(t.get('number_of_cycles') or 0 for t in turns),
        'max_context_pct':        round(max(ctx_pcts), 2) if ctx_pcts else 0,
        'compaction_count':       parsed['compaction_count'],
        'tool_error_count':       sum(parsed['tool_errors'].values()),
        'turns':                  turns,
        'messages':               parsed['messages'],
        'tool_calls':             tool_calls,
        'skill_counts':           parsed['skill_counts'],
        'skill_turns':            parsed['skill_turns'],
        'tool_counts':            parsed['tool_counts'],
        'file_accesses':          parsed['file_accesses'],
        'tool_errors':            parsed['tool_errors'],
    }


def _parse_jsonl(jl, mid_to_turn):
    """One pass over the message stream. Returns messages, tool calls, and counters."""
    out = {
        'messages':           [],   # {seq, turn_number, role, text, tool_use_ids}
        'tool_call_attempts': {},   # toolUseId → {tool_name, purpose, command, turn_number, mcp_server}
        'tool_call_results':  {},   # toolUseId → {success, error_msg}
        'tool_call_payloads': {},   # toolUseId → result_* fields
        'skill_counts':       {},   # skill (raw /name token) → count; ingest filters to real skills
        'skill_turns':        [],   # (skill, turn_number) per detection; turn anchor for attribution
        'tool_counts':        {},   # tool_name → count (builtin and mcp alike; mcp_server tags them)
        'file_accesses':      {},   # (op, path) → count
        'tool_errors':        {},   # error_msg → count
        'prompt_count':       0,
        'compaction_count':   0,
        'ticket_counts':      {},   # ticket → prompt mention count (insertion = first-mention order)
    }
    if not jl.exists():
        return out

    tool_names = {}   # toolUseId → tool_name, for the payload extractor
    seq = 0
    prompt_ordinal = 0
    try:
        lines = jl.read_text().splitlines()
    except Exception:
        return out

    for line in lines:
        if not line.strip():
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        kind = msg.get('kind')
        data = msg.get('data', {})

        if kind == 'Prompt':
            out['prompt_count'] += 1
            prompt_ordinal += 1
            mid  = data.get('message_id')
            turn = mid_to_turn.get(mid) or prompt_ordinal
            text = ' '.join(
                item.get('data', '') for item in data.get('content', [])
                if item.get('kind') == 'text'
            )
            if text:
                # Skills: explicit /skill-name invocations only (no fuzzy matching)
                for sk in re.findall(r'/([a-z][a-z0-9-]+)', text):
                    out['skill_counts'][sk] = out['skill_counts'].get(sk, 0) + 1
                    out['skill_turns'].append((sk, turn))
                for tm in _TICKET_RE.findall(text):
                    t = tm.upper()
                    out['ticket_counts'][t] = out['ticket_counts'].get(t, 0) + 1
                seq += 1
                out['messages'].append({
                    'seq': seq, 'turn_number': turn, 'role': 'user',
                    'text': text, 'tool_use_ids': None,
                })

        elif kind == 'AssistantMessage':
            mid     = data.get('message_id')
            turn    = mid_to_turn.get(mid) or (prompt_ordinal or None)
            content = data.get('content', [])
            text = ' '.join(
                item.get('data', '') for item in content
                if item.get('kind') == 'text'
            )
            tool_use_ids = []
            for item in content:
                if item.get('kind') != 'toolUse':
                    continue
                td        = item.get('data', {})
                tool_name = td.get('name', '')
                tool_id   = td.get('toolUseId', '')
                inp       = td.get('input') or {}
                command   = inp.get('command')
                if command and len(command) > COMMAND_LEN:
                    command = command[:COMMAND_LEN]
                if tool_name:
                    out['tool_counts'][tool_name] = out['tool_counts'].get(tool_name, 0) + 1
                if tool_id and tool_name:
                    tool_use_ids.append(tool_id)
                    tool_names[tool_id] = tool_name
                    out['tool_call_attempts'][tool_id] = {
                        'tool_name':   tool_name,
                        'purpose':     inp.get('__tool_use_purpose'),
                        'command':     command,
                        'turn_number': turn,
                        'mcp_server':  None,   # ingest maps via mcp prefixes
                    }
            if text or tool_use_ids:
                seq += 1
                out['messages'].append({
                    'seq': seq, 'turn_number': turn, 'role': 'assistant',
                    'text': text, 'tool_use_ids': tool_use_ids or None,
                })

        elif kind == 'ToolResults':
            # data.results: dict toolUseId → {tool: {kind...}, result: {Success|Error}}
            for tool_id, res in (data.get('results') or {}).items():
                if not isinstance(res, dict):
                    continue
                builtin = (((res.get('tool') or {}).get('kind') or {}).get('BuiltIn') or {})
                if isinstance(builtin, dict):
                    if 'FileRead' in builtin:
                        for op in builtin['FileRead'].get('operations', []):
                            p = op.get('path')
                            if p:
                                p = p.replace(str(HOME), '~')
                                out['file_accesses'][('read', p)] = out['file_accesses'].get(('read', p), 0) + 1
                                m = _SKILL_PATH_RE.search(p)
                                if m:
                                    sk = m.group(1)
                                    out['skill_counts'][sk] = out['skill_counts'].get(sk, 0) + 1
                                    out['skill_turns'].append(
                                        (sk, out['tool_call_attempts'].get(tool_id, {}).get('turn_number')))
                    elif 'FileWrite' in builtin:
                        p = builtin['FileWrite'].get('path')
                        if p:
                            p = p.replace(str(HOME), '~')
                            out['file_accesses'][('write', p)] = out['file_accesses'].get(('write', p), 0) + 1
                result    = res.get('result') or {}
                error_msg = None
                if isinstance(result, dict) and 'Error' in result:
                    err = result['Error']
                    txt = (err.get('Custom', str(err)) if isinstance(err, dict) else str(err))
                    txt = txt.replace(str(HOME), '~')
                    out['tool_errors'][txt] = out['tool_errors'].get(txt, 0) + 1
                    error_msg = txt
                out['tool_call_results'][tool_id] = {
                    'success':   error_msg is None,
                    'error_msg': error_msg,
                }
            # data.content: [{kind: 'toolResult', data: {toolUseId, status, content}}]
            for item in (data.get('content') or []):
                tr  = item.get('data', {})
                tid = tr.get('toolUseId')
                if tid:
                    out['tool_call_payloads'][tid] = _extract_result(tool_names.get(tid, ''), tr)

        elif kind == 'Compaction':
            out['compaction_count'] += 1

    return out


# ── On-demand full payload ───────────────────────────────────────

def get_full_tool_result(session_id, tool_use_id):
    """Full input + result for ONE tool call, read live from the session JSONL.

    This is the single sanctioned live read in the API — used only when the
    UI asks to expand a tool call beyond the stored preview.
    """
    jl = SESSIONS_DIR / f'{session_id}.jsonl'
    if not jl.exists():
        return None

    found = None
    for line in jl.read_text().splitlines():
        if tool_use_id not in line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        kind = msg.get('kind')
        data = msg.get('data', {})
        if kind == 'AssistantMessage':
            for item in data.get('content', []):
                if item.get('kind') == 'toolUse' and item.get('data', {}).get('toolUseId') == tool_use_id:
                    td    = item['data']
                    found = found or {}
                    found['tool_use_id'] = tool_use_id
                    found['tool_name']   = td.get('name')
                    found['input']       = td.get('input')
        elif kind == 'ToolResults':
            for item in (data.get('content') or []):
                tr = item.get('data', {})
                if tr.get('toolUseId') == tool_use_id:
                    found = found or {'tool_use_id': tool_use_id}
                    found['status'] = tr.get('status')
                    found['result'] = tr.get('content')
    return found
