import { createHash, randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { runTransaction } from '../data/database.js';
import { canPerformAction } from './permissions.js';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

function tokenDigest(strToken) {
  if (typeof strToken !== 'string' || strToken.length !== 64 || !/^[0-9a-f]{64}$/.test(strToken)) return null;
  return createHash('sha256').update(strToken).digest('hex');
}

function parseTimestamp(strValue) {
  if (typeof strValue !== 'string') return NaN;
  const numTime = Date.parse(strValue);
  return Number.isFinite(numTime) && new Date(numTime).toISOString() === strValue ? numTime : NaN;
}

/** Server-only factory. fnNow is a trusted clock dependency, never request input. */
export function createSessionService(objDatabase, { fnNow = () => new Date() } = {}) {
  function readClock() {
    const dtNow = fnNow();
    if (!(dtNow instanceof Date) || !Number.isFinite(dtNow.getTime())) throw new TypeError('Invalid server clock.');
    return dtNow;
  }

  function findSession(strDigest) {
    return objDatabase.prepare(`SELECT s.*, u.role, r.effective_role, u.state AS user_state FROM staff_sessions s
      JOIN staff_users u ON u.id = s.user_id JOIN staff_role_view r ON r.id=u.id WHERE s.session_token_digest = ?`).get(strDigest);
  }

  function recordRevocation(objSession, dtNow, strReason) {
    objDatabase.prepare('UPDATE staff_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(dtNow.toISOString(), objSession.id);
    const strEventId = randomUUID();
    objDatabase.prepare(`INSERT INTO audit_events
      (id, actor_id, action, entity_type, entity_id, occurred_at, correlation_id, reason_code, safe_change_summary)
      VALUES (?, NULL, 'session_revocation', 'staff_session', ?, ?, ?, ?, 'Session revoked')`)
      .run(strEventId, objSession.id, dtNow.toISOString(), strEventId, strReason);
  }

  function resolveSession(strToken, strAction, bCheckPermission, fnWork) {
    const strDigest = tokenDigest(strToken);
    if (!strDigest) return null;
    return runTransaction(objDatabase, () => {
      const dtNow = readClock();
      const objSession = findSession(strDigest);
      if (!objSession || objSession.revoked_at !== null) return null;
      const numNow = dtNow.getTime();
      const numAuthenticated = parseTimestamp(objSession.authenticated_at);
      const numActivity = parseTimestamp(objSession.last_activity_at);
      const numExpiry = parseTimestamp(objSession.expires_at);
      if (![numAuthenticated, numActivity, numExpiry].every(Number.isFinite)
        || numActivity < numAuthenticated || numNow < numActivity
        || numExpiry - numAuthenticated !== ABSOLUTE_TIMEOUT_MS) return null;
      if (numNow >= numExpiry || numNow - numActivity >= IDLE_TIMEOUT_MS) {
        recordRevocation(objSession, dtNow, 'security');
        return null;
      }
      if (objSession.user_state !== 'active' || !['employee', 'admin'].includes(objSession.role)) return null;
      if (objDatabase.prepare('SELECT user_id FROM recovery_locks WHERE user_id=?').get(objSession.user_id)) return null;
      if (objSession.role === 'admin') {
        const numMfa = parseTimestamp(objSession.mfa_verified_at);
        if (!Number.isFinite(numMfa) || numMfa < numAuthenticated || numMfa > numActivity) return null;
      }
      if (bCheckPermission && !canPerformAction(objSession.effective_role, strAction)) return null;
      objDatabase.prepare('UPDATE staff_sessions SET last_activity_at = ? WHERE id = ?').run(dtNow.toISOString(), objSession.id);
      const objIdentity = Object.freeze({ strSessionId: objSession.id, strUserId: objSession.user_id, strRole: objSession.effective_role });
      return fnWork ? fnWork(objIdentity, dtNow) : objIdentity;
    });
  }

  return Object.freeze({
    validateSession(strToken) { return resolveSession(strToken, null, false); },
    authorizeSession(strToken, strAction) { return resolveSession(strToken, strAction, true); },
    // Internal synchronous transaction boundary: authorization and mutation share the lock.
    executeAuthorized(strToken, strAction, fnWork) {
      if (typeof fnWork !== 'function' || types.isAsyncFunction(fnWork)) throw new TypeError('Authorized work must be synchronous.');
      return resolveSession(strToken, strAction, true, fnWork);
    },
    revokeSession(strToken) {
      const strDigest = tokenDigest(strToken);
      if (!strDigest) return false;
      return runTransaction(objDatabase, () => {
        const dtNow = readClock();
        const objSession = findSession(strDigest);
        if (!objSession || objSession.revoked_at !== null
          || !Number.isFinite(parseTimestamp(objSession.last_activity_at))
          || dtNow.getTime() < parseTimestamp(objSession.last_activity_at)) return false;
        recordRevocation(objSession, dtNow, 'operator_request');
        return true;
      });
    },
  });
}
