import { createHash, randomUUID } from 'node:crypto';
import { createSessionService } from './session-service.js';
import { hashPassword, verifyPassword } from './password-service.js';
import { validateNewPassword } from './password-policy.js';

let intActivePasswordChanges = 0;
export function validPage(intOffset, intLimit) {
  return Number.isSafeInteger(intOffset) && intOffset >= 0 && intOffset <= 1000000
    && Number.isSafeInteger(intLimit) && intLimit >= 1 && intLimit <= 100;
}

/** Internal account operations; accepts a bearer token, never a claimed actor/role. */
export function createStaffAccountService(objDatabase, { fnNow = () => new Date(), objMfaService } = {}) {
  const objSessions = createSessionService(objDatabase, { fnNow });
  function reserveChange(strUserId, strSource, dtNow) {
    const arrBuckets = [[`password-change-account:${strUserId}`, 5], [`password-change-source:${strSource}`, 30]];
    objDatabase.prepare('DELETE FROM login_limits WHERE window_start_ms <= ?').run(dtNow.getTime() - 900000);
    if (objDatabase.prepare('SELECT count(*) AS total FROM login_limits').get().total >= 5000) return false;
    for (const [strBucket, intLimit] of arrBuckets) {
      const strDigest = createHash('sha256').update(strBucket).digest('hex');
      const objRow = objDatabase.prepare('SELECT * FROM login_limits WHERE bucket_digest = ?').get(strDigest);
      if (objRow && (dtNow.getTime() < objRow.window_start_ms || objRow.attempts >= intLimit)) return false;
    }
    for (const [strBucket] of arrBuckets) {
      objDatabase.prepare(`INSERT INTO login_limits VALUES (?, ?, 1)
        ON CONFLICT(bucket_digest) DO UPDATE SET attempts = attempts + 1`)
        .run(createHash('sha256').update(strBucket).digest('hex'), dtNow.getTime());
    }
    return true;
  }
  function credential(strUserId) {
    return objDatabase.prepare(`SELECT c.*, v.epoch FROM staff_credentials c
      JOIN login_identity_versions v ON v.user_id = c.user_id WHERE c.user_id = ?`).get(strUserId);
  }
  return Object.freeze({
    listEmployees(strSessionToken, intOffset = 0, intLimit = 50) {
      if (!validPage(intOffset, intLimit)) return null;
      return objSessions.executeAuthorized(strSessionToken, 'employees.manage', (objIdentity) => {
        const arrRows = objDatabase.prepare(`SELECT u.id AS strUserId, c.username AS strUsername,
          u.state AS strState, u.created_at AS strCreatedAt, u.disabled_at AS strDisabledAt,
          u.revision AS intRevision, u.role AS strRole
          FROM staff_users u LEFT JOIN staff_credentials c ON c.user_id = u.id
          WHERE (u.role = 'employee' OR ? = 'owner') AND NOT EXISTS(SELECT 1 FROM staff_ownership WHERE user_id=u.id)
          ORDER BY u.created_at, u.id LIMIT ? OFFSET ?`).all(objIdentity.strRole, intLimit + 1, intOffset);
        return { arrEmployees: arrRows.slice(0, intLimit), bOwner: objIdentity.strRole === 'owner', intOffset, intLimit, bHasMore: arrRows.length > intLimit };
      });
    },
    async changeOwnPassword(strSessionToken, strCurrentPassword, strNewPassword, strCode, strSource) {
      if (typeof strSource !== 'string' || !strSource.length || strSource.length > 256
        || typeof strCurrentPassword !== 'string' || strCurrentPassword === strNewPassword
        || intActivePasswordChanges >= 2) return null;
      const objBefore = objSessions.executeAuthorized(strSessionToken, 'account.password.change', (objIdentity, dtNow) => {
        const objCredential = credential(objIdentity.strUserId);
        if (!objCredential || !validateNewPassword(strNewPassword, objCredential.username)
          || !reserveChange(objIdentity.strUserId, strSource, dtNow)) return null;
        return { ...objCredential, strRole: objIdentity.strRole, numStarted: dtNow.getTime() };
      });
      if (!objBefore) return null;
      let strHash;
      intActivePasswordChanges += 1;
      try {
        if (!await verifyPassword(strCurrentPassword, objBefore.password_hash)) return null;
        strHash = await hashPassword(strNewPassword);
      } finally { intActivePasswordChanges -= 1; }
      if (['admin','owner'].includes(objBefore.strRole)) {
        if (typeof objMfaService?.verifyCode !== 'function') throw new Error('MFA verification unavailable.');
        if (!objMfaService.verifyCode(objBefore.user_id, strCode)) return null;
      }
      return objSessions.executeAuthorized(strSessionToken, 'account.password.change', (objIdentity, dtNow) => {
        const objCurrent = credential(objIdentity.strUserId);
        if (!objCurrent || objCurrent.user_id !== objBefore.user_id || objIdentity.strRole !== objBefore.strRole
          || objCurrent.epoch !== objBefore.epoch || objCurrent.revision !== objBefore.revision
          || objCurrent.password_hash !== objBefore.password_hash || objCurrent.revision >= Number.MAX_SAFE_INTEGER
          || dtNow.getTime() < objBefore.numStarted || dtNow.getTime() - objBefore.numStarted >= 300000
          || dtNow.toISOString() < objCurrent.password_changed_at
          || objDatabase.prepare(`SELECT id FROM staff_sessions WHERE user_id = ? AND revoked_at IS NULL
            AND last_activity_at > ? LIMIT 1`).get(objCurrent.user_id, dtNow.toISOString())) return null;
        objDatabase.prepare(`UPDATE staff_credentials SET password_hash = ?, password_changed_at = ?, revision = revision + 1
          WHERE user_id = ?`).run(strHash, dtNow.toISOString(), objCurrent.user_id);
        const strEventId = randomUUID();
        objDatabase.prepare(`INSERT INTO audit_events
          (id, actor_id, action, entity_type, entity_id, occurred_at, correlation_id, reason_code, safe_change_summary)
          VALUES (?, ?, 'staff_change', 'staff_user', ?, ?, ?, 'security', 'Staff account changed')`)
          .run(strEventId, objIdentity.strUserId, objIdentity.strUserId, dtNow.toISOString(), strEventId);
        return Object.freeze({ strState: 'password_changed' });
      });
    },
    updateStaff(strSessionToken, strUserId, intRevision, strField, strValue) {
      if(typeof strUserId!=='string'||!strUserId.length||strUserId.length>128
        ||!Number.isSafeInteger(intRevision)||intRevision<1||intRevision>=Number.MAX_SAFE_INTEGER
        || !((strField==='role'&&['employee','admin'].includes(strValue))||(strField==='state'&&['active','disabled'].includes(strValue)))) return null;
      return objSessions.executeAuthorized(strSessionToken,strField==='role'?'staff.roles.change':'employees.manage',(objIdentity,dtNow)=>{
        const objUser=objDatabase.prepare('SELECT * FROM staff_users WHERE id=?').get(strUserId);
        if(!objUser||objUser.id===objIdentity.strUserId||objUser.revision!==intRevision
          ||objDatabase.prepare('SELECT user_id FROM staff_ownership WHERE user_id=?').get(strUserId)
          ||(objIdentity.strRole!=='owner'&&objUser.role!=='employee')||dtNow.toISOString()<objUser.created_at) return null;
        if(objUser[strField]===strValue)return {strState:'unchanged'};
        if(objDatabase.prepare('SELECT id FROM staff_sessions WHERE user_id=? AND revoked_at IS NULL AND last_activity_at>?').get(strUserId,dtNow.toISOString()))return null;
        objDatabase.prepare('UPDATE staff_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(dtNow.toISOString(),strUserId);
        // Invalidate once-only recovery/enrollment proofs as well as ordinary sessions.
        objDatabase.prepare("UPDATE recovery_requests SET state='cancelled',closed_at=? WHERE user_id=? AND state='pending'").run(dtNow.toISOString(),strUserId);
        if(strField==='role'){
          objDatabase.prepare('DELETE FROM recovery_locks WHERE user_id=?').run(strUserId);
          objDatabase.prepare('DELETE FROM staff_mfa_enrollments WHERE user_id=?').run(strUserId);
          objDatabase.prepare("UPDATE recovery_codes SET state='revoked',closed_at=? WHERE user_id=? AND state='active'").run(dtNow.toISOString(),strUserId);
          objDatabase.prepare('UPDATE staff_users SET role=?,revision=revision+1 WHERE id=?').run(strValue,strUserId);
          objDatabase.prepare("UPDATE mfa_references SET state='revoked',revoked_at=? WHERE user_id=? AND state='active'").run(dtNow.toISOString(),strUserId);
          if(strValue==='admin')objDatabase.prepare('INSERT INTO staff_mfa_enrollments VALUES(?,?)').run(strUserId,dtNow.toISOString());
        }else{
          objDatabase.prepare('UPDATE staff_users SET state=?,disabled_at=?,revision=revision+1 WHERE id=?').run(strValue,strValue==='disabled'?dtNow.toISOString():null,strUserId);
          // Preserve recovery locks and first-enrollment eligibility. Reactivation
          // must not turn a lost-factor recovery into password-only MFA reset.
        }
        const strEventId=randomUUID();
        objDatabase.prepare(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,occurred_at,correlation_id,reason_code,safe_change_summary)
          VALUES(?,?,'staff_change','staff_user',?,?,?,'security','Staff account changed')`).run(strEventId,objIdentity.strUserId,strUserId,dtNow.toISOString(),strEventId);
        return {strState:'updated'};
      });
    },
    deactivateEmployee(strSessionToken, strEmployeeId) {
      if (typeof strEmployeeId !== 'string' || !strEmployeeId.length || strEmployeeId.length > 128) return null;
      return objSessions.executeAuthorized(strSessionToken, 'employees.manage', (objIdentity, dtNow) => {
        const objEmployee = objDatabase.prepare('SELECT * FROM staff_users WHERE id = ?').get(strEmployeeId);
        if (!objEmployee || objEmployee.role !== 'employee' || objEmployee.id === objIdentity.strUserId) return null;
        if (objEmployee.state === 'disabled') return Object.freeze({ strState: 'already_disabled' });
        const strNow = dtNow.toISOString();
        // Do not write a revocation earlier than existing activity or account creation.
        if (strNow < objEmployee.created_at || objEmployee.revision >= Number.MAX_SAFE_INTEGER
          || objDatabase.prepare(`SELECT id FROM staff_sessions WHERE user_id = ?
            AND revoked_at IS NULL AND last_activity_at > ? LIMIT 1`).get(strEmployeeId, strNow)) return null;
        objDatabase.prepare(`UPDATE staff_users SET state = 'disabled', disabled_at = ?, revision = revision + 1
          WHERE id = ?`).run(strNow, strEmployeeId);
        // Existing triggers revoke all sessions, advance the login epoch and delete challenges.
        const strEventId = randomUUID();
        objDatabase.prepare(`INSERT INTO audit_events
          (id, actor_id, action, entity_type, entity_id, occurred_at, correlation_id, reason_code, safe_change_summary)
          VALUES (?, ?, 'staff_change', 'staff_user', ?, ?, ?, 'security', 'Staff account changed')`)
          .run(strEventId, objIdentity.strUserId, strEmployeeId, strNow, strEventId);
        return Object.freeze({ strState: 'disabled' });
      });
    },
  });
}
