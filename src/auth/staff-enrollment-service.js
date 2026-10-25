/**
 * Staff invitations bind a requested role to the issuing account version and a one-use
 * token digest. Expensive password hashing runs outside the transaction, followed by
 * live invitation/issuer rechecks.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { runTransaction } from '../data/database.js';
import { createSessionService } from './session-service.js';
import { hashPassword } from './password-service.js';
import { validateNewPassword } from './password-policy.js';
import { isToken } from './auth-transport.js';
import { validPage } from './staff-account-service.js';

const WINDOW_MS = 900000;
let intActiveEnrollments = 0;
function digest(strValue) { return createHash('sha256').update(strValue).digest('hex'); }
function username(strValue) {
  return typeof strValue === 'string' && strValue.length <= 64 && !strValue.includes('\n')
    && /^[a-zA-Z0-9._-]{3,64}$/.test(strValue) ? strValue.toLowerCase() : null;
}

export function createStaffEnrollmentService(objDatabase, { fnNow = () => new Date() } = {}) {
  const objSessions = createSessionService(objDatabase, { fnNow });
  function clock() {
    const dtNow = fnNow();
    if (!(dtNow instanceof Date) || !Number.isSafeInteger(dtNow.getTime()) || dtNow.getTime() < 0) throw new TypeError('Invalid server clock.');
    return dtNow;
  }
  function usable(objInvite, dtNow) {
    if (!objInvite || objInvite.state !== 'pending' || dtNow.toISOString() < objInvite.created_at
      || dtNow.toISOString() >= objInvite.expires_at) return false;
    return Boolean(objDatabase.prepare(`SELECT u.id FROM staff_users u JOIN login_identity_versions v ON v.user_id = u.id
      WHERE u.id = ? AND u.role = 'admin' AND u.state = 'active' AND v.epoch = ?
      AND (?='employee' OR EXISTS(SELECT 1 FROM staff_ownership WHERE user_id=u.id))`).get(objInvite.issued_by, objInvite.issuer_epoch,objInvite.requested_role));
  }
  return Object.freeze({
    listInvitations(strSessionToken, intOffset = 0, intLimit = 50) {
      if (!validPage(intOffset, intLimit)) return null;
      return objSessions.executeAuthorized(strSessionToken, 'employees.manage', (objIdentity) => {
        const arrRows = objDatabase.prepare(`SELECT id AS strInvitationId, username AS strUsername,
          state AS strState, requested_role AS strRole, issued_by AS strIssuedBy, created_at AS strCreatedAt, expires_at AS strExpiresAt,
          closed_at AS strClosedAt, accepted_user_id AS strAcceptedUserId FROM staff_invitations
          WHERE requested_role='employee' OR ?='owner' ORDER BY created_at, id LIMIT ? OFFSET ?`).all(objIdentity.strRole,intLimit + 1, intOffset);
        return { arrInvitations: arrRows.slice(0, intLimit), intOffset, intLimit, bHasMore: arrRows.length > intLimit };
      });
    },
    issueInvitation(strSessionToken, strUsername, strRole = 'employee') {
      const strCanonical = username(strUsername);
      if (!strCanonical || !['employee','admin'].includes(strRole)) return null;
      return objSessions.executeAuthorized(strSessionToken, 'employees.manage', (objIdentity, dtNow) => {
        if(strRole==='admin'&&objIdentity.strRole!=='owner')return null;
        objDatabase.prepare(`UPDATE staff_invitations SET state = 'expired', closed_at = ?
          WHERE username = ? AND state = 'pending' AND expires_at <= ?`)
          .run(dtNow.toISOString(), strCanonical, dtNow.toISOString());
        if (objDatabase.prepare('SELECT user_id FROM staff_credentials WHERE username = ?').get(strCanonical)
          || objDatabase.prepare("SELECT id FROM staff_invitations WHERE username = ? AND state = 'pending'").get(strCanonical)) return null;
        const strToken = randomBytes(32).toString('hex');
        const strId = randomUUID();
        const strExpiry = new Date(dtNow.getTime() + 86400000).toISOString();
        const intEpoch = objDatabase.prepare('SELECT epoch FROM login_identity_versions WHERE user_id = ?').get(objIdentity.strUserId).epoch;
        objDatabase.prepare(`INSERT INTO staff_invitations (id, username, token_digest, issued_by, issuer_epoch, created_at, expires_at, requested_role)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(strId, strCanonical, digest(strToken), objIdentity.strUserId, intEpoch, dtNow.toISOString(), strExpiry,strRole);
        return Object.freeze({ strInvitationId: strId, strInvitationToken: strToken, strExpiresAt: strExpiry });
      });
    },
    revokeInvitation(strSessionToken, strInvitationId) {
      if (typeof strInvitationId !== 'string' || !strInvitationId.length || strInvitationId.length > 128) return null;
      return objSessions.executeAuthorized(strSessionToken, 'employees.manage', (objIdentity, dtNow) => {
        const objInvite = objDatabase.prepare('SELECT * FROM staff_invitations WHERE id = ?').get(strInvitationId);
        if(objInvite?.requested_role==='admin'&&objIdentity.strRole!=='owner')return null;
        if (!objInvite || dtNow.toISOString() < objInvite.created_at) return null;
        if (objInvite.state === 'revoked') return Object.freeze({ strState: 'revoked' });
        if (objInvite.state !== 'pending') return null;
        objDatabase.prepare("UPDATE staff_invitations SET state = 'revoked', closed_at = ?, revoked_by = ? WHERE id = ?")
          .run(dtNow.toISOString(), objIdentity.strUserId, strInvitationId);
        return Object.freeze({ strState: 'revoked' });
      });
    },
    async acceptInvitation(strInvitationToken, strPassword, strSource) {
      if (!isToken(strInvitationToken) || typeof strSource !== 'string' || !strSource.length || strSource.length > 256
        || intActiveEnrollments >= 2) return null;
      const strDigest = digest(strInvitationToken);
      let dtStarted;
      const objBefore = runTransaction(objDatabase, () => {
        dtStarted = clock();
        const objInvite = objDatabase.prepare('SELECT * FROM staff_invitations WHERE token_digest = ?').get(strDigest);
        if (!usable(objInvite, dtStarted) || objInvite.attempt_count >= 5 || !validateNewPassword(strPassword, objInvite.username)) return null;
        const strBucket = digest(`enrollment-source:${strSource}`);
        objDatabase.prepare('DELETE FROM login_limits WHERE window_start_ms <= ?').run(dtStarted.getTime() - WINDOW_MS);
        const objLimit = objDatabase.prepare('SELECT * FROM login_limits WHERE bucket_digest = ?').get(strBucket);
        if ((objLimit && (dtStarted.getTime() < objLimit.window_start_ms || objLimit.attempts >= 30))
          || objDatabase.prepare('SELECT count(*) AS total FROM login_limits').get().total >= 5000) return null;
        objDatabase.prepare(`INSERT INTO login_limits VALUES (?, ?, 1)
          ON CONFLICT(bucket_digest) DO UPDATE SET attempts = attempts + 1`).run(strBucket, dtStarted.getTime());
        objDatabase.prepare('UPDATE staff_invitations SET attempt_count = attempt_count + 1 WHERE id = ?').run(objInvite.id);
        return objInvite;
      });
      if (!objBefore) return null;
      let strHash;
      intActiveEnrollments += 1;
      // Do not hold a SQLite write lock while deriving the password hash.
      try { strHash = await hashPassword(strPassword); }
      finally { intActiveEnrollments -= 1; }
      return runTransaction(objDatabase, () => {
        const dtNow = clock();
        const objInvite = objDatabase.prepare('SELECT * FROM staff_invitations WHERE token_digest = ?').get(strDigest);
        if (dtNow < dtStarted || !usable(objInvite, dtNow)
          || objDatabase.prepare('SELECT user_id FROM staff_credentials WHERE username = ?').get(objBefore.username)) return null;
        const strUserId = randomUUID();
        objDatabase.prepare("INSERT INTO staff_users (id, identity_subject, role, created_at) VALUES (?, ?, ?, ?)")
          .run(strUserId, `local:${strUserId}`,objInvite.requested_role, dtNow.toISOString());
        if(objInvite.requested_role==='admin')objDatabase.prepare('INSERT INTO staff_mfa_enrollments VALUES(?,?)').run(strUserId,dtNow.toISOString());
        objDatabase.prepare(`INSERT INTO staff_credentials (user_id, username, password_hash, created_at, password_changed_at)
          VALUES (?, ?, ?, ?, ?)`).run(strUserId, objInvite.username, strHash, dtNow.toISOString(), dtNow.toISOString());
        objDatabase.prepare("UPDATE staff_invitations SET state = 'accepted', closed_at = ?, accepted_user_id = ? WHERE id = ?")
          .run(dtNow.toISOString(), strUserId, objInvite.id);
        const strEventId = randomUUID();
        objDatabase.prepare(`INSERT INTO audit_events
          (id, actor_id, action, entity_type, entity_id, occurred_at, correlation_id, reason_code, safe_change_summary)
          VALUES (?, ?, 'staff_change', 'staff_user', ?, ?, ?, 'security', 'Staff account changed')`)
          .run(strEventId, objInvite.issued_by, strUserId, dtNow.toISOString(), strEventId);
        return Object.freeze({ strState: 'enrolled' });
      });
    },
  });
}
