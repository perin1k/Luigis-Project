/**
 * Minimal health responses expose readiness state without private dependency details.
 * Monitoring failures are distinct from rate-limited requests.
 */
import express from 'express';
/** Minimal dependency probe, never a diagnostic dump or full business-readiness claim. */
export function createHealthRouter(fnReady=()=>false,fnPreviews=()=>false){
  const objRouter=express.Router();
  objRouter.use('/health',(objRequest,objResponse,fnNext)=>{objResponse.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex','Referrer-Policy':'no-referrer'});fnNext();});
  objRouter.get('/health/live',(objRequest,objResponse)=>objResponse.json({strStatus:'alive'}));
  objRouter.get('/health/ready',(objRequest,objResponse)=>{let bReady=false;try{bReady=fnReady()===true;}catch{/* Never expose dependency exceptions. */}return objResponse.status(bReady?200:503).json({strStatus:bReady?'ready':'not_ready'});});
  objRouter.get('/health/previews',(objRequest,objResponse)=>{let bReady=false;try{bReady=fnPreviews()===true;}catch{/* No private worker diagnostics. */}return objResponse.status(bReady?200:503).json({strStatus:bReady?'ready':'not_ready'});});
  return objRouter;
}
