const express = require('express');
const { WebSocketServer } = require('ws');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const http = require('http');
const path = require('path');
const db = require('./database');
const { detectOS, readHistory } = require('./sshClient');
const { attach: attachSession, closeSession } = require('./sessionManager');
const createSessionStore = require('./sessionStore');
const sftp = require('./sftpManager');
const MAX_FILE_READ_BYTES = 2 * 1024 * 1024; // 2 MB

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    uuid: row.uuid,
    username: row.username,
    is_admin: !!row.is_admin
  };
}

const app = express();
app.use(express.json());
app.use(cors());

// Setup sessions
const sessionParser = session({
  secret: 'monikashell-secret-key', // Use env var in prod
  resave: false,
  saveUninitialized: false,
  store: createSessionStore(db),
  cookie: {
    httpOnly: true,
    secure: false, // secure: true in prod with HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
});
app.use(sessionParser);

// API Routes
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  
  if (user && bcrypt.compareSync(password, user.password_hash)) {
    req.session.userId = user.id;
    res.json({ success: true, user: publicUser(user) });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Middleware to protect routes
const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  res.json({ user: publicUser(user) });
});

app.get('/api/servers', requireAuth, (req, res) => {
  // Return all servers for admin, or only owned for normal user
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  let servers;
  if (user.is_admin) {
    servers = db.prepare('SELECT uuid, name, type, host, port, os FROM servers').all();
  } else {
    servers = db.prepare('SELECT uuid, name, type, host, port, os FROM servers WHERE owner_id = ?').all(req.session.userId);
  }
  res.json(servers);
});

app.get('/api/servers/:uuid', requireAuth, (req, res) => {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  const server = db.prepare('SELECT uuid, name, type, host, port, os, owner_id FROM servers WHERE uuid = ?').get(req.params.uuid);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (!user.is_admin && server.owner_id !== req.session.userId) return res.status(404).json({ error: 'Server not found' });
  const { owner_id, ...publicServer } = server;
  res.json(publicServer);
});

app.get('/api/servers/:uuid/history', requireAuth, (req, res) => {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  const server = db.prepare('SELECT * FROM servers WHERE uuid = ?').get(req.params.uuid);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (!user.is_admin && server.owner_id !== req.session.userId) return res.status(404).json({ error: 'Server not found' });
  if (server.type !== 'SSH') return res.status(400).json({ error: 'Unsupported server type' });

  readHistory(server)
    .then(raw => {
      const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      if (lines.length === 0) throw new Error('empty');
      // Deduplicate preserving the last occurrence, newest first
      const seen = new Set();
      const commands = [];
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!seen.has(line)) {
          seen.add(line);
          commands.push(line);
        }
      }
      res.json({ commands: commands.slice(0, 200) });
    })
    .catch(() => res.status(500).json({ error: 'Failed to fetch command history' }));
});

app.post('/api/servers/:uuid/sessions/:sessionId/close', requireAuth, (req, res) => {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  const server = db.prepare('SELECT * FROM servers WHERE uuid = ?').get(req.params.uuid);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (!user.is_admin && server.owner_id !== req.session.userId) return res.status(404).json({ error: 'Server not found' });
  const closed = closeSession(req.params.uuid, req.params.sessionId);
  res.json({ success: true, closed });
});

// --- SFTP / File Manager ---
function ownedServer(req) {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  const server = db.prepare('SELECT * FROM servers WHERE uuid = ?').get(req.params.uuid);
  if (!server || (!user.is_admin && server.owner_id !== req.session.userId)) return null;
  return server;
}

function handleSftpError(res, err) {
  const msg = (err && err.message) ? err.message : String(err || 'SFTP operation failed');
  console.error('SFTP error:', msg);
  res.status(500).json({ error: msg });
}

app.get('/api/servers/:uuid/files', requireAuth, (req, res) => {
  const server = ownedServer(req);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.type !== 'SSH') return res.status(400).json({ error: 'Unsupported server type' });
  const path = sftp.homePath(server, req.query.path || '~');
  sftp.withSftp(server, (sf) => sftp.listDir(sf, path))
    .then(entries => res.json({ path, entries }))
    .catch(err => handleSftpError(res, err));
});

app.get('/api/servers/:uuid/files/content', requireAuth, (req, res) => {
  const server = ownedServer(req);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.type !== 'SSH') return res.status(400).json({ error: 'Unsupported server type' });
  const path = req.query.path;
  if (!path) return res.status(400).json({ error: 'Path is required' });
  sftp.withSftp(server, (sf) => sftp.readFile(sf, path))
    .then(buf => {
      if (buf.length > MAX_FILE_READ_BYTES) {
        return res.status(413).json({ error: 'File is too large to edit (max 2 MB)' });
      }
      const name = path.split('/').pop() || path;
      res.json({ name, content: buf.toString('utf8') });
    })
    .catch(err => handleSftpError(res, err));
});

app.put('/api/servers/:uuid/files/content', requireAuth, (req, res) => {
  const server = ownedServer(req);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.type !== 'SSH') return res.status(400).json({ error: 'Unsupported server type' });
  const { path, content } = req.body;
  if (!path || typeof content !== 'string') return res.status(400).json({ error: 'Path and content are required' });
  sftp.withSftp(server, (sf) => sftp.writeFile(sf, path, Buffer.from(content, 'utf8')))
    .then(() => res.json({ success: true }))
    .catch(err => handleSftpError(res, err));
});

app.post('/api/servers/:uuid/files/mkdir', requireAuth, (req, res) => {
  const server = ownedServer(req);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.type !== 'SSH') return res.status(400).json({ error: 'Unsupported server type' });
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: 'Path is required' });
  sftp.withSftp(server, (sf) => sftp.mkdir(sf, path))
    .then(() => res.json({ success: true }))
    .catch(err => handleSftpError(res, err));
});

app.post('/api/servers/:uuid/files/rename', requireAuth, (req, res) => {
  const server = ownedServer(req);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.type !== 'SSH') return res.status(400).json({ error: 'Unsupported server type' });
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
  sftp.withSftp(server, (sf) => sftp.rename(sf, from, to))
    .then(() => res.json({ success: true }))
    .catch(err => handleSftpError(res, err));
});

app.delete('/api/servers/:uuid/files', requireAuth, (req, res) => {
  const server = ownedServer(req);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.type !== 'SSH') return res.status(400).json({ error: 'Unsupported server type' });
  const { path, isDir } = req.query;
  if (!path) return res.status(400).json({ error: 'Path is required' });
  sftp.withSftp(server, (sf) => sftp.remove(sf, path, isDir === '1'))
    .then(() => res.json({ success: true }))
    .catch(err => handleSftpError(res, err));
});

app.post('/api/servers/:uuid/files/upload', requireAuth, (req, res) => {
  const server = ownedServer(req);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.type !== 'SSH') return res.status(400).json({ error: 'Unsupported server type' });
  const { path, name } = req.query;
  if (!path || !name) return res.status(400).json({ error: 'Path and name are required' });
  const dest = (path.endsWith('/') ? path : path + '/') + name;
  sftp.withSftp(server, (sf) => new Promise((resolve, reject) => {
    const ws = sf.createWriteStream(dest);
    ws.on('error', reject);
    ws.on('close', resolve);
    req.pipe(ws);
  }))
    .then(() => res.json({ success: true }))
    .catch(err => handleSftpError(res, err));
});

app.get('/api/servers/:uuid/files/download', requireAuth, (req, res) => {
  const server = ownedServer(req);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.type !== 'SSH') return res.status(400).json({ error: 'Unsupported server type' });
  const path = req.query.path;
  if (!path) return res.status(400).json({ error: 'Path is required' });
  const name = path.split('/').pop() || 'download';
  sftp.withSftp(server, (sf) => new Promise((resolve, reject) => {
    res.setHeader('Content-Disposition', 'attachment; filename="' + name.replace(/"/g, '') + '"');
    res.setHeader('Content-Type', 'application/octet-stream');
    const rs = sf.createReadStream(path);
    rs.on('error', reject);
    rs.pipe(res);
  }))
    .catch(err => handleSftpError(res, err));
});

app.get('/api/admin/users', requireAuth, (req, res) => {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const users = db.prepare('SELECT id, uuid, username, is_admin FROM users').all();
  res.json(users.map(publicUser));
});

app.post('/api/admin/users', requireAuth, (req, res) => {
  const actor = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!actor.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const { username, password, is_admin } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already taken' });
  const hash = bcrypt.hashSync(password, 10);
  const uuid = require('crypto').randomUUID();
  db.prepare('INSERT INTO users (uuid, username, password_hash, is_admin) VALUES (?, ?, ?, ?)').run(uuid, username, hash, is_admin ? 1 : 0);
  res.json({ success: true });
});

app.put('/api/admin/users/:id', requireAuth, (req, res) => {
  const actor = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!actor.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const { username, password, is_admin } = req.body;
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  // Prevent demoting the last admin
  if (target.is_admin && !is_admin) {
    const adminCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1').get().c;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot demote the last administrator' });
  }
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET username=?, password_hash=?, is_admin=? WHERE id=?').run(username, hash, is_admin ? 1 : 0, req.params.id);
  } else {
    db.prepare('UPDATE users SET username=?, is_admin=? WHERE id=?').run(username, is_admin ? 1 : 0, req.params.id);
  }
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', requireAuth, (req, res) => {
  const actor = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!actor.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.is_admin) {
    const adminCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1').get().c;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot delete the last administrator' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- Servers CRUD ---
app.post('/api/admin/servers', requireAuth, (req, res) => {
  const actor = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!actor.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const { name, type, host, port, username, password, os } = req.body;
  if (!name || !type || !host || !port) return res.status(400).json({ error: 'Name, type, host and port are required' });
  const uuid = require('crypto').randomUUID();
  
  const serverConfig = { host, port, username, password, type };
  const initialOs = os || 'Linux';
  
  db.prepare('INSERT INTO servers (uuid, name, type, host, port, username, password, os, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(uuid, name, type, host, port, username || '', password || '', initialOs, req.session.userId);
  
  // Async OS Detection
  detectOS(serverConfig).then(detectedOs => {
    if (detectedOs && detectedOs !== initialOs) {
      db.prepare('UPDATE servers SET os=? WHERE uuid=?').run(detectedOs, uuid);
    }
  });
  
  res.json({ success: true });
});

app.put('/api/admin/servers/:uuid', requireAuth, (req, res) => {
  const actor = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!actor.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const { name, type, host, port, username, password, os } = req.body;
  const server = db.prepare('SELECT * FROM servers WHERE uuid = ?').get(req.params.uuid);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  
  const serverConfig = { host, port, username, password: password || server.password, type };
  const fallbackOs = os || 'Linux';

  if (password) {
    db.prepare('UPDATE servers SET name=?, type=?, host=?, port=?, username=?, password=?, os=? WHERE uuid=?').run(name, type, host, port, username, password, fallbackOs, req.params.uuid);
  } else {
    db.prepare('UPDATE servers SET name=?, type=?, host=?, port=?, username=?, os=? WHERE uuid=?').run(name, type, host, port, username, fallbackOs, req.params.uuid);
  }
  
  // Async OS Detection
  detectOS(serverConfig).then(detectedOs => {
    if (detectedOs && detectedOs !== fallbackOs) {
      db.prepare('UPDATE servers SET os=? WHERE uuid=?').run(detectedOs, req.params.uuid);
    }
  });

  res.json({ success: true });
});

app.delete('/api/admin/servers/:uuid', requireAuth, (req, res) => {
  const actor = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!actor.is_admin) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM servers WHERE uuid = ?').run(req.params.uuid);
  res.json({ success: true });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create HTTP server
const server = http.createServer(app);

// Setup WebSocket server
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  // In a real app we'd verify session/auth here before upgrading
  if (request.url.startsWith('/ws/server/')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, request) => {
  const urlParts = request.url.split('/');
  const serverUuid = urlParts[urlParts.length - 2]; // /ws/server/:uuid/terminal

  if (!serverUuid) {
      ws.close();
      return;
  }

  const serverRow = db.prepare('SELECT * FROM servers WHERE uuid = ?').get(serverUuid);

  if (!serverRow) {
      ws.send(JSON.stringify({ type: 'output', data: 'Server not found.' }));
      ws.close();
      return;
  }

  if (serverRow.type === 'SSH') {
      const params = new URL(request.url, 'http://localhost').searchParams;
      const sessionId = params.get('session') || 'default';
      attachSession(ws, serverRow, sessionId);
  } else {
      ws.send(JSON.stringify({ type: 'output', data: 'Only SSH is supported in this demo.' }));
      ws.close();
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`MonikaShell backend running on port ${PORT}`);
});
