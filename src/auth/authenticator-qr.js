/**
 * Generates authenticator enrollment QR data locally. Provisioning secrets never need an
 * external image or QR service.
 */
import QRCode from 'qrcode';

/** Sensitive provisioning data: return only through the existing no-store auth response. */
export function createAuthenticatorQr(strProvisioningUri){
  try{
    if(typeof strProvisioningUri!=='string'||strProvisioningUri.length>2048)throw new Error();
    const objUri=new URL(strProvisioningUri);
    if(objUri.protocol!=='otpauth:'||objUri.hostname!=='totp'
      ||!/^[A-Z2-7]{16,128}$/.test(objUri.searchParams.get('secret')??''))throw new Error();
    const objModules=QRCode.create(strProvisioningUri,{errorCorrectionLevel:'M'}).modules;
    return {intSize:objModules.size,strModules:Array.from(objModules.data).join('')};
  }catch{throw new Error('Invalid authenticator setup.');}
}
