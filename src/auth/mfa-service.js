/**
 * Encrypted authenticator enrollment and time-code verification. Pending factors must be
 * proved before activation; stored counters prevent replaying an already accepted time
 * step.
 */
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import { runTransaction } from '../data/database.js';

const ENROLLMENT_TIMEOUT_MS = 10 * 60 * 1000;
const PERIOD_MS = 30000;

function validCode(strCode) { return typeof strCode === 'string' && strCode.length === 6 && /^[0-9]{6}$/.test(strCode); }
function createTotp(objBytes, strLabel) {
  return new OTPAuth.TOTP({ issuer: 'Luigis Pizza Demo', label: strLabel,
    algorithm: 'SHA1', digits: 6, period: 30,
    secret: new OTPAuth.Secret({ buffer: Uint8Array.from(objBytes).buffer }) });
}

/** Internal server service: caller must establish identity and authorize enrollment. */
export function createMfaService(objDatabase, {
  strEncryptionKeyHex = process.env.MFA_ENCRYPTION_KEY_HEX,
  strKeyId = 'local-v1', fnNow = () => new Date(),
} = {}) {
  if (typeof strEncryptionKeyHex !== 'string' || strEncryptionKeyHex.length !== 64
    || !/^[0-9a-f]{64}$/.test(strEncryptionKeyHex) || typeof strKeyId !== 'string'
    || !/^[a-z0-9_-]{1,32}$/.test(strKeyId)) throw new TypeError('Valid MFA encryption key and key ID are required.');
  const objKey = Buffer.from(strEncryptionKeyHex, 'hex');
  let bDestroyed = false;

  function readClock() {
    if (bDestroyed) throw new Error('MFA service is destroyed.');
    const dtNow = fnNow();
    if (!(dtNow instanceof Date) || !Number.isFinite(dtNow.getTime()) || dtNow.getTime() < 0) throw new TypeError('Invalid server clock.');
    return dtNow;
  }
  function isActiveAdmin(strUserId) {
    return typeof strUserId === 'string' && Boolean(objDatabase.prepare("SELECT id FROM staff_users WHERE id = ? AND state = 'active' AND role = 'admin'").get(strUserId));
  }
  function associatedData(strId, strUserId, strStoredKeyId) {
    return Buffer.from(JSON.stringify(['luigis-totp-v1', strId, strUserId, strStoredKeyId]));
  }
  function decryptSecret(objRow) {
    if (objRow.key_id !== strKeyId) throw new Error('Unable to decrypt MFA factor.');
    let objPlaintext;
    try {
      const objDecipher = createDecipheriv('aes-256-gcm', objKey, objRow.iv);
      objDecipher.setAAD(associatedData(objRow.id, objRow.user_id, objRow.key_id));
      objDecipher.setAuthTag(objRow.auth_tag);
      objPlaintext = objDecipher.update(objRow.ciphertext);
      return Buffer.concat([objPlaintext, objDecipher.final()]);
    } catch {
      throw new Error('Unable to decrypt MFA factor.');
    } finally {
      objPlaintext?.fill(0);
    }
  }
  function matchCounter(objRow, strCode, dtNow) {
    const objSecret = decryptSecret(objRow);
    const objTotp = createTotp(objSecret, objRow.user_id);
    try {
      const numDelta = objTotp.validate({ token: strCode, timestamp: dtNow.getTime(), window: 1 });
      return numDelta === null ? null : Math.floor(dtNow.getTime() / PERIOD_MS) + numDelta;
    } finally { objSecret.fill(0); objTotp.secret.bytes.fill(0); }
  }
  function auditFactor(strId, strUserId, dtNow) {
    const strEventId = randomUUID();
    objDatabase.prepare(`INSERT INTO audit_events
      (id, actor_id, action, entity_type, entity_id, occurred_at, correlation_id, reason_code, safe_change_summary)
      VALUES (?, ?, 'mfa_change', 'mfa_reference', ?, ?, ?, 'security', 'MFA reference changed')`)
      .run(strEventId, strUserId, strId, dtNow.toISOString(), strEventId);
  }
  function expireEnrollment(objRow) {
    objDatabase.prepare("UPDATE mfa_secrets SET state = 'expired', ciphertext = NULL, iv = NULL, auth_tag = NULL WHERE id = ?")
      .run(objRow.id);
  }

  return Object.freeze({
    beginEnrollment(strUserId) {
      return runTransaction(objDatabase, () => {
        const dtNow = readClock();
        if (!isActiveAdmin(strUserId)) throw new Error('MFA enrollment unavailable.');
        const objExisting = objDatabase.prepare("SELECT * FROM mfa_secrets WHERE user_id = ? AND state IN ('pending', 'active')").get(strUserId);
        if (objExisting) {
          if (objExisting.state === 'pending' && dtNow.toISOString() >= objExisting.enrollment_expires_at) expireEnrollment(objExisting);
          else throw new Error('MFA enrollment unavailable.');
        }
        if (objDatabase.prepare("SELECT id FROM mfa_references WHERE user_id = ? AND state = 'active'").get(strUserId)) throw new Error('MFA enrollment unavailable.');
        const strId = randomUUID();
        const objSecret = randomBytes(20);
        const objTotp = createTotp(objSecret, strUserId);
        try {
          const objIv = randomBytes(12);
          const objCipher = createCipheriv('aes-256-gcm', objKey, objIv);
          objCipher.setAAD(associatedData(strId, strUserId, strKeyId));
          const objCiphertext = Buffer.concat([objCipher.update(objSecret), objCipher.final()]);
          objDatabase.prepare(`INSERT INTO mfa_secrets
            (id, user_id, key_id, ciphertext, iv, auth_tag, created_at, enrollment_expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(strId, strUserId, strKeyId, objCiphertext, objIv, objCipher.getAuthTag(), dtNow.toISOString(),
              new Date(dtNow.getTime() + ENROLLMENT_TIMEOUT_MS).toISOString());
          return { strEnrollmentId: strId, strProvisioningUri: objTotp.toString() };
        } finally { objSecret.fill(0); objTotp.secret.bytes.fill(0); }
      });
    },
    confirmEnrollment(strUserId, strEnrollmentId, strCode) {
      if (!validCode(strCode) || typeof strEnrollmentId !== 'string') return false;
      return runTransaction(objDatabase, () => {
        const dtNow = readClock();
        if (!isActiveAdmin(strUserId)) return false;
        const objRow = objDatabase.prepare("SELECT * FROM mfa_secrets WHERE id = ? AND user_id = ? AND state = 'pending'").get(strEnrollmentId, strUserId);
        if (!objRow || dtNow.toISOString() < objRow.created_at) return false;
        if (dtNow.toISOString() >= objRow.enrollment_expires_at) { expireEnrollment(objRow); return false; }
        const intCounter = matchCounter(objRow, strCode, dtNow);
        if (intCounter === null) return false;
        objDatabase.prepare(`INSERT INTO mfa_references (id, user_id, provider_reference, enrolled_at)
          VALUES (?, ?, ?, ?)`).run(objRow.id, strUserId, `local-totp:${objRow.id}`, dtNow.toISOString());
        objDatabase.prepare(`UPDATE mfa_secrets SET state = 'active', mfa_reference_id = id,
          confirmed_at = ?, last_verified_at = ?, last_counter = ? WHERE id = ?`)
          .run(dtNow.toISOString(), dtNow.toISOString(), intCounter, objRow.id);
        auditFactor(objRow.id, strUserId, dtNow);
        return true;
      });
    },
    verifyCode(strUserId, strCode) {
      if (!validCode(strCode)) return false;
      return runTransaction(objDatabase, () => {
        const dtNow = readClock();
        if (!isActiveAdmin(strUserId)) return false;
        const objRow = objDatabase.prepare(`SELECT s.* FROM mfa_secrets s JOIN mfa_references r ON r.id = s.mfa_reference_id
          WHERE s.user_id = ? AND s.state = 'active' AND r.state = 'active'`).get(strUserId);
        if (!objRow || dtNow.toISOString() < objRow.last_verified_at) return false;
        const intCounter = matchCounter(objRow, strCode, dtNow);
        if (intCounter === null || intCounter <= objRow.last_counter) return false;
        objDatabase.prepare('UPDATE mfa_secrets SET last_counter = ?, last_verified_at = ? WHERE id = ?')
          .run(intCounter, dtNow.toISOString(), objRow.id);
        return true;
      });
    },
    destroy() { objKey.fill(0); bDestroyed = true; },
  });
}
