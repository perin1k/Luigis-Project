/** Return flags only; never expose the opaque cookie value in assertion output. */
export function readCookieFlags(arrHeaders, strCookieName) {
 // WebKit may expose an Expires date's comma as a header-row boundary.
 // Rejoin rows, then split only at a comma followed by a new cookie name/value.
 const strCookies=arrHeaders.filter(objRow=>objRow.name.toLowerCase()==='set-cookie')
  .map(objRow=>objRow.value).join(',');
 const strCookie=strCookies.split(/,(?=\s*[^=;,\s]+=)/)
  .find(strPart=>strPart.trimStart().startsWith(strCookieName+'='));
 return strCookie?.split(';').slice(1).map(strFlag=>strFlag.trim().toLowerCase());
}
