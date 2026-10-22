import express from 'express';
import {StaffOrderError} from '../staff/orders-service.js';
export function createTrackingRouter(objTrackingService,fnRender){
  const objRouter=express.Router();
  objRouter.use(['/track','/api/tracking'],(objRequest,objResponse,fnNext)=>{
    objResponse.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'});fnNext();
  });
  objRouter.get('/track',(objRequest,objResponse,fnNext)=>fnRender(objRequest,objResponse,fnNext,'pages/tracking',{strTitle:'Track your order | Luigi’s Pizza',strDescription:'Private order progress.'}));
  objRouter.post(['/api/tracking','/api/tracking/cancellation'],(objRequest,objResponse,fnNext)=>{
    const strHost=objRequest.headers.host;const strScheme=objRequest.socket.encrypted?'https':'http';
    if((!objRequest.socket.encrypted&&!/^(localhost|127\.0\.0\.1):\d+$/.test(strHost??''))||objRequest.headers.origin!==`${strScheme}://${strHost}`||objRequest.headers['sec-fetch-site']==='cross-site')return objResponse.status(403).json({strMessage:'Open your private link on this site.'});
    if(!objRequest.is('application/json'))return objResponse.status(415).json({strMessage:'Use your private tracking link.'});fnNext();
  },express.json({limit:'1kb',strict:true,inflate:false}),(objRequest,objResponse)=>{
    if(!objRequest.body||Object.keys(objRequest.body).length!==1||!Object.hasOwn(objRequest.body,'strToken'))return objResponse.status(404).json({strMessage:'This private link is unavailable or expired.'});
    const objResult=objRequest.path.endsWith('/cancellation')?objTrackingService.requestCancellation(objRequest.body.strToken):objTrackingService.readTracking(objRequest.body.strToken);
    return objResult?objResponse.json(objResult):objResponse.status(404).json({strMessage:'This private link is unavailable or expired.'});
  });
  objRouter.use('/api/tracking',(objError,objRequest,objResponse,fnNext)=>{if(!objError)return fnNext();return objResponse.status(objError instanceof StaffOrderError?objError.intStatus:objError.status===413?413:503).json({strMessage:objError instanceof StaffOrderError?objError.message:'Tracking could not be loaded. Try again.'});});
  return objRouter;
}
