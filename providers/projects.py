"""Project resolution — maps a session cwd to its project root.

A project root is the nearest ancestor of cwd (including cwd itself, excluding
$HOME) that contains a .git/.kiro/.claude/.codex dir. Reads the live filesystem
(read-only) — the one place the app looks outside the provider data dirs.
"""
from pathlib import Path

MARKERS = ('.git', '.kiro', '.claude', '.codex')


def resolve_project(cwd_abbrev, home=None):
    """Return (project_id, name, root_path).

    cwd_abbrev is the session's stored cwd (e.g. '~/web-app/ui' or '~' or '').
    For a resolved project: ('~/web-app', 'web-app', '~/web-app').
    For none: ('', '(no project)', None).
    """
    home = home or Path.home()
    if not cwd_abbrev:
        return ('', '(no project)', None)
    if cwd_abbrev.startswith('~'):
        abs_cwd = Path(str(home) + cwd_abbrev[1:])
    else:
        abs_cwd = Path(cwd_abbrev)
    try:
        candidates = [abs_cwd, *abs_cwd.parents]
    except Exception:
        return ('', '(no project)', None)
    for cur in candidates:
        if cur == home or cur == cur.parent:   # reached home or fs root
            break
        try:
            if any((cur / m).is_dir() for m in MARKERS):
                abbrev = str(cur).replace(str(home), '~', 1)
                return (abbrev, cur.name, abbrev)
        except Exception:
            break
    return ('', '(no project)', None)
