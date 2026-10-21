import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const fnScrypt = promisify(scrypt);
const SCRYPT_OPTIONS = Object.freeze({ N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
const HASH_PREFIX = 'scrypt-v1$131072$8$1$';
const HASH_PATTERN = /^scrypt-v1\$131072\$8\$1\$([0-9a-f]{32})\$([0-9a-f]{128})$/;
const HASH_LENGTH = 182;
const MAX_PASSWORD_BYTES = 1024;

// This is a bounded cryptographic primitive, not the future enrollment policy.
function passwordBytes(strPassword) {
  if (typeof strPassword !== 'string' || !strPassword.length || strPassword.length > MAX_PASSWORD_BYTES) return null;
  const objBytes = Buffer.from(strPassword, 'utf8');
  if (objBytes.length > MAX_PASSWORD_BYTES || objBytes.toString('utf8') !== strPassword) {
    objBytes.fill(0);
    return null;
  }
  return objBytes;
}

/** Produce a versioned salted hash; do not log passwords or derived credentials. */
export async function hashPassword(strPassword) {
  const objPassword = passwordBytes(strPassword);
  if (!objPassword) throw new TypeError('Password must be valid nonempty Unicode within 1024 UTF-8 bytes.');
  let objKey;
  try {
    const objSalt = randomBytes(16);
    objKey = await fnScrypt(objPassword, objSalt, 64, SCRYPT_OPTIONS);
    return `${HASH_PREFIX}${objSalt.toString('hex')}$${objKey.toString('hex')}`;
  } finally {
    objPassword.fill(0);
    objKey?.fill(0);
  }
}

/** Invalid input/hash -> false; crypto/system failures propagate for fail-closed handling. */
export async function verifyPassword(strPassword, strStoredHash) {
  if (typeof strStoredHash !== 'string' || strStoredHash.length !== HASH_LENGTH) return false;
  const arrMatch = HASH_PATTERN.exec(strStoredHash);
  if (!arrMatch) return false;
  const objPassword = passwordBytes(strPassword);
  if (!objPassword) return false;
  const objExpected = Buffer.from(arrMatch[2], 'hex');
  let objActual;
  try {
    objActual = await fnScrypt(objPassword, Buffer.from(arrMatch[1], 'hex'), 64, SCRYPT_OPTIONS);
    return timingSafeEqual(objActual, objExpected);
  } finally {
    objPassword.fill(0);
    objExpected.fill(0);
    objActual?.fill(0);
  }
}
