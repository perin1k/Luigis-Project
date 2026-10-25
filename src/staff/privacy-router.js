/**
 * Admin/Owner privacy HTTP boundary: combines transport checks with explicit review
 * confirmation, then returns no-store responses without exposing a public customer
 * lookup.
 */
import express from 'express';
import {randomBytes} from 'node:crypto';
import {AUTH_COOKIES,COOKIE_OPTIONS,createCsrfProtection,readAuthCookies} from '../auth/auth-transport.js';
import {StaffOrderError} from './orders-service.js';

export function createPrivacyRouter({objPrivacyService,strOrigin,fnRender}) {
  const objOrigin=new URL(strOrigin);
  if(objOrigin.protocol!=='https:'||objOrigin.origin!==strOrigin)throw new Error('Exact privacy HTTPS origin required.');
  const objRouter=express.Router();const objCsrf=createCsrfProtection();
  objRouter.use(['/staff/privacy','/api/staff/privacy'],(objRequest,objResponse,fnNext)=>{
    objResponse.set({'Cache-Control':'no-store','Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Vary':'Cookie, Origin'});
    if(!objRequest.socket.encrypted||objRequest.headers.host!==objOrigin.host||(objRequest.headers.origin!==undefined&&objRequest.headers.origin!==strOrigin)
      ||objRequest.headers['sec-fetch-site']&&!['same-origin','none'].includes(objRequest.headers['sec-fetch-site']))return objResponse.status(403).type('text').send('A secure staff connection is required.');
    try {objResponse.locals.objPrivacyCookies=readAuthCookies(objRequest.headers.cookie);} catch {return objResponse.status(400).json({strMessage:'Unable to read this session.'});}
    objResponse.locals.strPrivacyToken=objResponse.locals.objPrivacyCookies[AUTH_COOKIES.strSession];fnNext();
  });
  objRouter.get('/staff/privacy/:reference',(objRequest,objResponse,fnNext)=>{
    const objPrivacy=objPrivacyService.read(objResponse.locals.strPrivacyToken,objRequest.params.reference);
    if(!objPrivacy)throw new StaffOrderError('Sign in as an administrator to review customer privacy.',403);
    fnRender(objRequest,objResponse,fnNext,'pages/staff-privacy',{strTitle:'Customer privacy | Luigi’s Pizza',strDescription:'Restricted customer contact review.',objPrivacy});
  });
  objRouter.get('/api/staff/privacy/:reference/csrf',(objRequest,objResponse)=>{
    if(!objPrivacyService.read(objResponse.locals.strPrivacyToken,objRequest.params.reference))return objResponse.status(403).json({strMessage:'Your administrative session is unavailable. Sign in again.'});
    const objCookies=objResponse.locals.objPrivacyCookies;
    if(!objCookies[AUTH_COOKIES.strCsrf]) {objCookies[AUTH_COOKIES.strCsrf]=randomBytes(32).toString('hex');objResponse.cookie(AUTH_COOKIES.strCsrf,objCookies[AUTH_COOKIES.strCsrf],{...COOKIE_OPTIONS,maxAge:600000});}
    objResponse.json({strCsrfToken:objCsrf.token(objCookies)});
  });
  for(const strAction of ['correct','copy'])objRouter.post(`/api/staff/privacy/:reference/${strAction}`,(objRequest,objResponse,fnNext)=>{
    if(objRequest.headers.origin!==strOrigin||!objCsrf.verify(objResponse.locals.objPrivacyCookies,objRequest.headers['x-csrf-token']))return objResponse.status(403).json({strMessage:'Reload this page before continuing.'});
    if(!objRequest.is('application/json'))return objResponse.status(415).json({strMessage:'JSON is required.'});fnNext();
  },express.json({limit:'1kb',strict:true,inflate:false}),(objRequest,objResponse)=>{
    const objResult=objPrivacyService[strAction](objResponse.locals.strPrivacyToken,objRequest.params.reference,objRequest.body);
    return objResult?objResponse.json(objResult):objResponse.status(403).json({strMessage:'Your administrative session is unavailable. Sign in again.'});
  });
  objRouter.use(['/staff/privacy','/api/staff/privacy'],(objError,objRequest,objResponse,fnNext)=>{
    if(objResponse.headersSent)return fnNext(objError);
    const intStatus=objError instanceof StaffOrderError?objError.intStatus:objError.status===413?413:objError.type==='entity.parse.failed'?400:objError.type==='encoding.unsupported'?415:503;
    const strMessage=objError instanceof StaffOrderError?objError.message:'Privacy review could not be completed. Reload before retrying.';
    objResponse.status(intStatus);
    if(objRequest.originalUrl.startsWith('/staff/privacy/'))return fnRender(objRequest,objResponse,fnNext,'pages/error',{strTitle:'Privacy review | Luigi’s Pizza',strDescription:'Restricted customer contact review.',intStatus,strHeading:'Privacy review is unavailable.',strMessage});
    objResponse.json({strMessage});
  });
  return objRouter;
}
