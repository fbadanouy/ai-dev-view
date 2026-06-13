#!/usr/bin/env python3
"""
ai-dev-view setup — interactive first-run wizard.
Run: python3 setup.py
Writes config.json (ticket prefixes, providers). Safe to re-run.
"""
import json
import re
from pathlib import Path

ROOT        = Path(__file__).parent
CONFIG_PATH = ROOT / 'config.json'

PROVIDERS = [
    ('kiro',   '~/.kiro'),
    ('claude', '~/.claude'),
    ('codex',  '~/.codex'),
]

W = 56  # inner width of the step frames


def top(title):
    label = f' {title} '
    print(f'   ┌─{label}'.ljust(5 + W, '─') + '┐')


def row(text=''):
    print(f'   │ {text}'.ljust(5 + W) + '│')


def bottom():
    print('   └' + '─' * (W + 1) + '┘')


def ask(prompt):
    row()
    answer = input(f'   │   › {prompt}')
    row()
    return answer.strip()


def banner():
    print()
    print('        a i - d e v - v i e w   ·   s e t u p')
    print('   ' + '─' * (W + 2))
    print()


def step_tickets():
    top('step 1 of 2 ── tickets')
    row()
    row("  your team's ticket prefix (e.g. PAYS)")
    row('  add more separated by commas, or leave empty')
    raw = ask('')
    prefixes = []
    for part in raw.split(','):
        p = part.strip().rstrip('-').upper()
        if p and re.fullmatch(r'[A-Z][A-Z0-9]*', p) and p not in prefixes:
            prefixes.append(p)
    if raw and not prefixes:
        row('  (none of those looked like a prefix — skipping)')
        row()
    row(f"  tracking: {', '.join(prefixes) if prefixes else '— no ticket matching'}")
    row()
    bottom()
    print()
    return prefixes


def step_providers():
    top('step 2 of 2 ── providers')
    row()
    row('  looking around your home dir...')
    row()
    config = {}
    for name, default in PROVIDERS:
        path = Path(default).expanduser()
        if path.exists():
            row(f'  ● {name:<8} {default:<12} found')
            config[name] = {'enabled': True, 'path': default}
        else:
            answer = ask(f'○ {name:<8} {default:<12} not found — skip? [Y/n] ')
            if answer.lower() == 'n':
                custom = ask(f'path to your {name} data dir: ')
                config[name] = {'enabled': True, 'path': custom or default}
            else:
                config[name] = {'enabled': False, 'path': default}
    row()
    bottom()
    print()
    return config


def main():
    banner()
    if CONFIG_PATH.exists():
        print('   (config.json already exists — answers will replace it)')
        print()
    prefixes  = step_tickets()
    providers = step_providers()
    CONFIG_PATH.write_text(json.dumps(
        {'ticket_prefixes': prefixes, 'providers': providers}, indent=2) + '\n')
    print('   ✓ config written → config.json')
    print("     run `python3 server.py` whenever you're ready.")
    print()


if __name__ == '__main__':
    main()
