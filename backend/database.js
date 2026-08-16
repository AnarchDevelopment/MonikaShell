const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const dbPath = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

const db = new Database(path.join(dbPath, 'monikashell.db'));

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE,
      username TEXT UNIQUE,
      password_hash TEXT,
      is_admin INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE,
      name TEXT,
      type TEXT,
      host TEXT,
      port INTEGER,
      username TEXT,
      password TEXT,
      os TEXT,
      owner_id INTEGER,
      FOREIGN KEY(owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS server_access (
      server_uuid TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (server_uuid, user_id),
      FOREIGN KEY(server_uuid) REFERENCES servers(uuid),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expire INTEGER NOT NULL
    );
  `);

  // Clean up any expired sessions at startup
  db.prepare('DELETE FROM sessions WHERE expire <= ?').run(Date.now());

  // Migration: remove the unused email column (from the gravatar experiment)
  const userCols = db.prepare('PRAGMA table_info(users)').all();
  if (userCols.some(c => c.name === 'email')) {
    try {
      db.exec('ALTER TABLE users DROP COLUMN email');
    } catch (e) {
      // Column drop may be unsupported on older SQLite; leave it unused
    }
  }

  // Create/update the admin user from .env (ADMIN_USER / ADMIN_PASS), or fall back to a default.
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;
  if (adminUser && adminPass) {
    const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(adminUser);
    const hash = bcrypt.hashSync(adminPass, 10);
    if (existing) {
      db.prepare('UPDATE users SET password_hash = ?, is_admin = 1 WHERE username = ?').run(hash, adminUser);
      console.log(`Admin user "${adminUser}" updated from .env`);
    } else {
      db.prepare('INSERT INTO users (uuid, username, password_hash, is_admin) VALUES (?, ?, ?, ?)').run(
        randomUUID(), adminUser, hash, 1
      );
      console.log(`Admin user "${adminUser}" created from .env`);
    }
  } else {
    const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    if (!admin) {
      const hash = bcrypt.hashSync('admin', 10);
      db.prepare('INSERT INTO users (uuid, username, password_hash, is_admin) VALUES (?, ?, ?, ?)').run(
        randomUUID(), 'admin', hash, 1
      );
      console.log('Default admin created with username: admin, password: admin');
    }
  }

  // Remove the legacy mock 'Test Server' demo seed from any existing database
  db.prepare('DELETE FROM servers WHERE name = ?').run('Test Server');
}

initDb();

module.exports = db;
