import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / 'data' / 'users.json'
PORT = int(os.environ.get('PORT', 3000))

MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
}


def ensure_data_file():
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps({
            'users': [],
            'progress': [],
            'session': {'id': 1, 'username': None, 'loginAt': None},
            'logs': []
        }, indent=2), encoding='utf-8')


def load_data():
    ensure_data_file()
    return json.loads(DATA_FILE.read_text(encoding='utf-8'))


def save_data(data):
    ensure_data_file()
    DATA_FILE.write_text(json.dumps(data, indent=2), encoding='utf-8')


def get_user(data, username):
    return next((u for u in data['users'] if u['username'] == username), None)


def get_progress(data, username):
    return next((p for p in data['progress'] if p['username'] == username), None)


def is_admin(username):
    return username == 'admin'


def save_progress(data, username, flags):
    existing = get_progress(data, username)
    flags_found = sum(1 for key in [1, 2, 3] if bool(flags.get(str(key), flags.get(key, False))))
    row = {
        'username': username,
        'flag1': bool(flags.get('1', flags.get(1, False))),
        'flag2': bool(flags.get('2', flags.get(2, False))),
        'flag3': bool(flags.get('3', flags.get(3, False))),
        'flagsFound': flags_found,
        'lastUpdated': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    }
    if existing:
        existing.update(row)
    else:
        data['progress'].append(row)


def append_login_log(data, entry):
    data['logs'] = data.get('logs', [])
    data['logs'].append(entry)
    if len(data['logs']) > 100:
        data['logs'] = data['logs'][-100:]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def do_DELETE(self):
        self.handle_request()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def handle_request(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/health':
            self.send_json(200, {'ok': True, 'msg': 'API ready'})
            return

        if path == '/api/register' and self.command == 'POST':
            body = self.read_json_body()
            username = str(body.get('username', '')).strip()
            password = str(body.get('password', ''))
            data = load_data()
            if not username or not password:
                self.send_json(400, {'ok': False, 'msg': 'Username dan password wajib diisi'})
                return
            if get_user(data, username):
                self.send_json(409, {'ok': False, 'msg': 'Username sudah terdaftar'})
                return
            data['users'].append({'username': username, 'password': password, 'createdAt': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()})
            save_progress(data, username, {'1': False, '2': False, '3': False})
            data['session'] = {'id': 1, 'username': username, 'loginAt': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()}
            save_data(data)
            self.send_json(200, {'ok': True, 'msg': 'Registrasi berhasil'})
            return

        if path == '/api/login' and self.command == 'POST':
            body = self.read_json_body()
            username = str(body.get('username', '')).strip()
            password = str(body.get('password', ''))
            data = load_data()
            user = get_user(data, username)
            login_at = __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
            ip = self.client_address[0]
            if not user or user['password'] != password:
                append_login_log(data, {'username': username, 'password': password, 'loginAt': login_at, 'ip': ip, 'success': False, 'reason': 'invalid'})
                save_data(data)
                self.send_json(401, {'ok': False, 'msg': 'Username atau password salah'})
                return
            append_login_log(data, {'username': username, 'password': password, 'loginAt': login_at, 'ip': ip, 'success': True})
            data['session'] = {'id': 1, 'username': username, 'loginAt': login_at}
            save_data(data)
            self.send_json(200, {'ok': True, 'msg': 'Login berhasil'})
            return

        if path == '/api/logs' and self.command == 'GET':
            data = load_data()
            self.send_json(200, {'ok': True, 'logs': list(reversed(data.get('logs', [])))})
            return

        if path == '/api/session' and self.command == 'GET':
            data = load_data()
            self.send_json(200, {'ok': True, 'username': data['session'].get('username')})
            return

        if path == '/api/session' and self.command == 'DELETE':
            data = load_data()
            data['session'] = {'id': 1, 'username': None, 'loginAt': None}
            save_data(data)
            self.send_json(200, {'ok': True, 'msg': 'Logout berhasil'})
            return

        if path.startswith('/api/progress/') and self.command == 'GET':
            username = unquote(path.split('/')[-1])
            data = load_data()
            progress = get_progress(data, username) or {'username': username, 'flag1': False, 'flag2': False, 'flag3': False, 'flagsFound': 0, 'lastUpdated': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()}
            self.send_json(200, {'ok': True, 'progress': progress})
            return

        if path.startswith('/api/progress/') and self.command == 'POST':
            username = unquote(path.split('/')[-1])
            body = self.read_json_body()
            data = load_data()
            save_progress(data, username, body.get('flags', {'1': False, '2': False, '3': False}))
            save_data(data)
            self.send_json(200, {'ok': True, 'msg': 'Progress disimpan'})
            return

        if path == '/api/users' and self.command == 'GET':
            data = load_data()
            session_user = data['session'].get('username')
            if not is_admin(session_user):
                self.send_json(403, {'ok': False, 'msg': 'Akses ditolak'})
                return
            self.send_json(200, {'ok': True, 'users': [{'username': u['username'], 'createdAt': u['createdAt']} for u in data['users']]})
            return

        if path.startswith('/api/users/') and self.command == 'DELETE':
            data = load_data()
            session_user = data['session'].get('username')
            if not is_admin(session_user):
                self.send_json(403, {'ok': False, 'msg': 'Akses ditolak'})
                return
            username = unquote(path.split('/')[-1])
            data['users'] = [u for u in data['users'] if u['username'] != username]
            data['progress'] = [p for p in data['progress'] if p['username'] != username]
            if data['session'].get('username') == username:
                data['session'] = {'id': 1, 'username': None, 'loginAt': None}
            save_data(data)
            self.send_json(200, {'ok': True, 'msg': 'User dihapus'})
            return

        if path == '/api/leaderboard' and self.command == 'GET':
            data = load_data()
            leaderboard = [
                {'rank': idx + 1, 'username': p['username'], 'flagsFound': p['flagsFound'], 'lastUpdated': p['lastUpdated']}
                for idx, p in enumerate(sorted([p for p in data['progress'] if p.get('flagsFound', 0) >= 3], key=lambda x: x['lastUpdated']))
            ]
            self.send_json(200, {'ok': True, 'leaderboard': leaderboard})
            return

        if self.command == 'GET':
            self.serve_static(path)
            return

        self.send_json(404, {'ok': False, 'msg': 'Route not found'})

    def read_json_body(self):
        length = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(length).decode('utf-8') if length else '{}'
        try:
            return json.loads(body) if body else {}
        except Exception:
            return {}

    def send_json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, path):
        if path == '/':
            path = '/index.html'
        file_path = ROOT / path.lstrip('/')
        if not file_path.exists() or not file_path.is_file():
            self.send_json(404, {'ok': False, 'msg': 'File not found'})
            return
        ext = file_path.suffix.lower()
        content_type = MIME_TYPES.get(ext, 'application/octet-stream')
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print(f'Server berjalan di http://localhost:{PORT}')
    server.serve_forever()
