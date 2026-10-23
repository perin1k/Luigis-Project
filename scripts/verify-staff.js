import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { release } from 'node:os';

console.log(JSON.stringify({ strPlatform: process.platform, strArchitecture: process.arch,
  strOsRelease: release(), strNodeVersion: process.version }));
const arrTests = ['auth-session', 'auth-runtime', 'auth-router', 'password-service',
  'mfa-service', 'login-service', 'bootstrap-service', 'staff-account-service',
  'staff-enrollment-service', 'recovery-service', 'staff-roles']
  .map((strName) => fileURLToPath(new URL(`../tests/unit/${strName}.test.js`, import.meta.url)));
const objResult = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...arrTests],
  { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit' });
if (objResult.error) console.error('Staff verification could not start.');
process.exitCode = objResult.status ?? 1;
