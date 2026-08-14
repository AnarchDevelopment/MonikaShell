const { Client } = require('ssh2');

const pools = new Map();
const IDLE_TTL_MS = 10 * 60 * 1000; // 10 minutes without use
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

function connect(serverRow) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (settled) return;
        settled = true;
        if (err) {
          conn.end();
          return reject(err);
        }
        resolve({ conn, sftp });
      });
    });
    conn.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    conn.on('close', () => {
      const entry = pools.get(serverRow.uuid);
      if (entry && entry.conn === conn) pools.delete(serverRow.uuid);
    });
    conn.connect({
      host: serverRow.host,
      port: serverRow.port,
      username: serverRow.username,
      password: serverRow.password,
      readyTimeout: 10000
    });
  });
}

function getSftp(serverRow) {
  const key = serverRow.uuid;
  const existing = pools.get(key);
  if (existing && existing.sftp) {
    existing.lastUsed = Date.now();
    return Promise.resolve(existing.sftp);
  }
  if (existing && existing.connecting) return existing.connecting;

  const connecting = connect(serverRow).then(({ conn, sftp }) => {
    pools.set(key, { conn, sftp, lastUsed: Date.now(), connecting: null });
    return sftp;
  });
  pools.set(key, { conn: null, sftp: null, lastUsed: Date.now(), connecting });
  return connecting;
}

function withSftp(serverRow, fn) {
  return getSftp(serverRow).then((sftp) => fn(sftp));
}

function homePath(serverRow, path) {
  const home = serverRow.username === 'root' ? '/root' : '/home/' + serverRow.username;
  if (!path || path === '~' || path === '~/') return home;
  if (path.startsWith('~/')) return home + path.slice(1);
  return path;
}

function listDir(sftp, path) {
  return new Promise((resolve, reject) => {
    sftp.readdir(path, (err, list) => {
      if (err) return reject(err);
      resolve(list.map(({ filename, attrs }) => ({
        name: filename,
        type: attrs.isDirectory() ? 'dir' : attrs.isSymbolicLink() ? 'link' : 'file',
        size: attrs.size || 0,
        mtime: attrs.mtime ? attrs.mtime * 1000 : 0,
        perms: attrs.mode ? attrs.mode.toString(8).slice(-3) : ''
      })));
    });
  });
}

function readFile(sftp, path) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const rs = sftp.createReadStream(path);
    rs.on('data', (c) => { chunks.push(c); size += c.length; });
    rs.on('error', reject);
    rs.on('end', () => resolve(Buffer.concat(chunks, size)));
  });
}

function writeFile(sftp, path, data) {
  return new Promise((resolve, reject) => {
    const ws = sftp.createWriteStream(path);
    ws.on('error', reject);
    ws.on('close', resolve);
    ws.end(data);
  });
}

function mkdir(sftp, path) {
  return new Promise((resolve, reject) => {
    sftp.mkdir(path, (err) => (err ? reject(err) : resolve()));
  });
}

function rename(sftp, from, to) {
  return new Promise((resolve, reject) => {
    sftp.rename(from, to, (err) => (err ? reject(err) : resolve()));
  });
}

function remove(sftp, path, isDir) {
  return new Promise((resolve, reject) => {
    const fn = isDir ? sftp.rmdir.bind(sftp) : sftp.unlink.bind(sftp);
    fn(path, (err) => (err ? reject(err) : resolve()));
  });
}

function stat(sftp, path) {
  return new Promise((resolve, reject) => {
    sftp.stat(path, (err, attrs) => (err ? reject(err) : resolve(attrs)));
  });
}

// Close idle connections to avoid leaking SSH processes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pools) {
    if (entry.conn && now - entry.lastUsed > IDLE_TTL_MS) {
      pools.delete(key);
      try { entry.conn.end(); } catch { /* ignore */ }
    }
  }
}, SWEEP_INTERVAL_MS).unref();

module.exports = { withSftp, listDir, readFile, writeFile, mkdir, rename, remove, stat, homePath };
