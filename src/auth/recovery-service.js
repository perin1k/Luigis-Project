import { randomBytes, randomUUID } from 'node:crypto';
import { openDatabase, runTransaction } from '../data/database.js';
import { applyMigrations } from '../data/migrations.js';
import { createSessionService } from './session-service.js';
import { createMfaService } from './mfa-service.js';
import { hashPassword, verifyPassword } from './password-service.js';
import { validateNewPassword } from './password-policy.js';
import { isToken } from './auth-transport.js';
import { recoveryDigest, issueRecoveryCodes, auditRecovery } from './recovery-records.js';

const DUMMY_HASH = `scrypt-v1$131072$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
const RECOVERY_MS = 600000;
let intActiveProofs = 0;
export const LOCAL_RECOVERY_ACKNOWLEDGEMENT = 'Brody verified identity in person';

/** Public methods require real proof; beginLocalRecovery is OS-operator-only, never an HTTP endpoint. */
export function createRecoveryService(objDatabase, { strEncryptionKeyHex, strKeyId = 'local-v1', fnNow = () => new Date() } = {}) {
  const objSessions = createSessionService(objDatabase, { fnNow });
  const objLiveMfa = createMfaService(objDatabase, { strEncryptionKeyHex, strKeyId, fnNow });
  const mapStages = new Map();
  let bDestroyed = false;
  function clock() {
    if (bDestroyed) throw new Error('Recovery unavailable.');
    const dtNow = fnNow();
    if (!(dtNow instanceof Date) || !Number.isSafeInteger(dtNow.getTime()) || dtNow.getTime() < 0) throw new TypeError('Invalid server clock.');
    return dtNow;
  }
  function identity(strUsername) {
    return objDatabase.prepare(`SELECT c.*,u.role,u.state,v.epoch FROM staff_credentials c
      JOIN staff_users u ON u.id=c.user_id JOIN login_identity_versions v ON v.user_id=u.id WHERE c.username=?`).get(strUsername);
  }
  function same(objBefore, objAfter) {
    return objAfter && objAfter.state === 'active' && objAfter.user_id === objBefore.user_id
      && objAfter.epoch === objBefore.epoch && objAfter.revision === objBefore.revision
      && objAfter.role === objBefore.role && objAfter.password_hash === objBefore.password_hash;
  }
  function reserve(strAccount, strSource) {
    if (typeof strSource !== 'string' || !strSource.length || strSource.length > 256 || intActiveProofs >= 2) return null;
    return runTransaction(objDatabase, () => {
      const dtNow = clock();
      objDatabase.prepare('DELETE FROM login_limits WHERE window_start_ms<=?').run(dtNow.getTime() - 900000);
      if (objDatabase.prepare('SELECT count(*) AS total FROM login_limits').get().total >= 5000) return null;
      const arrBuckets = [[recoveryDigest(`recovery-account:${strAccount}`), 5], [recoveryDigest(`recovery-source:${strSource}`), 30]];
      for (const [strBucket, intLimit] of arrBuckets) {
        const objRow = objDatabase.prepare('SELECT * FROM login_limits WHERE bucket_digest=?').get(strBucket);
        if (objRow && (dtNow.getTime() < objRow.window_start_ms || objRow.attempts >= intLimit)) return null;
      }
      for (const [strBucket] of arrBuckets) objDatabase.prepare(`INSERT INTO login_limits VALUES (?,?,1)
        ON CONFLICT(bucket_digest) DO UPDATE SET attempts=attempts+1`).run(strBucket, dtNow.getTime());
      return dtNow;
    });
  }
  function dispose(strDigest) {
    const objStage = mapStages.get(strDigest);
    objStage?.objMfa?.destroy(); objStage?.objDb?.close(); mapStages.delete(strDigest);
  }
  function expireStages(dtNow) {
    for (const [strDigest, objStage] of mapStages) {
      if (dtNow.getTime() >= objStage.numExpires) {
        objDatabase.prepare("UPDATE recovery_requests SET state='expired',closed_at=? WHERE id=? AND state='pending'")
          .run(dtNow.toISOString(), objStage.strRequestId);
        dispose(strDigest);
      }
    }
  }
  function start(objBefore, strMethod, strCodeDigest, strNewHash, bFirstMfa = false) {
    const dtNow = clock(); expireStages(dtNow);
    if (mapStages.size >= 20) return null;
    let objDb = null; let objMfa = null; let objEnrollment = null;
    try {
      if (objBefore.role === 'admin') {
        objDb = openDatabase(':memory:'); applyMigrations(objDb);
        objDb.prepare("INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES (?,?,'admin',?)")
          .run(objBefore.user_id, `recovery-stage:${objBefore.user_id}`, dtNow.toISOString());
        objMfa = createMfaService(objDb, { strEncryptionKeyHex, strKeyId, fnNow });
        objEnrollment = objMfa.beginEnrollment(objBefore.user_id);
      }
      const strToken = randomBytes(32).toString('hex'); const strDigest = recoveryDigest(strToken); const strId = randomUUID();
      const objResult = runTransaction(objDatabase, () => {
        const dtLocked = clock();
        const objCurrent = identity(objBefore.username);
        if (!same(objBefore, objCurrent) || dtLocked < dtNow || dtLocked.getTime() - dtNow.getTime() >= RECOVERY_MS
          || objDatabase.prepare(`SELECT id FROM staff_sessions WHERE user_id=? AND revoked_at IS NULL AND last_activity_at>?`).get(objBefore.user_id, dtLocked.toISOString())
          || objDatabase.prepare(`SELECT id FROM mfa_secrets WHERE user_id=? AND state='active' AND last_verified_at>?`).get(objBefore.user_id, dtLocked.toISOString())) return null;
        if (strCodeDigest) {
          const objCode = objDatabase.prepare("SELECT id FROM recovery_codes WHERE user_id=? AND code_digest=? AND state='active' AND created_at<=?")
            .get(objBefore.user_id, strCodeDigest, dtLocked.toISOString());
          if (!objCode) return null;
          objDatabase.prepare("UPDATE recovery_codes SET state='used',closed_at=? WHERE id=?").run(dtLocked.toISOString(), objCode.id);
        }
        objDatabase.prepare("UPDATE recovery_requests SET state='cancelled',closed_at=? WHERE user_id=? AND state='pending'")
          .run(dtLocked.toISOString(), objBefore.user_id);
        objDatabase.prepare(`INSERT INTO recovery_requests (id,user_id,token_digest,method,created_at,expires_at,purpose)
          VALUES (?,?,?,?,?,?,?)`).run(strId, objBefore.user_id, strDigest, strMethod, dtNow.toISOString(), new Date(dtNow.getTime() + RECOVERY_MS).toISOString(),bFirstMfa?'first_mfa':'recovery');
        objDatabase.prepare(`INSERT INTO recovery_locks VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET request_id=excluded.request_id`)
          .run(objBefore.user_id, strId);
        objDatabase.prepare('UPDATE staff_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(dtLocked.toISOString(), objBefore.user_id);
        objDatabase.prepare("UPDATE mfa_references SET state='revoked',revoked_at=? WHERE user_id=? AND state='active'")
          .run(dtLocked.toISOString(), objBefore.user_id);
        objDatabase.prepare('UPDATE staff_users SET revision=revision+1 WHERE id=?').run(objBefore.user_id);
        auditRecovery(objDatabase, objBefore.user_id, dtLocked, strMethod === 'brody_in_person');
        return identity(objBefore.username);
      });
      if (!objResult) { objMfa?.destroy(); objDb?.close(); return null; }
      for (const [strOldDigest, objStage] of mapStages) if (objStage.strUserId === objBefore.user_id) dispose(strOldDigest);
      mapStages.set(strDigest, { objDb, objMfa, strRequestId: strId, strUserId: objBefore.user_id,
        strUsername: objBefore.username, intEpoch: objResult.epoch, intCredentialRevision: objResult.revision,
        strRole: objBefore.role, strMethod, strNewHash, strEnrollmentId: objEnrollment?.strEnrollmentId,
        numCreated: dtNow.getTime(), numLast: dtNow.getTime(), numExpires: dtNow.getTime() + RECOVERY_MS, bConfirmed: false });
      return { strRecoveryToken: strToken, strProvisioningUri: objEnrollment?.strProvisioningUri ?? null };
    } catch (objError) { objMfa?.destroy(); objDb?.close(); throw objError; }
  }
  return Object.freeze({
    async regenerateCodes(strSessionToken, strPassword, strCode, strSource) {
      const objBefore = objSessions.executeAuthorized(strSessionToken, 'account.password.change', (objIdentity) => {
        if (!['admin','owner'].includes(objIdentity.strRole)) return null;
        return objDatabase.prepare(`SELECT c.*,u.role,u.state,v.epoch FROM staff_credentials c JOIN staff_users u ON u.id=c.user_id
          JOIN login_identity_versions v ON v.user_id=u.id WHERE c.user_id=?`).get(objIdentity.strUserId);
      });
      if (!objBefore) return null;
      const dtStarted = reserve(objBefore.username, strSource); if (!dtStarted) return null;
      intActiveProofs += 1;
      let bValid;
      try { bValid = await verifyPassword(strPassword, objBefore.password_hash); }
      finally { intActiveProofs -= 1; }
      if (!bValid || bDestroyed || clock() < dtStarted || clock() - dtStarted >= 300000
        || !objLiveMfa.verifyCode(objBefore.user_id, strCode)) return null;
      return objSessions.executeAuthorized(strSessionToken, 'account.password.change', (objIdentity, dtNow) => {
        if (objIdentity.strUserId !== objBefore.user_id || !same(objBefore, identity(objBefore.username))) return null;
        const arrRecoveryCodes = issueRecoveryCodes(objDatabase, objBefore.user_id, dtNow);
        auditRecovery(objDatabase, objBefore.user_id, dtNow);
        return { arrRecoveryCodes };
      });
    },
    async beginPromotionEnrollment(strUsername, strPassword, strSource) {
      if(typeof strUsername!=='string'||!/^[a-zA-Z0-9._-]{3,64}$/.test(strUsername)||strUsername.includes('\n'))return null;
      const strCanonical=strUsername.toLowerCase();const dtStarted=reserve(strCanonical,strSource);if(!dtStarted)return null;
      const objBefore=identity(strCanonical);intActiveProofs+=1;let bValid;
      try{bValid=await verifyPassword(strPassword,objBefore?.password_hash??DUMMY_HASH);}finally{intActiveProofs-=1;}
      if(!bValid||!objBefore||objBefore.role!=='admin'||bDestroyed||clock()<dtStarted||clock()-dtStarted>=300000
        ||!objDatabase.prepare('SELECT user_id FROM staff_mfa_enrollments WHERE user_id=?').get(objBefore.user_id)
        ||objDatabase.prepare("SELECT id FROM mfa_references WHERE user_id=? AND state='active'").get(objBefore.user_id))return null;
      return start(objBefore,'password_and_code',null,null,true);
    },
    async beginRecovery(strUsername, strPassword, strRecoveryCode, strSource) {
      if (typeof strUsername !== 'string' || strUsername.length > 64 || !/^[a-zA-Z0-9._-]{3,64}$/.test(strUsername)
        || strUsername.includes('\n') || typeof strRecoveryCode !== 'string' || strRecoveryCode.length !== 32 || !/^[0-9a-f]{32}$/.test(strRecoveryCode)) return null;
      const strCanonical = strUsername.toLowerCase();
      const dtStarted = reserve(strCanonical, strSource); if (!dtStarted) return null;
      const objBefore = identity(strCanonical);
      intActiveProofs += 1; let bValid;
      try { bValid = await verifyPassword(strPassword, objBefore?.password_hash ?? DUMMY_HASH); }
      finally { intActiveProofs -= 1; }
      if (!bValid || !objBefore || objBefore.role !== 'admin' || bDestroyed
        || clock() < dtStarted || clock() - dtStarted >= 300000) return null;
      return start(objBefore, 'password_and_code', recoveryDigest(strRecoveryCode), null);
    },
    async beginLocalRecovery(strUsername, strNewPassword, strAcknowledgement) {
      if (strAcknowledgement !== LOCAL_RECOVERY_ACKNOWLEDGEMENT || typeof strUsername !== 'string' || strUsername.length > 64) return null;
      const objBefore = identity(strUsername.toLowerCase());
      if (!objBefore || objBefore.state !== 'active' || !validateNewPassword(strNewPassword, objBefore.username)) return null;
      const dtStarted = reserve(objBefore.username, 'local-operator'); if (!dtStarted) return null;
      intActiveProofs += 1; let strHash;
      try { strHash = await hashPassword(strNewPassword); }
      finally { intActiveProofs -= 1; }
      if (bDestroyed || clock() < dtStarted || clock() - dtStarted >= 300000) return null;
      return start(objBefore, 'brody_in_person', null, strHash);
    },
    confirmRecovery(strToken, strCode) {
      if (!isToken(strToken)) return null;
      const strDigest = recoveryDigest(strToken); const objStage = mapStages.get(strDigest);
      const dtNow = clock(); expireStages(dtNow);
      if (!objStage || !mapStages.has(strDigest) || dtNow.getTime() < objStage.numLast) return null;
      objStage.numLast = dtNow.getTime();
      const bReserved = runTransaction(objDatabase, () => {
        const objRequest = objDatabase.prepare(`SELECT r.* FROM recovery_requests r JOIN recovery_locks l ON l.request_id=r.id
          WHERE r.id=? AND r.state='pending'`).get(objStage.strRequestId);
        if (!objRequest || objRequest.attempts >= 5 || dtNow.toISOString() >= objRequest.expires_at) return false;
        objDatabase.prepare('UPDATE recovery_requests SET attempts=attempts+1 WHERE id=?').run(objRequest.id); return true;
      });
      if (!bReserved) return null;
      if (objStage.strRole === 'admin') {
        const bValid = objStage.bConfirmed ? objStage.objMfa.verifyCode(objStage.strUserId, strCode)
          : objStage.objMfa.confirmEnrollment(objStage.strUserId, objStage.strEnrollmentId, strCode);
        if (!bValid) return null;
        objStage.bConfirmed = true;
      }
      const objResult = runTransaction(objDatabase, () => {
        const dtLocked = clock(); const objCurrent = identity(objStage.strUsername);
        const objLock = objDatabase.prepare('SELECT request_id FROM recovery_locks WHERE user_id=?').get(objStage.strUserId);
        if (dtLocked < dtNow || dtLocked.getTime() >= objStage.numExpires || !objCurrent || objCurrent.state !== 'active'
          || objCurrent.role !== objStage.strRole || objCurrent.epoch !== objStage.intEpoch
          || objCurrent.revision !== objStage.intCredentialRevision || objLock?.request_id !== objStage.strRequestId) return null;
        if (objStage.strRole === 'admin') {
          const objFactor = objStage.objDb.prepare('SELECT * FROM mfa_secrets').get();
          const objReference = objStage.objDb.prepare('SELECT * FROM mfa_references').get();
          objDatabase.prepare(`INSERT INTO mfa_secrets (id,user_id,key_id,ciphertext,iv,auth_tag,created_at,enrollment_expires_at)
            VALUES (?,?,?,?,?,?,?,?)`).run(objFactor.id,objFactor.user_id,objFactor.key_id,objFactor.ciphertext,objFactor.iv,
            objFactor.auth_tag,objFactor.created_at,objFactor.enrollment_expires_at);
          objDatabase.prepare('INSERT INTO mfa_references (id,user_id,provider_reference,enrolled_at) VALUES (?,?,?,?)')
            .run(objReference.id,objReference.user_id,objReference.provider_reference,objReference.enrolled_at);
          objDatabase.prepare(`UPDATE mfa_secrets SET state='active',mfa_reference_id=?,confirmed_at=?,last_verified_at=?,last_counter=? WHERE id=?`)
            .run(objFactor.id,objFactor.confirmed_at,objFactor.last_verified_at,objFactor.last_counter,objFactor.id);
        }
        if (objStage.strNewHash) objDatabase.prepare('UPDATE staff_credentials SET password_hash=?,password_changed_at=?,revision=revision+1 WHERE user_id=?')
          .run(objStage.strNewHash,dtLocked.toISOString(),objStage.strUserId);
        objDatabase.prepare("UPDATE recovery_requests SET state='completed',closed_at=? WHERE id=?").run(dtLocked.toISOString(),objStage.strRequestId);
        objDatabase.prepare('DELETE FROM recovery_locks WHERE user_id=?').run(objStage.strUserId);
        objDatabase.prepare('DELETE FROM staff_mfa_enrollments WHERE user_id=?').run(objStage.strUserId);
        const arrRecoveryCodes = objStage.strRole === 'admin' ? issueRecoveryCodes(objDatabase,objStage.strUserId,dtLocked) : [];
        auditRecovery(objDatabase,objStage.strUserId,dtLocked,objStage.strMethod === 'brody_in_person');
        return { strState: 'recovered', arrRecoveryCodes };
      });
      if (objResult) dispose(strDigest);
      return objResult;
    },
    destroy() {
      bDestroyed = true; objLiveMfa.destroy();
      for (const strDigest of mapStages.keys()) dispose(strDigest);
      // A lost/interrupted challenge never removes the persistent access lock.
    },
  });
}
