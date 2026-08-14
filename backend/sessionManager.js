const { Client } = require('ssh2');

const sessions = new Map();

const MAX_BUFFER_CHUNKS = 5000;
const IDLE_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours without activity
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

function keyOf(serverUuid, sessionId) {
  return `${serverUuid}::${sessionId}`;
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(session, msg) {
  const data = JSON.stringify(msg);
  for (const ws of session.clients) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

function touch(session) {
  session.lastActivity = Date.now();
}

function endSession(session) {
  if (session.ended) return;
  session.ended = true;
  sessions.delete(session.key);
  if (session.conn) {
    try { session.conn.end(); } catch (e) { /* ignore */ }
  }
  session.conn = null;
  session.stream = null;
  for (const ws of session.clients) {
    try { ws.close(); } catch (e) { /* ignore */ }
  }
  session.clients.clear();
}

function connect(session) {
  const server = session.server;
  const conn = new Client();
  session.conn = conn;

  conn.on('ready', () => {
    conn.shell({ term: 'xterm-256color' }, (err, stream) => {
      if (err) {
        broadcast(session, { type: 'output', data: `\r\n*** SSH Error: ${err.message} ***\r\n` });
        broadcast(session, { type: 'status', status: 'error' });
        endSession(session);
        return;
      }

      session.stream = stream;

      stream.on('data', (data) => {
        touch(session);
        const text = data.toString('utf-8');
        session.buffer.push(text);
        if (session.buffer.length > MAX_BUFFER_CHUNKS) session.buffer.shift();
        broadcast(session, { type: 'output', data: text });
      });

      stream.on('close', () => {
        broadcast(session, { type: 'status', status: 'disconnected' });
        endSession(session);
      });

      // Apply anything requested before the shell was ready
      if (session.pendingResize) {
        const { rows, cols } = session.pendingResize;
        session.pendingResize = null;
        if (rows && cols) stream.setWindow(rows, cols, 0, 0);
      }
      if (!session.commandRun && session.pendingCommand) {
        const cmd = session.pendingCommand;
        session.pendingCommand = null;
        session.commandRun = true;
        stream.write(cmd + '\r');
      }

      broadcast(session, { type: 'status', status: 'connected' });
    });
  });

  conn.on('error', (err) => {
    broadcast(session, { type: 'output', data: `\r\n*** SSH Connection Error: ${err.message} ***\r\n` });
    broadcast(session, { type: 'status', status: 'error' });
    endSession(session);
  });

  conn.connect({
    host: server.host,
    port: server.port,
    username: server.username,
    password: server.password,
    readyTimeout: 10000
  });
}

function getOrCreate(serverRow, sessionId) {
  const key = keyOf(serverRow.uuid, sessionId);
  const existing = sessions.get(key);
  if (existing) return { session: existing, created: false };

  const session = {
    key,
    serverUuid: serverRow.uuid,
    sessionId,
    server: serverRow,
    conn: null,
    stream: null,
    buffer: [],
    clients: new Set(),
    pendingResize: null,
    pendingCommand: null,
    commandRun: false,
    lastActivity: Date.now(),
    ended: false
  };
  sessions.set(key, session);
  connect(session);
  return { session, created: true };
}

function attach(ws, serverRow, sessionId) {
  const { session, created } = getOrCreate(serverRow, sessionId);
  session.clients.add(ws);
  ws.session = session;
  touch(session);

  // Replay buffered output so the client sees what happened while detached
  for (const chunk of session.buffer) {
    send(ws, { type: 'replay', data: chunk });
  }
  if (session.stream) {
    send(ws, { type: 'status', status: 'connected' });
  }

  ws.on('message', (msg) => {
    let parsed;
    try {
      parsed = JSON.parse(msg);
    } catch (e) {
      if (session.stream) session.stream.write(msg);
      return;
    }

    if (parsed.type === 'init') {
      // Only the very first init of a brand-new session may run the new-tab command
      if (created && !session.commandRun && parsed.newTabCommand) {
        session.pendingCommand = parsed.newTabCommand;
        if (session.stream) {
          const cmd = session.pendingCommand;
          session.pendingCommand = null;
          session.commandRun = true;
          session.stream.write(cmd + '\r');
        }
      }
      if (parsed.rows && parsed.cols) {
        if (session.stream) {
          session.stream.setWindow(parsed.rows, parsed.cols, 0, 0);
        } else {
          session.pendingResize = { rows: parsed.rows, cols: parsed.cols };
        }
      }
      touch(session);
    } else if (parsed.type === 'input') {
      if (session.stream) {
        session.stream.write(parsed.data);
        touch(session);
      }
    } else if (parsed.type === 'resize') {
      if (session.stream && parsed.rows && parsed.cols) {
        session.stream.setWindow(parsed.rows, parsed.cols, 0, 0);
      } else if (parsed.rows && parsed.cols) {
        session.pendingResize = { rows: parsed.rows, cols: parsed.cols };
      }
      touch(session);
    }
  });

  ws.on('close', () => {
    // Detach only — the SSH session keeps running and buffers output.
    session.clients.delete(ws);
  });

  ws.on('error', () => {
    session.clients.delete(ws);
  });
}

// Periodically drop sessions that are idle and have no attached clients
setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (!session.ended && session.clients.size === 0 && now - session.lastActivity > IDLE_SESSION_TTL_MS) {
      endSession(session);
    }
  }
}, SWEEP_INTERVAL_MS).unref();

function closeSession(serverUuid, sessionId) {
  const session = sessions.get(keyOf(serverUuid, sessionId));
  if (!session || session.ended) return false;
  endSession(session);
  return true;
}

module.exports = { attach, endSession, closeSession };
