/**
 * Creates single-use recovery-code digests and sanitized recovery audit records. Plain
 * codes are shown once; the database does not store recoverable code text.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** Internal helpers: caller owns the synchronous transaction and authorization. */
export function recoveryDigest(strValue) { return createHash('sha256').update(strValue).digest('hex'); }
export function issueRecoveryCodes(objDatabase, strUserId, dtNow) {
  objDatabase.prepare("UPDATE recovery_codes SET state='revoked',closed_at=? WHERE user_id=? AND state='active'")
    .run(dtNow.toISOString(), strUserId);
  const arrCodes = Array.from({ length: 10 }, () => randomBytes(16).toString('hex'));
  for (const strCode of arrCodes) objDatabase.prepare('INSERT INTO recovery_codes (id,user_id,code_digest,created_at) VALUES (?,?,?,?)')
    .run(randomUUID(), strUserId, recoveryDigest(strCode), dtNow.toISOString());
  return arrCodes;
}
export function auditRecovery(objDatabase, strUserId, dtNow, bLocal = false) {
  const strEvent = randomUUID();
  objDatabase.prepare(`INSERT INTO audit_events
    (id,actor_id,action,entity_type,entity_id,occurred_at,correlation_id,reason_code,safe_change_summary)
    VALUES (?,?,'staff_change','staff_user',?,?,?,'security','Staff account changed')`)
    .run(strEvent, bLocal ? null : strUserId, strUserId, dtNow.toISOString(), strEvent);
}
