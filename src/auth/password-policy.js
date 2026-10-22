import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const objList = readFileSync(new URL('./blocklists/common-passwords.txt', import.meta.url));
if (createHash('sha256').update(objList).digest('hex') !== '68782d6a4a19a4768d5f15dd66bd534e7a33055cc755411e33f16d18c50fdcce') {
  throw new Error('Password blocklist integrity check failed.');
}
const setCommon = new Set(objList.toString('utf8').split(/\r?\n/).filter(Boolean).map((strWord) => strWord.toLowerCase()));

/** Enrollment only; verification keeps exact original password bytes. */
export function validateNewPassword(strPassword, strUsername) {
  if (typeof strPassword !== 'string' || strPassword.length > 1024) return false;
  const objBytes = Buffer.from(strPassword, 'utf8');
  try {
    if (objBytes.length > 1024 || objBytes.toString('utf8') !== strPassword || [...strPassword].length < 15
      || /[\u0000-\u001f\u007f]/u.test(strPassword)) return false;
    const strComparison = strPassword.trim().toLowerCase();
    if (setCommon.has(strComparison) || /^(.)\1+$/u.test(strComparison)) return false;
    // Reject predictable project/username-only variants without altering the hashed value.
    const strCompact = strComparison.replace(/[^\p{L}\p{N}]/gu, '');
    const strUser = typeof strUsername === 'string' ? strUsername.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    if (strUser && new RegExp(`^(?:${strUser})+[0-9]*$`).test(strCompact)) return false;
    return !/^(?:luigis|luigispizza|password|administrator|admin)[0-9]*$/.test(strCompact);
  } finally { objBytes.fill(0); }
}
