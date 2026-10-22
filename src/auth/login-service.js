import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { verifyPassword } from './password-service.js';
import { runTransaction } from '../data/database.js';

const WINDOW_MS = 15 * 60 * 1000;
const DUMMY_HASH = `scrypt-v1$131072$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
// Process-wide bound, including multiple factories. No unbounded password queue.
let intActiveHashes = 0;
function digest(strValue) { return createHash('sha256').update(strValue).digest('hex'); }
function validToken(strValue) { return typeof strValue === 'string' && strValue.length === 64 && /^[0-9a-f]{64}$/.test(strValue); }

/** Internal only. Source must come from trusted transport configuration, never a form/header claim. */
export function createLoginService(objDatabase, { objMfaService, fnNow = () => new Date() } = {}) {
  if (!objMfaService || typeof objMfaService.verifyCode !== 'function') throw new TypeError('MFA service required.');
  function now() {
    const dtNow = fnNow();
    if (!(dtNow instanceof Date) || !Number.isSafeInteger(dtNow.getTime()) || dtNow.getTime() < 0) throw new TypeError('Invalid server clock.');
    return dtNow;
  }
  function identity(strUsername) {
    return objDatabase.prepare(`SELECT c.*, u.role, u.state, u.revision AS user_revision, v.epoch
      FROM staff_credentials c JOIN staff_users u ON u.id = c.user_id
      JOIN login_identity_versions v ON v.user_id = u.id WHERE c.username = ?`).get(strUsername);
  }
  function unchanged(objBefore, objAfter, dtNow) {
    return objAfter && objAfter.state === 'active' && objAfter.user_id === objBefore.user_id
      && objAfter.revision === objBefore.revision && objAfter.user_revision === objBefore.user_revision
      && objAfter.epoch === objBefore.epoch && objAfter.role === objBefore.role && objAfter.password_hash === objBefore.password_hash
      && dtNow.toISOString() >= objAfter.password_changed_at;
  }
  function reserve(arrBuckets, numNow) {
    return runTransaction(objDatabase, () => {
      objDatabase.prepare('DELETE FROM login_limits WHERE window_start_ms <= ?').run(numNow - WINDOW_MS);
      objDatabase.prepare('DELETE FROM login_challenges WHERE expires_ms <= ?').run(numNow);
      if (objDatabase.prepare('SELECT count(*) AS total FROM login_limits').get().total >= 5000) return false;
      for (const [strBucket, intLimit] of arrBuckets) {
        const objRow = objDatabase.prepare('SELECT * FROM login_limits WHERE bucket_digest = ?').get(strBucket);
        if (objRow && (numNow < objRow.window_start_ms || objRow.attempts >= intLimit)) return false;
      }
      for (const [strBucket] of arrBuckets) {
        objDatabase.prepare(`INSERT INTO login_limits VALUES (?, ?, 1)
          ON CONFLICT(bucket_digest) DO UPDATE SET attempts = attempts + 1`).run(strBucket, numNow);
      }
      return true;
    });
  }
  function issue(objUser, dtNow, bMfa) {
    const strToken = randomBytes(32).toString('hex');
    objDatabase.prepare(`INSERT INTO staff_sessions
      (id, user_id, session_token_digest, authenticated_at, last_activity_at, mfa_verified_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), objUser.user_id, digest(strToken), dtNow.toISOString(),
      dtNow.toISOString(), bMfa ? dtNow.toISOString() : null, new Date(dtNow.getTime() + 8 * 3600000).toISOString());
    return Object.freeze({ strSessionToken: strToken });
  }
  return Object.freeze({
    revokeChallenge(strChallenge) {
      if (!validToken(strChallenge)) return false;
      return objDatabase.prepare('DELETE FROM login_challenges WHERE token_digest = ?').run(digest(strChallenge)).changes > 0;
    },
    async beginSignIn(strUsername, strPassword, strSource) {
      if (typeof strUsername !== 'string' || strUsername.length > 64 || !/^[a-zA-Z0-9._-]{3,64}$/.test(strUsername)
        || strUsername.includes('\n')
        || typeof strSource !== 'string' || !strSource.length || strSource.length > 256) return null;
      const strCanonical = strUsername.toLowerCase();
      const dtStarted = now();
      if (intActiveHashes >= 2 || !reserve([[digest(`account:${strCanonical}`), 5],
        [digest(`source:${strSource}`), 30]], dtStarted.getTime())) return null;
      const objBefore = identity(strCanonical);
      let bVerified;
      intActiveHashes += 1;
      try { bVerified = await verifyPassword(strPassword, objBefore?.password_hash ?? DUMMY_HASH); }
      finally { intActiveHashes -= 1; }
      return runTransaction(objDatabase, () => {
        const dtNow = now();
        const objCurrent = identity(strCanonical);
        if (!bVerified || !objBefore || dtNow < dtStarted || dtNow - dtStarted >= 300000
          || !unchanged(objBefore, objCurrent, dtNow)) return null;
        if (objCurrent.role === 'employee') return issue(objCurrent, dtNow, false);
        const objFactor = objDatabase.prepare(`SELECT r.id FROM mfa_references r JOIN mfa_secrets s
          ON s.mfa_reference_id = r.id WHERE r.user_id = ? AND r.state = 'active' AND s.state = 'active'`).get(objCurrent.user_id);
        if (!objFactor) return null;
        const strChallenge = randomBytes(32).toString('hex');
        objDatabase.prepare(`INSERT INTO login_challenges
          (token_digest, user_id, credential_revision, user_revision, factor_id, source_digest, created_ms, expires_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(digest(strChallenge), objCurrent.user_id,
          objCurrent.revision, objCurrent.user_revision, objFactor.id, digest(strSource), dtNow.getTime(), dtNow.getTime() + 300000);
        return Object.freeze({ strMfaChallenge: strChallenge });
      });
    },
    completeMfa(strChallenge, strCode, strSource) {
      if (!validToken(strChallenge) || typeof strSource !== 'string' || !strSource.length || strSource.length > 256) return null;
      const dtNow = now();
      const objChallenge = objDatabase.prepare('SELECT * FROM login_challenges WHERE token_digest = ?').get(digest(strChallenge));
      if (!objChallenge || objChallenge.consumed || dtNow.getTime() < objChallenge.created_ms
        || dtNow.getTime() >= objChallenge.expires_ms || objChallenge.source_digest !== digest(strSource)) return null;
      if (!reserve([[digest(`mfa-account:${objChallenge.user_id}`), 5], [digest(`mfa-source:${strSource}`), 30]], dtNow.getTime())) return null;
      // MFA consumes its counter in its own synchronous transaction. Failure after that
      // point may consume a valid code, but must never grant a session on partial work.
      if (!objMfaService.verifyCode(objChallenge.user_id, strCode)) return null;
      return runTransaction(objDatabase, () => {
        const dtIssued = now();
        const objCurrent = objDatabase.prepare(`SELECT c.*, u.role, u.state, u.revision AS user_revision
          FROM staff_credentials c JOIN staff_users u ON u.id = c.user_id WHERE c.user_id = ?`).get(objChallenge.user_id);
        const objFactor = objDatabase.prepare("SELECT id FROM mfa_references WHERE id = ? AND state = 'active'").get(objChallenge.factor_id);
        const objLive = objDatabase.prepare('SELECT consumed FROM login_challenges WHERE token_digest = ?').get(digest(strChallenge));
        if (!objLive || objLive.consumed || !objCurrent || objCurrent.state !== 'active' || objCurrent.role !== 'admin'
          || objCurrent.revision !== objChallenge.credential_revision || objCurrent.user_revision !== objChallenge.user_revision
          || !objFactor || dtIssued < dtNow || dtIssued.getTime() >= objChallenge.expires_ms) return null;
        objDatabase.prepare('UPDATE login_challenges SET consumed = 1 WHERE token_digest = ?').run(digest(strChallenge));
        return issue(objCurrent, dtIssued, true);
      });
    },
  });
}
