import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from '../src/data/database.js';
import { applyMigrations } from '../src/data/migrations.js';
import { createRecoveryService, LOCAL_RECOVERY_ACKNOWLEDGEMENT } from '../src/auth/recovery-service.js';

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 2) throw new Error('Private terminal required.');
  const strPath = resolve(process.env.DATABASE_PATH || 'data/luigis-demo.sqlite');
  if (!existsSync(strPath)) throw new Error('Existing database required.');
  const strKey = process.env.MFA_ENCRYPTION_KEY_HEX;
  if (typeof strKey !== 'string' || strKey.length !== 64 || !/^[0-9a-f]{64}$/.test(strKey)) throw new Error('MFA key required.');
  const objDb = openDatabase(strPath); let objRecovery; let objTerminal; let bHidden = false;
  const objAbort = new AbortController(); const objTimer = setTimeout(() => objAbort.abort(), 600000);
  const objOutput = new Writable({ write(objChunk, strEncoding, fnDone) {
    if (!bHidden) process.stdout.write(objChunk, strEncoding); fnDone();
  } });
  async function ask(strPrompt, bSecret = false) {
    process.stdout.write(strPrompt); bHidden = bSecret;
    try { return await objTerminal.question('', { signal: objAbort.signal }); }
    finally { bHidden = false; if (bSecret) process.stdout.write('\n'); }
  }
  try {
    applyMigrations(objDb);
    objRecovery = createRecoveryService(objDb, { strEncryptionKeyHex: strKey });
    objTerminal = createInterface({ input: process.stdin, output: objOutput, terminal: true, historySize: 0 });
    objTerminal.on('SIGINT', () => objAbort.abort()); objTerminal.on('close', () => objAbort.abort());
    process.stdout.write('Local account recovery: Brody must verify the teammate in person. Use a private, unrecorded terminal.\n');
    const strUsername = await ask('Existing individual username: ');
    if (await ask('After Brody verifies identity in person, type RECOVER: ') !== 'RECOVER') throw new Error('Verification required.');
    let strPassword = await ask('New password (hidden): ', true);
    let strConfirmation = await ask('Repeat new password (hidden): ', true);
    if (strPassword !== strConfirmation) throw new Error('Passwords differ.');
    let objPending;
    try { objPending = await objRecovery.beginLocalRecovery(strUsername, strPassword, LOCAL_RECOVERY_ACKNOWLEDGEMENT); }
    finally { strPassword = ''; strConfirmation = ''; }
    if (!objPending) throw new Error('Recovery unavailable.');
    if (objPending.strProvisioningUri) process.stdout.write(`Import this replacement authenticator URI privately; never use external QR services:\n${objPending.strProvisioningUri}\n`);
    let objResult = null;
    for (let intAttempt = 0; intAttempt < 5 && !objResult; intAttempt++) {
      const strCode = objPending.strProvisioningUri ? await ask('Replacement authenticator code (hidden): ', true) : '';
      objResult = objRecovery.confirmRecovery(objPending.strRecoveryToken, strCode);
      if (!objResult) process.stdout.write('Confirmation not accepted.\n');
    }
    if (!objResult) throw new Error('Recovery incomplete.');
    objPending = null;
    if (objResult.arrRecoveryCodes.length) {
      process.stdout.write('Save these new single-use recovery codes privately; old codes are invalid:\n');
      for (const strCode of objResult.arrRecoveryCodes) process.stdout.write(`${strCode}\n`);
    }
    objResult = null;
    process.stdout.write('Recovery completed. Sign in again; clear sensitive terminal scrollback.\n');
  } finally { clearTimeout(objTimer); objRecovery?.destroy(); objTerminal?.close(); objOutput.end(); objDb.close(); }
}
try { await main(); }
catch { process.stderr.write('Recovery did not complete. Access may remain locked; restart the approved recovery procedure.\n'); process.exitCode = 1; }
