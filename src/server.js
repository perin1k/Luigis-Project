import { createServer as createHttpsServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createApp } from './app.js';
import { createCatalogService } from './ordering/catalog-service.js';
import { openDatabase } from './data/database.js';
import { applyMigrations } from './data/migrations.js';
import { createAuthRuntime } from './auth/auth-runtime.js';

const intPort = Number(process.env.PORT ?? 3000);
const strHost = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(intPort) || intPort < 1 || intPort > 65535) throw new Error('Invalid PORT.');
const arrAuthSettings = ['AUTH_ORIGIN', 'TLS_KEY_PATH', 'TLS_CERT_PATH', 'DATABASE_PATH', 'MFA_ENCRYPTION_KEY_HEX'];
const bAuthEnabled = arrAuthSettings.filter((strName) => strName !== 'DATABASE_PATH').some((strName) => process.env[strName] !== undefined);
let objDatabase;
let objRuntime;
let objServer;
let bClosed = false;
function closeResources() {
  if (bClosed) return;
  bClosed = true; objRuntime?.destroy(); objDatabase?.close();
}
try {
  if (bAuthEnabled) {
    if (!arrAuthSettings.every((strName) => process.env[strName])) throw new Error('Complete HTTPS authentication configuration is required.');
    const objOrigin = new URL(process.env.AUTH_ORIGIN);
    if (objOrigin.protocol !== 'https:' || objOrigin.origin !== process.env.AUTH_ORIGIN
      || Number(objOrigin.port || 443) !== intPort) throw new Error('AUTH_ORIGIN must match the HTTPS listening port.');
    if (!existsSync(process.env.DATABASE_PATH)) throw new Error('An existing database is required.');
    const objTls = { key: readFileSync(process.env.TLS_KEY_PATH), cert: readFileSync(process.env.TLS_CERT_PATH), minVersion: 'TLSv1.2' };
    objDatabase = openDatabase(process.env.DATABASE_PATH);
    applyMigrations(objDatabase);
    objRuntime = createAuthRuntime(objDatabase, { strOrigin: process.env.AUTH_ORIGIN,
      strEncryptionKeyHex: process.env.MFA_ENCRYPTION_KEY_HEX });
    objServer = createHttpsServer(objTls, createApp({ objAuthRuntime: objRuntime, objCatalogService: createCatalogService(objDatabase) }));
  } else if (process.env.DATABASE_PATH !== undefined) {
    if (!process.env.DATABASE_PATH || !existsSync(process.env.DATABASE_PATH)) throw new Error('Existing catalog database required.');
    objDatabase = openDatabase(process.env.DATABASE_PATH); applyMigrations(objDatabase);
    objServer = createHttpServer(createApp({ objCatalogService: createCatalogService(objDatabase) }));
  } else {
    // Preserve the existing view-only HTTP fixture and availability injection seam.
    const { default: objApp } = await import('./app.js');
    objServer = createHttpServer(objApp);
  }
  objServer.listen(intPort, strHost, () => console.log(`Luigi’s Pizza: ${bAuthEnabled ? 'https' : 'http'}://${strHost}:${intPort}`));
  objServer.on('close', closeResources);
  objServer.on('error', () => { console.error('Unable to start the configured server.'); closeResources(); process.exitCode = 1; });
  for (const strSignal of ['SIGINT', 'SIGTERM']) process.once(strSignal, () => objServer.close());
} catch {
  closeResources();
  console.error('Unable to start: check the private database, key and HTTPS configuration.');
  process.exitCode = 1;
}
