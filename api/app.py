"""HTTP layer — route table + handler. No SQL lives here.

Adding an endpoint = write a query function in api/queries/ and add one
row to GET_ROUTES. `{name}` segments capture and are passed to the
function as keyword arguments.
"""
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from .db import ROOT, ensure_db, run_ingest
from .queries import agents, files, mcps, models, overview, projects, sessions, skills, tickets, tools

PORT = 8765
UI_DIR = (ROOT / 'ui').resolve()

MIME_TYPES = {
    '.html': 'text/html',
    '.js':   'text/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
}

GET_ROUTES = [
    ('/api/projects',        projects.get_projects),
    ('/api/project-detail',  projects.get_project_detail),   # ?id=<encoded project id>

    ('/api/sessions',                                          sessions.get_sessions),
    ('/api/session/{session_id}/turn-details',                 sessions.get_session_turn_details),
    ('/api/session/{session_id}/tool-calls',                   sessions.get_session_tool_calls),
    ('/api/session/{session_id}/messages',                     sessions.get_session_messages),
    ('/api/session/{session_id}/tool-result/{tool_use_id}',    sessions.get_session_tool_result),

    ('/api/skills',                                            skills.get_skills_list),
    ('/api/skills/usage/{provider}/{skill_name}',              skills.get_skill_sessions),
    ('/api/skills/profile/{provider}/{skill_name}',            skills.get_skill_profile),

    ('/api/agents',                                            agents.get_agents),
    ('/api/agents/{name}/sessions',                            agents.get_agent_sessions),

    ('/api/models',                                            models.get_models),
    ('/api/models/{model_id}/sessions',                        models.get_model_sessions),

    ('/api/mcps',                                              mcps.get_mcps),
    ('/api/mcps/{server}/sessions',                            mcps.get_mcp_sessions),

    ('/api/tools',                                             tools.get_all_tools),
    ('/api/tools/{tool_name}',                                 tools.get_tool_detail),

    ('/api/files',                                             files.get_files),

    ('/api/tickets',                                           tickets.get_tickets),

    ('/api/analytics/overview',                                overview.get_overview),
    ('/api/analytics/skills',                                  skills.get_skill_analytics),
    ('/api/analytics/skill-failures',                          skills.get_skill_failure_analytics),
    ('/api/analytics/files',                                   files.get_file_access_analytics),
    ('/api/analytics/tool-errors',                             tools.get_tool_error_analytics),
    ('/api/analytics/tool-failures',                           tools.get_tool_failure_analytics),
]

POST_ROUTES = [
    ('/api/sessions/props',  lambda body: sessions.set_session_prop(body)),
    ('/api/ingest',          lambda body: run_ingest()),
]


def match(pattern, path):
    """Match a path against a route pattern; return captured params or None."""
    p_segs = pattern.strip('/').split('/')
    segs   = path.strip('/').split('/')
    if len(p_segs) != len(segs):
        return None
    params = {}
    for p, s in zip(p_segs, segs):
        if p.startswith('{') and p.endswith('}'):
            params[p[1:-1]] = s
        elif p != s:
            return None
    return params


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        path = parsed.path
        for pattern, fn in GET_ROUTES:
            params = match(pattern, path)
            if params is not None:
                import inspect
                sig = inspect.signature(fn)
                extra = {k: v for k, v in qs.items() if k in sig.parameters}
                return self.json(fn(**params, **extra))

        if path in ('/', '/index.html'):
            return self.file(UI_DIR / 'index.html', 'text/html')

        f = (UI_DIR / path.lstrip('/')).resolve()
        if UI_DIR in f.parents and f.is_file():
            return self.file(f, MIME_TYPES.get(f.suffix, 'text/plain'))
        self.send_error(404)

    def do_POST(self):
        for pattern, fn in POST_ROUTES:
            if match(pattern, self.path) is not None:
                return self.json(fn(self._read_json()))
        self.send_error(404)

    def _read_json(self):
        length = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(length).decode()) if length else {}

    def json(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def file(self, path, ct):
        body = path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', ct)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)


def main(port=PORT):
    ensure_db()
    server = HTTPServer(('localhost', port), Handler)
    print(f'ai-dev-view → http://localhost:{port}')
    server.serve_forever()
