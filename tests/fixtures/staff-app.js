import * as OTPAuth from 'otpauth';
import { openDatabase, runTransaction } from '../../src/data/database.js';
import { applyMigrations } from '../../src/data/migrations.js';
import { hashPassword } from '../../src/auth/password-service.js';
import { createMfaService } from '../../src/auth/mfa-service.js';
import { createAuthRuntime } from '../../src/auth/auth-runtime.js';
import { issueRecoveryCodes } from '../../src/auth/recovery-records.js';
import { createApp } from '../../src/app.js';

export const PASSWORD = 'Synthetic staff browser passphrase only';
const PASSWORD_HASH = await hashPassword(PASSWORD);
/** Isolated synthetic identities. Never mounted by the application runtime. */
export function createStaffFixture(strOrigin, { fnCreateApp = createApp } = {}) {
  const objDatabase = openDatabase(':memory:'); applyMigrations(objDatabase);
  let numNow = Date.parse('2026-10-21T18:00:00.000Z');
  const fnNow = () => new Date(numNow);
  for (const strRole of ['employee', 'admin', 'owner']) {
    objDatabase.prepare('INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES (?,?,?,?)')
      .run(strRole, `synthetic-${strRole}`, strRole === 'owner' ? 'admin' : strRole, fnNow().toISOString());
    objDatabase.prepare('INSERT INTO staff_credentials (user_id,username,password_hash,created_at,password_changed_at) VALUES (?,?,?,?,?)')
      .run(strRole, strRole, PASSWORD_HASH, fnNow().toISOString(), fnNow().toISOString());
  }
  objDatabase.prepare('INSERT INTO staff_ownership VALUES(1,?,?)').run('owner',fnNow().toISOString());
  const objMfa = createMfaService(objDatabase, { strEncryptionKeyHex: 'ab'.repeat(32), fnNow });
  const objEnrollment = objMfa.beginEnrollment('admin');
  const objTotp = OTPAuth.URI.parse(objEnrollment.strProvisioningUri);
  objMfa.confirmEnrollment('admin', objEnrollment.strEnrollmentId, objTotp.generate({ timestamp: numNow }));
  const objOwnerEnrollment=objMfa.beginEnrollment('owner');
  const objOwnerTotp=OTPAuth.URI.parse(objOwnerEnrollment.strProvisioningUri);
  objMfa.confirmEnrollment('owner',objOwnerEnrollment.strEnrollmentId,objOwnerTotp.generate({timestamp:numNow}));
  numNow += 30000;
  const arrRecoveryCodes = runTransaction(objDatabase, () => issueRecoveryCodes(objDatabase, 'admin', fnNow()));
  const objRuntime = createAuthRuntime(objDatabase, { strOrigin, strEncryptionKeyHex: 'ab'.repeat(32), fnNow });
  return { objApp: fnCreateApp({ objAuthRuntime: objRuntime }, objDatabase, { fnNow }), objDatabase, arrRecoveryCodes,
    code(strSecret) { numNow += 30000; return (strSecret === 'owner' ? objOwnerTotp : strSecret ? new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(strSecret) }) : objTotp).generate({ timestamp: numNow }); },
    seedEmployees() {
      for (let intIndex = 0; intIndex < 12; intIndex += 1) {
        const strId = `sample.${String(intIndex).padStart(2, '0')}`;
        objDatabase.prepare('INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES (?,?,?,?)').run(strId, strId, 'employee', fnNow().toISOString());
        objDatabase.prepare('INSERT INTO staff_credentials (user_id,username,password_hash,created_at,password_changed_at) VALUES (?,?,?,?,?)').run(strId, strId, PASSWORD_HASH, fnNow().toISOString(), fnNow().toISOString());
      }
    },
    advanceTo(dtValue) {
      const numNext = Date.parse(dtValue);
      if (!Number.isFinite(numNext) || numNext < numNow) throw new Error('Fixture clock must move forward.');
      numNow = numNext;
    },
    expire() { numNow += 31 * 60000; },
    close() { objRuntime.destroy(); objMfa.destroy(); objDatabase.close(); } };
}
