/**
 * Same-origin demonstration checkout endpoint. A successful response follows a committed service result, never a browser-only redirect or real processor event.
 */
import express from 'express';
import { PricingError } from '../ordering/catalog-service.js';
export function createDemoPaymentRouter(objPaymentService){
  const objRouter=express.Router();
  objRouter.use((objRequest,objResponse,fnNext)=>{
    objResponse.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex','Referrer-Policy':'no-referrer'});
    const strHost=objRequest.headers.host;const strProtocol=objRequest.socket.encrypted?'https':'http';
    if((!objRequest.socket.encrypted && !/^(127\.0\.0\.1|localhost):\d+$/.test(strHost??'')) || objRequest.headers.origin!==`${strProtocol}://${strHost}` || objRequest.headers['sec-fetch-site']==='cross-site')return objResponse.status(403).json({strMessage:'Use checkout on this site.'});
    if(!objRequest.is('application/json'))return objResponse.status(415).json({strMessage:'Use a JSON request.'});fnNext();
  });
  objRouter.use(express.json({limit:'1kb',strict:true,inflate:false}));
  objRouter.post('/',(objRequest,objResponse)=>{const objResult=objPaymentService.pay(objRequest.body);objResponse.status(objResult.strState==='failed'?402:objResult.bReplayed?200:201).json(objResult);});
  objRouter.use((objError,objRequest,objResponse,fnNext)=>{
    if(objResponse.headersSent)return fnNext(objError);
    if(objError instanceof PricingError)return objResponse.status(objError.intStatus).json({strCode:objError.strCode,strMessage:objError.message});
    const intStatus=objError.type==='entity.too.large'?413:objError.type==='entity.parse.failed'?400:objError.type==='encoding.unsupported'?415:503;
    objResponse.status(intStatus).json({strCode:'payment_unavailable',strMessage:'Unable to process demonstration payment. Your selections are preserved. Please retry.'});
  });return objRouter;
}
