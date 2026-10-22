import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const AUTH_COOKIES = Object.freeze({
  strSession: '__Host-luigis-session', strChallenge: '__Host-luigis-mfa', strCsrf: '__Host-luigis-csrf',
  strRecovery: '__Host-luigis-recovery',
});
export const COOKIE_OPTIONS = Object.freeze({ secure: true, httpOnly: true, sameSite: 'strict', path: '/' });
export function isToken(strValue) {
  return typeof strValue === 'string' && strValue.length === 64 && /^[0-9a-f]{64}$/.test(strValue);
}
export function readAuthCookies(strHeader = '') {
  if (typeof strHeader !== 'string' || strHeader.length > 8192) throw new Error('Invalid cookies.');
  const objCookies = Object.create(null);
  for (const strPart of strHeader.split(';')) {
    const intEquals = strPart.indexOf('=');
    if (intEquals < 0) continue;
    const strName = strPart.slice(0, intEquals).trim();
    if (!Object.values(AUTH_COOKIES).includes(strName)) continue;
    const strValue = strPart.slice(intEquals + 1).trim();
    if (Object.hasOwn(objCookies, strName) || !isToken(strValue)) throw new Error('Invalid cookies.');
    objCookies[strName] = strValue;
  }
  return objCookies;
}

/** Ephemeral, per-router CSRF key: restart requires a fresh CSRF fetch, not new login. */
export function createCsrfProtection() {
  const objKey = randomBytes(32);
  function sign(objCookies) {
    return createHmac('sha256', objKey).update(JSON.stringify([
      objCookies[AUTH_COOKIES.strCsrf], objCookies[AUTH_COOKIES.strSession] ?? '',
      objCookies[AUTH_COOKIES.strChallenge] ?? '',
      objCookies[AUTH_COOKIES.strRecovery] ?? '',
    ])).digest('hex');
  }
  return Object.freeze({
    token(objCookies) { return sign(objCookies); },
    verify(objCookies, strToken) {
      return isToken(objCookies[AUTH_COOKIES.strCsrf]) && isToken(strToken)
        && timingSafeEqual(Buffer.from(sign(objCookies), 'hex'), Buffer.from(strToken, 'hex'));
    },
  });
}
