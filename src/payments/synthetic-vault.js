/**
 * Authenticated encryption for generated synthetic payment numbers. Record-specific associated data prevents ciphertext being reassigned to a different payment/order/quote.
 */
import { createCipheriv, createDecipheriv, randomBytes, randomInt } from 'node:crypto';

/** Server-generated test identifiers, never externally supplied card numbers. */
export function generateSyntheticNumber() {
  return '0000' + Array.from({ length: 12 }, () => String(randomInt(10))).join('');
}
export function createSyntheticVault({ strActiveKeyId, mapKeys }) {
  if (!mapKeys || !/^[a-zA-Z0-9_-]{1,32}$/.test(strActiveKeyId ?? '') || !Object.hasOwn(mapKeys,strActiveKeyId)
    || Object.keys(mapKeys).length > 8 || Object.entries(mapKeys).some(([strId,strKey]) => !/^[a-zA-Z0-9_-]{1,32}$/.test(strId) || typeof strKey !== 'string' || !/^[a-f0-9]{64}$/.test(strKey))) throw new Error('Invalid demo encryption configuration.');
  const mapBuffers = new Map(Object.entries(mapKeys).map(([strId,strKey]) => [strId,Buffer.from(strKey,'hex')]));
  function aad(objIdentity,strKeyId) { return Buffer.from(JSON.stringify(['demo-number-v1',objIdentity.strPaymentId,objIdentity.strOrderId,objIdentity.strQuoteId,strKeyId])); }
  function encrypt(strNumber,objIdentity) {
    if (!/^0000\d{12}$/.test(strNumber)) throw new Error('Generated synthetic identity required.');
    const objNonce = randomBytes(12); const objCipher = createCipheriv('aes-256-gcm',mapBuffers.get(strActiveKeyId),objNonce,{authTagLength:16});
    objCipher.setAAD(aad(objIdentity,strActiveKeyId));
    const objCiphertext=Buffer.concat([objCipher.update(strNumber,'utf8'),objCipher.final()]);
    return {strKeyId:strActiveKeyId,strNonceHex:objNonce.toString('hex'),strCiphertextHex:objCiphertext.toString('hex'),strTagHex:objCipher.getAuthTag().toString('hex')};
  }
  // Offline verification/rotation primitive only: no HTTP or staff view exposes plaintext.
  function decrypt(objRecord,objIdentity) {
    try {
      if (!mapBuffers.has(objRecord.strKeyId) || !/^[a-f0-9]{24}$/.test(objRecord.strNonceHex) || !/^[a-f0-9]{32}$/.test(objRecord.strTagHex) || !/^[a-f0-9]{32}$/.test(objRecord.strCiphertextHex)) throw new Error();
      const objDecipher=createDecipheriv('aes-256-gcm',mapBuffers.get(objRecord.strKeyId),Buffer.from(objRecord.strNonceHex,'hex'),{authTagLength:16});
      objDecipher.setAAD(aad(objIdentity,objRecord.strKeyId));objDecipher.setAuthTag(Buffer.from(objRecord.strTagHex,'hex'));
      const strNumber=Buffer.concat([objDecipher.update(Buffer.from(objRecord.strCiphertextHex,'hex')),objDecipher.final()]).toString('utf8');
      if (!/^0000\d{12}$/.test(strNumber)) throw new Error(); return strNumber;
    } catch { throw new Error('Unable to verify synthetic payment identity.'); }
  }
  return { encrypt,decrypt };
}
