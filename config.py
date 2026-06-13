"""config.json access — the only module that reads user config.

Created by setup.py (run `python3 setup.py`). Everything user-specific —
ticket prefixes, provider data dirs, which providers are enabled — lives
in config.json so the code stays team-agnostic.
"""
import json
import re
import sys
from pathlib import Path

ROOT        = Path(__file__).parent
CONFIG_PATH = ROOT / 'config.json'

DEFAULTS = {
    'ticket_prefixes': [],
    'providers': {
        'kiro':   {'enabled': True, 'path': '~/.kiro'},
        'claude': {'enabled': True, 'path': '~/.claude'},
        'codex':  {'enabled': True, 'path': '~/.codex'},
    },
}


def load():
    """Return config merged over defaults. Exits with a pointer to setup.py
    if config.json doesn't exist yet."""
    if not CONFIG_PATH.exists():
        sys.exit('no config.json found — run `python3 setup.py` first.')
    user = json.loads(CONFIG_PATH.read_text())
    cfg = {
        'ticket_prefixes': user.get('ticket_prefixes', DEFAULTS['ticket_prefixes']),
        'providers': {},
    }
    for name, dflt in DEFAULTS['providers'].items():
        p = user.get('providers', {}).get(name, {})
        cfg['providers'][name] = {
            'enabled': p.get('enabled', dflt['enabled']),
            'path':    p.get('path', dflt['path']),
        }
    return cfg


_cfg = None

def _get():
    global _cfg
    if _cfg is None:
        _cfg = load()
    return _cfg


def ticket_re():
    """Compiled regex matching any configured ticket prefix (e.g. PAYS-123).
    Matches nothing if no prefixes are configured."""
    prefixes = _get()['ticket_prefixes']
    if not prefixes:
        return re.compile(r'(?!x)x')  # never matches
    alt = '|'.join(re.escape(p) for p in prefixes)
    return re.compile(rf'(?:{alt})-\d+', re.I)


def provider_path(name):
    """Expanded Path of a provider's data dir."""
    return Path(_get()['providers'][name]['path']).expanduser()


def provider_enabled(name):
    return _get()['providers'][name]['enabled']
