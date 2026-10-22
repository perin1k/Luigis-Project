import express from 'express';
import {AUTH_COOKIES,readAuthCookies} from '../auth/auth-transport.js';
import {StaffOrderError} from './orders-service.js';
export function createStaffOrdersRouter({objStaffOrdersService,strOrigin,fnRender}){
  const objOrigin=new URL(strOrigin);if(objOrigin.protocol!=='https:'||objOrigin.origin!==strOrigin)throw new Error('Exact staff HTTPS origin required.');
  const objRouter=express.Router();
  objRouter.use(['/staff/orders','/api/staff/orders'],(objRequest,objResponse,fnNext)=>{
    objResponse.set({'Cache-Control':'no-store','Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Vary':'Cookie, Origin'});
    if(!objRequest.socket.encrypted||objRequest.headers.host!==objOrigin.host||(objRequest.headers.origin!==undefined&&objRequest.headers.origin!==strOrigin)
      ||(objRequest.headers['sec-fetch-site']&&!['same-origin','none'].includes(objRequest.headers['sec-fetch-site'])))return objResponse.status(403).type('text').send('A secure staff connection is required.');
    try{objResponse.locals.strSessionToken=readAuthCookies(objRequest.headers.cookie)[AUTH_COOKIES.strSession];}catch{return objResponse.status(400).type('text').send('Unable to read this session.');}fnNext();
  });
  function serve(objRequest,objResponse,fnNext,bJson,bDetail){
    try{
      const objResult=bDetail?objStaffOrdersService.readOrder(objResponse.locals.strSessionToken,objRequest.params.reference):objStaffOrdersService.listOrders(objResponse.locals.strSessionToken,objRequest.query);
      if(!objResult)return bJson?objResponse.status(401).json({strMessage:'Your staff session expired. Sign in again.'}):objResponse.redirect(303,'/staff/sign-in');
      if(bJson)return objResponse.json(objResult);
      fnRender(objRequest,objResponse,fnNext,'pages/staff-orders',{strTitle:bDetail?'Order details | Luigi’s Pizza':'Order queue | Luigi’s Pizza',strDescription:'Authorized staff order preparation queue.',objQueue:bDetail?null:objResult,objOrder:bDetail?objResult:null});
    }catch(objError){
      const intStatus=objError instanceof StaffOrderError?objError.intStatus:503;const strMessage=objError instanceof StaffOrderError?objError.message:'Orders could not be loaded. Please try again.';
      if(bJson)return objResponse.status(intStatus).json({strMessage});
      objResponse.status(intStatus);fnRender(objRequest,objResponse,fnNext,'pages/error',{strTitle:'Order queue | Luigi’s Pizza',strDescription:'Staff order access.',intStatus,strHeading:'Orders could not be loaded.',strMessage});
    }
  }
  objRouter.get('/api/staff/orders',(objRequest,objResponse,fnNext)=>serve(objRequest,objResponse,fnNext,true,false));
  objRouter.get('/api/staff/orders/:reference',(objRequest,objResponse,fnNext)=>serve(objRequest,objResponse,fnNext,true,true));
  objRouter.get('/staff/orders',(objRequest,objResponse,fnNext)=>serve(objRequest,objResponse,fnNext,false,false));
  objRouter.get('/staff/orders/:reference',(objRequest,objResponse,fnNext)=>serve(objRequest,objResponse,fnNext,false,true));
  return objRouter;
}
