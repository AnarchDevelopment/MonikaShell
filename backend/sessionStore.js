const { Store } = require('express-session');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

function expireOf(sess) {
  const expires = sess && sess.cookie && sess.cookie.expires;
  if (expires) {
    const t = new Date(expires).getTime();
    if (!isNaN(t)) return t;
  }
  return Date.now() + SESSION_TTL_MS;
}

function createSessionStore(db) {
  const getStmt = db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expire > ?');
  const setStmt = db.prepare(
    'INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?) ' +
    'ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire'
  );
  const touchStmt = db.prepare('UPDATE sessions SET expire = ? WHERE sid = ?');
  const destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
  const cleanupStmt = db.prepare('DELETE FROM sessions WHERE expire <= ?');

  class BetterSqliteSessionStore extends Store {
    get(sid, cb) {
      try {
        const row = getStmt.get(sid, Date.now());
        if (!row) return cb(null, null);
        let sess;
        try {
          sess = JSON.parse(row.sess);
        } catch {
          return cb(null, null);
        }
        cb(null, sess);
      } catch (err) {
        cb(err);
      }
    }

    set(sid, sess, cb) {
      try {
        setStmt.run(sid, JSON.stringify(sess), expireOf(sess));
        if (cb) cb(null);
      } catch (err) {
        if (cb) cb(err);
      }
    }

    touch(sid, sess, cb) {
      try {
        touchStmt.run(expireOf(sess), sid);
        if (cb) cb(null);
      } catch (err) {
        if (cb) cb(err);
      }
    }

    destroy(sid, cb) {
      try {
        destroyStmt.run(sid);
        if (cb) cb(null);
      } catch (err) {
        if (cb) cb(err);
      }
    }
  }

  setInterval(() => {
    try {
      cleanupStmt.run(Date.now());
    } catch { /* ignore */ }
  }, CLEANUP_INTERVAL_MS).unref();

  return new BetterSqliteSessionStore();
}

module.exports = createSessionStore;
