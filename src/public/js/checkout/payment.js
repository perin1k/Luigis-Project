// Local demo adapter only. No card entry, live charge, Stripe call or native Wallet sheet.
export async function openSecureCheckout(objInput) {
  if(!objInput)throw new Error('We couldn’t open secure checkout. Your selections are still here. Please try again.');
  const objAbort=new AbortController();const intTimer=setTimeout(()=>objAbort.abort(),10000);
  try{
    const objResponse=await fetch('/api/demo-payments',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(objInput),signal:objAbort.signal});
    const objResult=await objResponse.json();
    if(!objResponse.ok){const objError=new Error(objResult.strMessage??'Unable to confirm demonstration payment. Retry to check the same request.');objError.bNeedsReview=[402,404,409].includes(objResponse.status);objError.bKnownResponse=true;throw objError;}
    if(objResult.strState!=='succeeded'||objResult.strAdapter!=='luigis-demo-v1')throw new Error('Unable to confirm demonstration payment. Retry to check the same request.');
    return objResult;
  }catch(objError){
    if(objError instanceof TypeError||objError instanceof SyntaxError||objError.name==='AbortError')throw new Error('The payment response was interrupted. Retry to check the same payment; do not start a second checkout.');
    throw objError;
  }finally{clearTimeout(intTimer);}
}
