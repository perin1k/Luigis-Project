import { randomUUID } from 'node:crypto';
import { createSessionService } from './session-service.js';

/** Internal employee deactivation only; accepts a bearer token, never a claimed actor/role. */
export function createStaffAccountService(objDatabase, { fnNow = () => new Date() } = {}) {
  const objSessions = createSessionService(objDatabase, { fnNow });
  return Object.freeze({
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
