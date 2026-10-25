/**
 * Customer-only cookie names and strict parsing. Customer cookies cannot become staff sessions.
 * Reject duplicate/invalid proofs rather than choosing an ambiguous value from the request.
 */
import { AUTH_COOKIES, isToken } from '../auth/auth-transport.js';
export const CUSTOMER_COOKIES = Object.freeze({ strSession: '__Host-luigis-customer', strCsrf: '__Host-luigis-customer-csrf' });

export function readCustomerCookies(strHeader = '') {
  if (typeof strHeader !== 'string' || strHeader.length > 8192) throw new Error('Invalid cookies.');
  const objCookies = {};
  for (const strPart of strHeader.split(';')) {
    const intEquals = strPart.indexOf('=');
    if (intEquals < 0) continue;
    const strName = strPart.slice(0, intEquals).trim();
    if (!Object.values(CUSTOMER_COOKIES).includes(strName)) continue;
    const strValue = strPart.slice(intEquals + 1).trim();
    if (Object.hasOwn(objCookies, strName) || !isToken(strValue)) throw new Error('Invalid cookies.');
    objCookies[strName] = strValue;
  }
  return objCookies;
}
// Adapt customer proofs to the shared CSRF primitive without reading staff identity cookies.

export function customerCsrfCookies(objCookies) {
  return {
    [AUTH_COOKIES.strCsrf]: objCookies[CUSTOMER_COOKIES.strCsrf],
    [AUTH_COOKIES.strSession]: objCookies[CUSTOMER_COOKIES.strSession] ?? ''
  };
}
