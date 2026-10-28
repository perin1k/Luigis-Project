/**
 * Runs the selected storage/payment/notification consistency tests with explicit paths.
 * Disposable test databases do not authorize resetting a live database.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { release } from 'node:os';

console.log(JSON.stringify({ strPlatform: process.platform, strArchitecture: process.arch,
  strOsRelease: release(), strNodeVersion: process.version }));

// Explicit paths avoid shell-dependent wildcard expansion on Windows/macOS/Linux.
const arrTests = [
  'database', 'concurrency-database', 'order-storage', 'payment-storage', 'scheduling-storage',
  'access-storage', 'demo-refund-storage', 'disposable-recreation',
  'demo-payment', 'demo-payment-concurrency', 'notification-service', 'staff-roles',
].map((strName) => fileURLToPath(new URL(`../tests/unit/${strName}.test.js`, import.meta.url)));
const objResult = spawnSync(process.execPath,
  ['--test', '--test-concurrency=1', ...arrTests],
  { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit' });
if (objResult.error) console.error('Storage verification could not start.');
process.exitCode = objResult.status ?? 1;
