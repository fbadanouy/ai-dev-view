#!/usr/bin/env python3
"""
ai-dev-view — local server (entry point)
Run: python3 server.py [port]
Open: http://localhost:8765

All real code lives in api/ — app.py (HTTP + routes), db.py (ai-dev-view.db
access), queries/ (SQL grouped by entity).
"""
import sys

from api.app import PORT, main

if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else PORT)
