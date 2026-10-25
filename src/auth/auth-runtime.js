/**
 * Composes staff authentication services against one database and explicit public
 * origin. Owned MFA/recovery resources are destroyed on setup failure and process
 * shutdown.
 */
import { createMfaService } from './mfa-service.js';
import { createLoginService } from './login-service.js';
import { createSessionService } from './session-service.js';
import { createStaffAccountService } from './staff-account-service.js';
import { createStaffEnrollmentService } from './staff-enrollment-service.js';
import { createRecoveryService } from './recovery-service.js';
import { createAuthRouter } from './auth-router.js';

/** Compose existing services around one migrated database; no accounts are created. */
export function createAuthRuntime(objDatabase, { strOrigin, strEncryptionKeyHex, fnNow } = {}) {
  const objOptions = { strEncryptionKeyHex, ...(fnNow ? { fnNow } : {}) };
  const objMfaService = createMfaService(objDatabase, objOptions);
  let objRecoveryService;
  try {
    objRecoveryService = createRecoveryService(objDatabase, objOptions);
    const objSessionService = createSessionService(objDatabase, objOptions);
    const objStaffAccountService = createStaffAccountService(objDatabase, { ...objOptions, objMfaService });
    const objStaffEnrollmentService = createStaffEnrollmentService(objDatabase, objOptions);
    const objRouter = createAuthRouter({ strOrigin, objSessionService, objRecoveryService,
      objLoginService: createLoginService(objDatabase, { ...objOptions, objMfaService }),
      objStaffAccountService, objStaffEnrollmentService });
    return { objRouter, objSessionService, strOrigin,
      readAccountLists(strSessionToken) {
        const objEmployees = objStaffAccountService.listEmployees(strSessionToken, 0, 10);
        const objInvitations = objStaffEnrollmentService.listInvitations(strSessionToken, 0, 10);
        return objEmployees && objInvitations ? { employees: objEmployees, invitations: objInvitations } : null;
      },
      destroy() { objRecoveryService.destroy(); objMfaService.destroy(); } };
  } catch (objError) {
    objRecoveryService?.destroy(); objMfaService.destroy(); throw objError;
  }
}
