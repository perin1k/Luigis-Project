/**
 * Private initial privileged-account setup with password validation and proved
 * authenticator enrollment. Provisioning secrets/recovery codes are private one-time
 * setup output.
 */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from '../src/data/database.js';
import { applyMigrations } from '../src/data/migrations.js';
import { createBootstrapService } from '../src/auth/bootstrap-service.js';

// The operator enters real credentials directly. Never pass passwords as arguments/env.
async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 2) {
    throw new Error('Setup requires an interactive private terminal and no arguments.');
  }
  const strPath = resolve(process.env.DATABASE_PATH || 'data/luigis-demo.sqlite');
  if (!existsSync(strPath)) throw new Error('Migrate the intended database before setup.');
  const strKey = process.env.MFA_ENCRYPTION_KEY_HEX;
  if (!/^[0-9a-f]{64}$/.test(strKey ?? '') || strKey?.length !== 64) throw new Error('Configure a separate MFA encryption key before setup.');
  const objDatabase = openDatabase(strPath);
  let objSetup;
  let objTerminal;
  let bHidden = false;
  const objAbort = new AbortController();
  const objTimer = setTimeout(() => objAbort.abort(), 10 * 60000);
  const objOutput = new Writable({ write(objChunk, strEncoding, fnDone) {
    if (!bHidden) process.stdout.write(objChunk, strEncoding);
    fnDone();
  } });
  async function ask(strPrompt, bSecret = false) {
    process.stdout.write(strPrompt);
    bHidden = bSecret;
    try { return await objTerminal.question('', { signal: objAbort.signal }); }
    finally { bHidden = false; if (bSecret) process.stdout.write('\n'); }
  }
  try {
    applyMigrations(objDatabase);
    if (objDatabase.prepare("SELECT id FROM staff_users WHERE role = 'admin' OR identity_subject LIKE 'local-bootstrap:%' LIMIT 1").get()) {
      throw new Error('Initial admin setup unavailable.');
    }
    objSetup = createBootstrapService(objDatabase, { strEncryptionKeyHex: strKey });
    objTerminal = createInterface({ input: process.stdin, output: objOutput, terminal: true, historySize: 0 });
    objTerminal.on('SIGINT', () => objAbort.abort());
    objTerminal.on('close', () => objAbort.abort());
    process.stdout.write('Initial owner setup — use a private terminal without recording or screen sharing.\n');
    const strUsername = await ask('Individual owner username: ');
    let strPassword = await ask('Password (15+ characters; hidden): ', true);
    let strConfirmation = await ask('Repeat password (hidden): ', true);
    if (strPassword !== strConfirmation) throw new Error('Passwords do not match.');
    let objEnrollment;
    try { objEnrollment = await objSetup.beginSetup(strUsername, strPassword); }
    finally { strPassword = ''; strConfirmation = ''; }
    process.stdout.write('Import the following secret provisioning URI directly into your authenticator.\nDo not share it, use an external QR service, or save it in project files.\n');
    process.stdout.write(`${objEnrollment.strProvisioningUri}\n`);
    objEnrollment = null;
    let objConfirmed = null;
    for (let intAttempt = 0; intAttempt < 5 && !objConfirmed; intAttempt++) {
      const strCode = await ask('Current six-digit authenticator code (hidden): ', true);
      objConfirmed = objSetup.confirmSetup(strCode) || null;
      if (!objConfirmed) process.stdout.write('Code not accepted. Check your authenticator and setup time limit.\n');
    }
    if (!objConfirmed) throw new Error('Enrollment was not completed. No account was created.');
    process.stdout.write('Save these single-use recovery codes privately now; they cannot be retrieved later:\n');
    for (const strCode of objConfirmed.arrRecoveryCodes) process.stdout.write(`${strCode}\n`);
    objConfirmed = null;
    process.stdout.write('Initial owner created with verified MFA. Sign in using the configured HTTPS staff page.\nClear sensitive terminal scrollback after importing the authenticator secret.\n');
  } finally {
    clearTimeout(objTimer); objSetup?.cancel(); objTerminal?.close(); objOutput.end(); objDatabase.close();
  }
}

try { await main(); }
catch {
  // Never print raw exceptions, environment values, usernames, passwords, or provisioning strings.
  process.stderr.write('Admin setup did not complete. Check private terminal, database, key, policy and enrollment requirements.\n');
  process.exitCode = 1;
}
