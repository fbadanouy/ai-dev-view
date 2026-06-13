"""Tickets and the sessions that reference them.

A session is linked to a ticket either as 'primary' (sessions.ticket FK,
title-first) or 'mention' (appeared in prompt/title text — session_tickets
bridge, with literal counts).
"""
from ..db import query


def get_tickets():
    """All tickets with their sessions nested, most recently active first."""
    sessions = query('''
        SELECT id AS session_id, title, agent, provider, updated_at, ticket,
               message_count AS messages, tool_uses,
               ROUND(duration_secs / 60.0, 1) AS duration_mins
        FROM sessions
    ''')
    by_id = {s['session_id']: s for s in sessions}

    mentions = query('''
        SELECT session_id, ticket, SUM(count) AS mentions
        FROM session_tickets
        GROUP BY session_id, ticket
    ''')

    # ticket → {session_id → {link, mentions}}; primary wins over mention
    links = {}
    for m in mentions:
        links.setdefault(m['ticket'], {})[m['session_id']] = {
            'link': 'mention', 'mentions': m['mentions'],
        }
    for s in sessions:
        if s['ticket']:
            entry = links.setdefault(s['ticket'], {}).setdefault(s['session_id'], {'mentions': 0})
            entry['link'] = 'primary'

    tickets = []
    for row in query('SELECT key FROM tickets ORDER BY key'):
        key = row['key']
        linked = []
        for sid, info in (links.get(key) or {}).items():
            s = by_id.get(sid)
            if s:
                linked.append({
                    **{k: v for k, v in s.items() if k != 'ticket'},
                    'link':     info['link'],
                    'mentions': info['mentions'],
                })
        linked.sort(key=lambda s: s['updated_at'] or '', reverse=True)
        primaries = [s for s in linked if s['link'] == 'primary']
        tickets.append({
            'ticket':        key,
            'sessions':      linked,
            'session_count': len(primaries),
            'mention_count': len(linked) - len(primaries),
            'last_activity': linked[0]['updated_at'] if linked else None,
        })
    tickets.sort(key=lambda t: t['last_activity'] or '', reverse=True)
    return tickets
