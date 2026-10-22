import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaffFixture } from './staff-app.js';
const strDirectory = mkdtempSync(join(tmpdir(), 'luigis-staff-browser-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(strDirectory, 'key.pem'),
  '-out', join(strDirectory, 'cert.pem'), '-subj', '/CN=localhost', '-days', '1'], { stdio: 'ignore' });
let objFixture = createStaffFixture('https://localhost:3443');
const objServer = createServer({ key: readFileSync(join(strDirectory, 'key.pem')), cert: readFileSync(join(strDirectory, 'cert.pem')) }, (objRequest, objResponse) => {
  // Only this disposable test server exposes deterministic fixture controls.
  const objUrl = new URL(objRequest.url, 'https://localhost:3443');
  objResponse.setHeader('Cache-Control', 'no-store');
  if (objUrl.pathname === '/__test/reset') { objFixture.close(); objFixture = createStaffFixture('https://localhost:3443'); return objResponse.end('reset'); }
  if (objUrl.pathname === '/__test/code') return objResponse.end(objFixture.code(objUrl.searchParams.get('secret')));
  if (objUrl.pathname === '/__test/recovery-code') return objResponse.end(objFixture.arrRecoveryCodes[0]);
  if (objUrl.pathname === '/__test/seed-employees') { objFixture.seedEmployees(); return objResponse.end('seeded'); }
  if (objUrl.pathname === '/__test/expire') { objFixture.expire(); return objResponse.end('expired'); }
  return objFixture.objApp(objRequest, objResponse);
});
objServer.listen(3443, '127.0.0.1');
for (const strSignal of ['SIGINT', 'SIGTERM']) process.once(strSignal, () => objServer.close(() => {
  objFixture.close(); rmSync(strDirectory, { recursive: true, force: true });
}));
