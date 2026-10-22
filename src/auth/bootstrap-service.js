import { randomUUID } from 'node:crypto';
import { openDatabase, runTransaction } from '../data/database.js';
import { applyMigrations } from '../data/migrations.js';
import { hashPassword } from './password-service.js';
import { validateNewPassword } from './password-policy.js';
import { createMfaService } from './mfa-service.js';
import { issueRecoveryCodes } from './recovery-records.js';

const TIMEOUT_MS = 600000;

/** Local setup only. Never mount this service in a public route. */
export function createBootstrapService(objDatabase, { strEncryptionKeyHex, strKeyId = 'local-v1', fnNow = () => new Date() } = {}) {
  let objStage = null;
  let objMfa = null;
  let objPending = null;
  let bBusy = false;
  let bFinished = false;
  function clock() {
    const dtNow = fnNow();
    if (!(dtNow instanceof Date) || !Number.isSafeInteger(dtNow.getTime()) || dtNow.getTime() < 0) throw new TypeError('Invalid server clock.');
    return dtNow;
  }
  function ensureFirst() {
    if (objDatabase.prepare("SELECT id FROM staff_users WHERE role = 'admin' OR identity_subject LIKE 'local-bootstrap:%' LIMIT 1").get()) throw new Error('Initial admin setup unavailable.');
  }
  function closeStage() {
    objMfa?.destroy(); objMfa = null;
    objStage?.close(); objStage = null; objPending = null;
  }
  function audit(strAction, strEntity, strId, strSummary, dtNow) {
    const strEvent = randomUUID();
    objDatabase.prepare(`INSERT INTO audit_events
      (id, actor_id, action, entity_type, entity_id, occurred_at, correlation_id, reason_code, safe_change_summary)
      VALUES (?, NULL, ?, ?, ?, ?, ?, 'security', ?)`)
      .run(strEvent, strAction, strEntity, strId, dtNow.toISOString(), strEvent, strSummary);
  }
  return Object.freeze({
    async beginSetup(strUsername, strPassword) {
      if (bBusy || bFinished || objStage) throw new Error('Initial admin setup unavailable.');
      if (typeof strUsername !== 'string' || strUsername.length > 64
        || !/^[a-zA-Z0-9._-]{3,64}$/.test(strUsername) || strUsername.includes('\n')) throw new Error('Invalid setup input.');
      const strCanonical = strUsername.toLowerCase();
      if (!validateNewPassword(strPassword, strCanonical)) throw new Error('Password does not meet enrollment policy.');
      ensureFirst();
      const dtStarted = clock();
      bBusy = true;
      try {
        const strHash = await hashPassword(strPassword);
        if (bFinished) throw new Error('Initial admin setup unavailable.');
        const dtNow = clock();
        if (dtNow < dtStarted || dtNow - dtStarted >= TIMEOUT_MS) throw new Error('Initial admin setup expired.');
        ensureFirst();
        if (objDatabase.prepare('SELECT user_id FROM staff_credentials WHERE username = ?').get(strCanonical)) throw new Error('Initial admin setup unavailable.');
        objStage = openDatabase(':memory:');
        applyMigrations(objStage);
        const strUserId = randomUUID();
        objStage.prepare('INSERT INTO staff_users (id, identity_subject, role, created_at) VALUES (?, ?, ?, ?)')
          .run(strUserId, `local-bootstrap:${strUserId}`, 'admin', dtNow.toISOString());
        objStage.prepare(`INSERT INTO staff_credentials (user_id, username, password_hash, created_at, password_changed_at)
          VALUES (?, ?, ?, ?, ?)`).run(strUserId, strCanonical, strHash, dtNow.toISOString(), dtNow.toISOString());
        objMfa = createMfaService(objStage, { strEncryptionKeyHex, strKeyId, fnNow });
        const objEnrollment = objMfa.beginEnrollment(strUserId);
        objPending = { strUserId, strEnrollmentId: objEnrollment.strEnrollmentId, numStarted: dtNow.getTime(),
          numLast: dtNow.getTime(), intAttempts: 0, bConfirmed: false };
        return Object.freeze({ strProvisioningUri: objEnrollment.strProvisioningUri });
      } catch (objError) { closeStage(); throw objError; }
      finally { bBusy = false; }
    },
    confirmSetup(strCode) {
      if (!objPending || bFinished) return false;
      const dtNow = clock();
      if (dtNow.getTime() < objPending.numLast || dtNow.getTime() - objPending.numStarted >= TIMEOUT_MS
        || objPending.intAttempts >= 5) { closeStage(); return false; }
      objPending.numLast = dtNow.getTime(); objPending.intAttempts += 1;
      const bValid = objPending.bConfirmed ? objMfa.verifyCode(objPending.strUserId, strCode)
        : objMfa.confirmEnrollment(objPending.strUserId, objPending.strEnrollmentId, strCode);
      if (!bValid) { if (objPending.intAttempts >= 5) closeStage(); return false; }
      objPending.bConfirmed = true;
      const objUser = objStage.prepare('SELECT * FROM staff_users').get();
      const objCredential = objStage.prepare('SELECT * FROM staff_credentials').get();
      const objFactor = objStage.prepare('SELECT * FROM mfa_secrets').get();
      const objReference = objStage.prepare('SELECT * FROM mfa_references').get();
      const arrRecoveryCodes = runTransaction(objDatabase, () => {
        const dtCommitted = clock();
        if (dtCommitted < dtNow || dtCommitted.getTime() - objPending.numStarted >= TIMEOUT_MS) throw new Error('Initial admin setup expired.');
        ensureFirst();
        objDatabase.prepare('INSERT INTO staff_users (id, identity_subject, role, created_at) VALUES (?, ?, ?, ?)')
          .run(objUser.id, objUser.identity_subject, objUser.role, objUser.created_at);
        objDatabase.prepare(`INSERT INTO staff_credentials (user_id, username, password_hash, created_at, password_changed_at)
          VALUES (?, ?, ?, ?, ?)`).run(objCredential.user_id, objCredential.username, objCredential.password_hash,
          objCredential.created_at, objCredential.password_changed_at);
        // Replay the reviewed pending -> active transition; never bypass insert/state triggers.
        objDatabase.prepare(`INSERT INTO mfa_secrets
          (id, user_id, key_id, ciphertext, iv, auth_tag, created_at, enrollment_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(objFactor.id, objFactor.user_id, objFactor.key_id, objFactor.ciphertext, objFactor.iv, objFactor.auth_tag,
            objFactor.created_at, objFactor.enrollment_expires_at);
        objDatabase.prepare('INSERT INTO mfa_references (id, user_id, provider_reference, enrolled_at) VALUES (?, ?, ?, ?)')
          .run(objReference.id, objReference.user_id, objReference.provider_reference, objReference.enrolled_at);
        objDatabase.prepare(`UPDATE mfa_secrets SET state = 'active', mfa_reference_id = ?, confirmed_at = ?,
          last_verified_at = ?, last_counter = ? WHERE id = ?`).run(objFactor.mfa_reference_id,
          objFactor.confirmed_at, objFactor.last_verified_at, objFactor.last_counter, objFactor.id);
        audit('staff_change', 'staff_user', objUser.id, 'Staff account changed', dtCommitted);
        audit('mfa_change', 'mfa_reference', objFactor.id, 'MFA reference changed', dtCommitted);
        return issueRecoveryCodes(objDatabase, objUser.id, dtCommitted);
      });
      bFinished = true; closeStage(); return { arrRecoveryCodes };
    },
    cancel() { bFinished = true; closeStage(); },
  });
}
