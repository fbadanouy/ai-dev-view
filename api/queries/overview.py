"""Cross-provider analytics overview, bucketed by day/week/month.

Universal series (sessions, messages, tool calls, errors) cover every
provider. Token/cycle series are per-provider because providers don't
record the same metrics — kiro has no tokens, codex has no context, etc.
Buckets with no data are null, never zero-filled fabrications.
"""
from ..db import query

_BUCKETS = {
    'day':   '%Y-%m-%d',
    'week':  '%Y-W%W',
    'month': '%Y-%m',
}


def get_overview(bucket='week'):
    fmt = _BUCKETS.get(bucket, _BUCKETS['week'])

    universal = query(f'''
        SELECT strftime('{fmt}', created_at) AS b, provider,
               COUNT(*)              AS sessions,
               SUM(message_count)    AS messages,
               SUM(tool_uses)        AS tool_uses,
               SUM(tool_error_count) AS errors
        FROM sessions
        WHERE created_at != ''
        GROUP BY 1, 2
    ''')

    tokens = query(f'''
        SELECT strftime('{fmt}', s.created_at) AS b, s.provider,
               SUM(v.input_tokens)                  AS input_tokens,
               SUM(v.output_tokens)                 AS output_tokens,
               SUM(v.cache_read_tokens)             AS cache_read,
               SUM(v.cache_creation_tokens)         AS cache_write,
               SUM(v.codex_total_tokens)            AS codex_total,
               SUM(v.codex_reasoning_output_tokens) AS codex_reasoning
        FROM sessions s
        JOIN v_session_tokens v ON v.session_id = s.id
        WHERE s.created_at != ''
        GROUP BY 1, 2
    ''')

    kiro = query(f'''
        SELECT strftime('{fmt}', created_at) AS b,
               SUM(cycles)               AS cycles,
               ROUND(AVG(max_context_pct), 1) AS avg_ctx_pct
        FROM sessions
        WHERE provider = 'kiro' AND created_at != ''
        GROUP BY 1
    ''')

    buckets = sorted({r['b'] for r in universal})
    idx = {b: i for i, b in enumerate(buckets)}

    def series(rows, field, provider=None):
        out = [None] * len(buckets)
        for r in rows:
            if provider and r.get('provider') != provider:
                continue
            if r['b'] in idx and r[field] is not None:
                out[idx[r['b']]] = r[field]
        return out

    return {
        'bucket':  bucket,
        'buckets': buckets,
        'sessions': {p: series(universal, 'sessions', p) for p in ('kiro', 'claude', 'codex')},
        'lines': {
            'messages':  _sum_across(universal, 'messages', buckets, idx),
            'tool_uses': _sum_across(universal, 'tool_uses', buckets, idx),
            'errors':    _sum_across(universal, 'errors', buckets, idx),
        },
        'claude': {
            'input':       series(tokens, 'input_tokens', 'claude'),
            'output':      series(tokens, 'output_tokens', 'claude'),
            'cache_read':  series(tokens, 'cache_read', 'claude'),
            'cache_write': series(tokens, 'cache_write', 'claude'),
        },
        'codex': {
            'total':     series(tokens, 'codex_total', 'codex'),
            'reasoning': series(tokens, 'codex_reasoning', 'codex'),
        },
        'kiro': {
            'cycles':      series(kiro, 'cycles'),
            'avg_ctx_pct': series(kiro, 'avg_ctx_pct'),
        },
    }


def _sum_across(rows, field, buckets, idx):
    """Sum a universal metric across providers per bucket."""
    out = [None] * len(buckets)
    for r in rows:
        if r[field] is None:
            continue
        i = idx[r['b']]
        out[i] = (out[i] or 0) + r[field]
    return out
