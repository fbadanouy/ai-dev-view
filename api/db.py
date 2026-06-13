"""DB access — the only module that opens ai-dev-view.db."""
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT   = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / 'ai-dev-view.db'


def ensure_db():
    """Run ingest.py on first boot if ai-dev-view.db is missing."""
    if not DB_PATH.exists():
        print('Database not found — running ingest.py ...')
        subprocess.run([sys.executable, str(ROOT / 'ingest.py')], check=True)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def query(sql, params=()):
    """Run a SELECT and return a list of dicts."""
    conn = get_db()
    try:
        cur  = conn.execute(sql, params)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


def execute(sql, params=()):
    """Run a write statement and commit."""
    conn = get_db()
    try:
        conn.execute(sql, params)
        conn.commit()
    finally:
        conn.close()


def run_ingest():
    """Re-run the full ingest pipeline; returns a result dict for the API."""
    try:
        result = subprocess.run(
            [sys.executable, str(ROOT / 'ingest.py')],
            capture_output=True, text=True, timeout=120
        )
        return {'success': result.returncode == 0,
                'output': result.stdout + result.stderr}
    except Exception as e:
        return {'success': False, 'error': str(e)}
