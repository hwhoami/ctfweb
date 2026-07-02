const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'users.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function ensureDataFile() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      users: [],
      progress: [],
      session: { id: 1, username: null, loginAt: null },
      logs: []
    }, null, 2));
  }
}

function loadData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function appendLoginLog(data, entry) {
  data.logs = data.logs || [];
  data.logs.push(entry);
  if (data.logs.length > 100) {
    data.logs = data.logs.slice(-100);
  }
}

function getFilePath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath);
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const safePath = path.normalize(relativePath);
  const filePath = path.resolve(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    return path.join(ROOT, 'index.html');
  }

  return filePath;
}

function serveStatic(req, res, url) {
  const filePath = getFilePath(url.pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { ok: false, msg: 'File not found' });
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function getUser(data, username) {
  return data.users.find((u) => u.username === username) || null;
}

function getProgress(data, username) {
  return data.progress.find((p) => p.username === username) || null;
}

function saveProgress(data, username, flags) {
  const existing = getProgress(data, username);
  const flagsFound = [flags[1], flags[2], flags[3]].filter(Boolean).length;
  const nextRow = {
    username,
    flag1: Boolean(flags[1]),
    flag2: Boolean(flags[2]),
    flag3: Boolean(flags[3]),
    flagsFound,
    lastUpdated: new Date().toISOString()
  };

  if (existing) {
    Object.assign(existing, nextRow);
  } else {
    data.progress.push(nextRow);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, msg: 'API ready' });
    return;
  }

  if (url.pathname === '/api/register' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const data = loadData();
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!username || !password) {
      sendJson(res, 400, { ok: false, msg: 'Username dan password wajib diisi' });
      return;
    }

    if (getUser(data, username)) {
      sendJson(res, 409, { ok: false, msg: 'Username sudah terdaftar' });
      return;
    }

    data.users.push({
      username,
      password,
      createdAt: new Date().toISOString()
    });

    saveProgress(data, username, { 1: false, 2: false, 3: false });
    data.session = { id: 1, username, loginAt: new Date().toISOString() };
    saveData(data);

    sendJson(res, 200, { ok: true, msg: 'Registrasi berhasil' });
    return;
  }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const data = loadData();
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const user = getUser(data, username);
    const loginAt = new Date().toISOString();
    const ip = getClientIp(req);

    if (!user || user.password !== password) {
      appendLoginLog(data, { username, password, loginAt, ip, success: false, reason: 'invalid' });
      saveData(data);
      sendJson(res, 401, { ok: false, msg: 'Username atau password salah' });
      return;
    }

    appendLoginLog(data, { username, password, loginAt, ip, success: true });
    data.session = { id: 1, username, loginAt };
    saveData(data);
    sendJson(res, 200, { ok: true, msg: 'Login berhasil' });
    return;
  }

  if (url.pathname === '/api/logs' && req.method === 'GET') {
    const data = loadData();
    sendJson(res, 200, { ok: true, logs: (data.logs || []).slice().reverse() });
    return;
  }

  if (url.pathname === '/api/session' && req.method === 'GET') {
    const data = loadData();
    sendJson(res, 200, { ok: true, username: data.session?.username || null });
    return;
  }

  if (url.pathname === '/api/session' && req.method === 'DELETE') {
    const data = loadData();
    data.session = { id: 1, username: null, loginAt: null };
    saveData(data);
    sendJson(res, 200, { ok: true, msg: 'Logout berhasil' });
    return;
  }

  if (url.pathname.startsWith('/api/progress/') && req.method === 'GET') {
    const username = decodeURIComponent(url.pathname.split('/').pop());
    const data = loadData();
    const progress = getProgress(data, username) || {
      username,
      flag1: false,
      flag2: false,
      flag3: false,
      flagsFound: 0,
      lastUpdated: new Date().toISOString()
    };
    sendJson(res, 200, { ok: true, progress });
    return;
  }

  if (url.pathname.startsWith('/api/progress/') && req.method === 'POST') {
    const username = decodeURIComponent(url.pathname.split('/').pop());
    const body = await readJsonBody(req);
    const data = loadData();
    saveProgress(data, username, body.flags || { 1: false, 2: false, 3: false });
    saveData(data);
    sendJson(res, 200, { ok: true, msg: 'Progress disimpan' });
    return;
  }

  if (url.pathname === '/api/users' && req.method === 'GET') {
    const data = loadData();
    const list = data.users.map((u) => ({
      username: u.username,
      createdAt: u.createdAt
    }));
    sendJson(res, 200, { ok: true, users: list });
    return;
  }

  if (url.pathname.startsWith('/api/users/') && req.method === 'DELETE') {
    const username = decodeURIComponent(url.pathname.split('/').pop());
    const data = loadData();
    data.users = data.users.filter((u) => u.username !== username);
    data.progress = data.progress.filter((p) => p.username !== username);
    if (data.session?.username === username) {
      data.session = { id: 1, username: null, loginAt: null };
    }
    saveData(data);
    sendJson(res, 200, { ok: true, msg: 'User dihapus' });
    return;
  }

  if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
    const data = loadData();
    const leaderboard = data.progress
      .filter((p) => p.flagsFound >= 3)
      .sort((a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated))
      .map((p, i) => ({ rank: i + 1, username: p.username, flagsFound: p.flagsFound, lastUpdated: p.lastUpdated }));
    sendJson(res, 200, { ok: true, leaderboard });
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res, url);
    return;
  }

  sendJson(res, 404, { ok: false, msg: 'Route not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server berjalan di http://0.0.0.0:${PORT}`);
  console.log(`Server juga tersedia di http://localhost:${PORT}`);
});
