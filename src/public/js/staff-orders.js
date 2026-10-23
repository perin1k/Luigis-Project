const elMain=document.querySelector('[data-order-reference]');
const strReference=elMain.dataset.orderReference;
const elAdvance=document.querySelector('#advance-order');const elRefundButton=document.querySelector('#refund-submit');let strRefundRequestId;
const NEXT_STATUS={Received:'Preparing',Preparing:'Baking',Baking:'Ready',Ready:'Completed'};
let intRevision=Number(elMain.dataset.orderRevision);
function progressControls(strStatus,bHeld){if(!elAdvance)return;const strNext=NEXT_STATUS[strStatus];elAdvance.hidden=!strNext;elAdvance.disabled=bHeld;elAdvance.textContent=strNext?`Mark ${strNext}`:'Order finished';elAdvance.dataset.nextStatus=strNext??'';}
progressControls(elMain.dataset.orderStatus,elMain.dataset.orderHeld==='true');
const elRefresh=document.querySelector('#refresh-orders');const elStatus=document.querySelector('#orders-status');const elError=document.querySelector('#orders-error');
function element(strTag,strText){const elElement=document.createElement(strTag);elElement.textContent=strText;return elElement;}
function readyTime(dtValue){return dtValue?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(dtValue)):'Ready time unavailable';}
function summary(objOrder){return `${objOrder.strService==='carry-out'?'Carry-out':'Dine-in'} · ${objOrder.strStatus} · ${readyTime(objOrder.dtReadyAt)}${objOrder.bReadyTimePassed?' · Ready time passed':''}`;}
function renderReference(elTarget,objOrder){elTarget.replaceChildren(document.createTextNode(`${objOrder.strCustomerName} · `));const elValue=element('span',objOrder.strReference);elValue.className='staff-order-reference font-monospace';elTarget.append(elValue);}
function renderQueue(objQueue){
  const elList=document.querySelector('#orders-list');elList.replaceChildren();document.querySelector('#orders-empty').hidden=objQueue.arrOrders.length>0;
  for(const objOrder of objQueue.arrOrders){const elItem=element('li','');const elTitle=element('h3','');const elLink=element('a','');renderReference(elLink,objOrder);elLink.href=`/staff/orders/${encodeURIComponent(objOrder.strReference)}`;elTitle.append(elLink);
    elItem.append(elTitle,element('p',summary(objOrder)),element('p',`${objOrder.intPizzaQuantity} pizzas · ${objOrder.intDrinkQuantity} drinks`));
    if(objOrder.arrWarnings.length){const elNotice=element('div','');elNotice.className='staff-review-notice';const elHeading=element('p','Staff review required');elHeading.className='fw-bold';const elWarnings=element('ul','');for(const strWarning of objOrder.arrWarnings)elWarnings.append(element('li',strWarning));elNotice.append(elHeading,elWarnings);elItem.append(elNotice);}elList.append(elItem);
  }
  const elPages=document.querySelector('#orders-pages');elPages.replaceChildren();
  for(const [strLabel,intPage,bShow] of [['Previous page',objQueue.intPage-1,objQueue.intPage>0],['Next page',objQueue.intPage+1,objQueue.bHasNext]])if(bShow){const elLink=element('a',strLabel);elLink.className='btn btn-outline-primary';elLink.href=`/staff/orders?${new URLSearchParams({date:objQueue.strDate,status:objQueue.strStatus,page:String(intPage)})}`;elPages.append(elLink);}
  elStatus.textContent=`Refreshed. ${objQueue.arrOrders.length} orders on this page.`;
}
function renderDetail(objOrder){
  if(elAdminSubmit){elAdminSubmit.hidden=!objOrder.bCanAdminister;elAdminSubmit.disabled=false;document.querySelector('#admin-order-reviewed').checked=false;document.querySelector('#admin-order-result').replaceChildren();}
  if(elRefundButton&&objOrder.objRefund){const objRefund=objOrder.objRefund;document.querySelector('#refund-panel').hidden=objRefund.strState==='not-applicable';document.querySelector('#refund-summary').textContent=`State: ${objRefund.strState} · Full amount: ${money(objRefund.centsTotal)} · Recorded net: ${money(objRefund.centsNetRecorded)}`;elRefundButton.disabled=!objRefund.bCanApprove;elRefundButton.textContent='Approve demo refund';document.querySelector('#refund-reviewed').checked=false;document.querySelector('#refund-status').textContent='';strRefundRequestId=undefined;}
  intRevision=objOrder.intRevision;progressControls(objOrder.strStatus,objOrder.arrWarnings.length>0);
  renderReference(document.querySelector('#detail-reference'),objOrder);document.querySelector('#detail-summary').textContent=summary(objOrder);
  const elWarnings=document.querySelector('#detail-warnings');elWarnings.replaceChildren();for(const strWarning of objOrder.arrWarnings)elWarnings.append(element('li',strWarning));
  document.querySelector('#detail-review').hidden=objOrder.arrWarnings.length===0;
  const elItems=document.querySelector('#detail-items');elItems.replaceChildren();for(const objItem of objOrder.arrItems)elItems.append(element('li',`${objItem.intQuantity} × ${objItem.strDescription}`));
  document.querySelector('#detail-contact').textContent=objOrder.objContact?[objOrder.objContact.strName,objOrder.objContact.strPhone||objOrder.objContact.strEmail].filter(Boolean).join(' · '):'Contact details have been removed.';elStatus.textContent='Order refreshed.';
}
elRefresh.hidden=false;
elRefresh.addEventListener('click',async()=>{
  elRefresh.disabled=true;if(elAdminSubmit)elAdminSubmit.disabled=true;if(elRefundButton)elRefundButton.disabled=true;if(elAdvance)elAdvance.disabled=true;elMain.setAttribute('aria-busy','true');elError.hidden=true;elStatus.textContent='Refreshing orders…';
  const objAbort=new AbortController();const intTimer=setTimeout(()=>objAbort.abort(),10000);
  try{
    const objResponse=await fetch(strReference?`/api/staff/orders/${encodeURIComponent(strReference)}`:`/api/staff/orders${location.search}`,{credentials:'same-origin',cache:'no-store',signal:objAbort.signal});
    if([400,401,403,404].includes(objResponse.status)){clearPrivate();document.querySelector('#orders-pages')?.replaceChildren();document.querySelector('#orders-signin').hidden=false;elRefresh.hidden=true;if(elAdvance)elAdvance.hidden=true;throw new Error('Your staff session is unavailable. Sign in again.');}
    const objResult=await objResponse.json();if(!objResponse.ok)throw new Error(objResult.strMessage??'Orders could not be refreshed.');
    if(strReference)renderDetail(objResult);else renderQueue(objResult);
  }catch(objError){elStatus.textContent='Refresh did not complete.';elError.textContent=objError instanceof TypeError||objError instanceof SyntaxError||objError.name==='AbortError'?'Unable to refresh. Previously loaded details may be out of date. Try again.':objError.message;elError.hidden=false;}
  finally{clearTimeout(intTimer);elRefresh.disabled=false;elMain.removeAttribute('aria-busy');}
});

if(elAdvance)elAdvance.addEventListener('click',async()=>{
  elAdvance.disabled=true;elRefresh.disabled=true;elError.hidden=true;elMain.setAttribute('aria-busy','true');elStatus.textContent='Saving order status…';
  const objAbort=new AbortController();const intTimer=setTimeout(()=>objAbort.abort(),10000);
  try{
    const objCsrfResponse=await fetch('/api/staff/orders/csrf',{cache:'no-store',credentials:'same-origin',signal:objAbort.signal});
    if(objCsrfResponse.status===401){clearPrivate();document.querySelector('#orders-signin').hidden=false;}if(!objCsrfResponse.ok)throw new Error('Your session is unavailable. Refresh or sign in again.');
    const objCsrf=await objCsrfResponse.json();
    const objResponse=await fetch(`/api/staff/orders/${encodeURIComponent(strReference)}/progress`,{method:'POST',credentials:'same-origin',cache:'no-store',signal:objAbort.signal,
      headers:{'Content-Type':'application/json','X-CSRF-Token':objCsrf.strCsrfToken},body:JSON.stringify({intRevision,strStatus:elAdvance.dataset.nextStatus})});
    const objResult=await objResponse.json();
    if(objResponse.status===401){clearPrivate();document.querySelector('#orders-signin').hidden=false;elAdvance.hidden=true;}
    if(!objResponse.ok)throw new Error(objResult.strMessage??'Update unavailable.');
    elStatus.textContent=`Saved: ${objResult.strStatus}. Refresh to view current details.`;
  }catch(objError){elError.textContent=`${objError.name==='AbortError'||objError instanceof TypeError?'The update could not be confirmed.':objError.message} Refresh before trying again.`;elError.hidden=false;elStatus.textContent='Refresh required.';}
  finally{clearTimeout(intTimer);elRefresh.disabled=false;elMain.removeAttribute('aria-busy');}
});
const elAdminSubmit=document.querySelector('#admin-order-submit');
document.querySelector('#admin-order-action')?.addEventListener('change',objEvent=>{elAdminSubmit.textContent=objEvent.target.value==='privacy'?'Open privacy review':'Save reviewed decision';});
if(elAdminSubmit){elAdminSubmit.hidden=false;elAdminSubmit.addEventListener('click',async()=>{
  if(document.querySelector('#admin-order-action').value==='privacy'){location.assign(`/staff/privacy/${encodeURIComponent(strReference)}`);return;}
  if(!document.querySelector('#admin-order-reviewed').checked){elError.hidden=false;elError.textContent='Review this order and confirm your decision first.';return;}
  elAdminSubmit.disabled=true;elRefresh.disabled=true;if(elAdvance)elAdvance.disabled=true;elError.hidden=true;
  const objAbort=new AbortController();const intTimer=setTimeout(()=>objAbort.abort(),10000);
  try{
    const objCsrfResponse=await fetch('/api/staff/orders/csrf',{cache:'no-store',credentials:'same-origin',signal:objAbort.signal});if(objCsrfResponse.status===401){clearPrivate();document.querySelector('#orders-signin').hidden=false;}if(!objCsrfResponse.ok)throw new Error('Your session is unavailable. Refresh or sign in again.');
    const objCsrf=await objCsrfResponse.json();const strAction=document.querySelector('#admin-order-action').value;
    const objResponse=await fetch(`/api/staff/orders/${encodeURIComponent(strReference)}/${strAction==='tracking-replacement'?'tracking-replacement':'exception'}`,{method:'POST',credentials:'same-origin',cache:'no-store',signal:objAbort.signal,headers:{'Content-Type':'application/json','X-CSRF-Token':objCsrf.strCsrfToken},body:JSON.stringify(strAction==='tracking-replacement'?{bReviewed:true}:{intRevision,strAction})});
    const objResult=await objResponse.json();if(objResponse.status===401||objResponse.status===403){clearPrivate();document.querySelector('#orders-signin').hidden=false;}if(!objResponse.ok)throw new Error(objResult.strMessage??'Administrative action unavailable.');
    const elResult=document.querySelector('#admin-order-result');elResult.textContent=objResult.bRefundReviewRequired?'Order cancelled. Refund review is still required.':'Decision saved. Refresh before another decision.';
    if(objResult.strTrackingPath&&/^\/track#[a-f0-9]{64}$/.test(objResult.strTrackingPath)){const elLink=element('a','Replacement private link');elLink.href=objResult.strTrackingPath;elResult.append(' ',elLink);}
  }catch(objError){elError.hidden=false;elError.textContent=`${objError.name==='AbortError'?'The decision could not be confirmed.':objError.message} Refresh before retrying.`;}
  finally{clearTimeout(intTimer);elRefresh.disabled=false;}
});}

window.addEventListener('staff-session-unavailable',()=>{document.querySelector('#orders-content').replaceChildren();document.querySelector('#admin-order-result')?.replaceChildren();document.querySelector('#refund-panel')?.replaceChildren();if(elAdminSubmit)elAdminSubmit.hidden=true;if(elAdvance)elAdvance.hidden=true;});
function clearPrivate(){window.dispatchEvent(new Event('staff-session-unavailable'));document.querySelector('#orders-content').replaceChildren();document.querySelector('#admin-order-result')?.replaceChildren();document.querySelector('#refund-panel')?.replaceChildren();if(elAdminSubmit)elAdminSubmit.hidden=true;if(elAdvance)elAdvance.hidden=true;}

function money(centsValue){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(centsValue/100);}
if(elRefundButton)elRefundButton.addEventListener('click',async()=>{
  if(!document.querySelector('#refund-reviewed').checked){elError.hidden=false;elError.textContent='Review and approve the full refund first.';return;}
  strRefundRequestId??=crypto.randomUUID();elRefundButton.disabled=true;elRefresh.disabled=true;elError.hidden=true;
  const objAbort=new AbortController();const intTimer=setTimeout(()=>objAbort.abort(),10000);let bUncertain=true;
  try{
    const objCsrfResponse=await fetch('/api/staff/orders/csrf',{credentials:'same-origin',cache:'no-store',signal:objAbort.signal});
    if(!objCsrfResponse.ok){if(objCsrfResponse.status===401){clearPrivate();document.querySelector('#orders-signin').hidden=false;}throw new Error('Session unavailable. Sign in again.');}
    const objCsrf=await objCsrfResponse.json();
    const objResponse=await fetch(`/api/staff/orders/${encodeURIComponent(strReference)}/refund`,{method:'POST',credentials:'same-origin',cache:'no-store',signal:objAbort.signal,headers:{'Content-Type':'application/json','X-CSRF-Token':objCsrf.strCsrfToken},body:JSON.stringify({intRevision,strRequestId:strRefundRequestId})});
    const objResult=await objResponse.json();bUncertain=false;
    if(objResponse.status===401||objResponse.status===403){clearPrivate();document.querySelector('#orders-signin').hidden=false;throw new Error('Your staff session is unavailable. Sign in again.');}
    if(!objResponse.ok)throw new Error(objResult.strMessage??'Refund unavailable. Refresh before retrying.');
    document.querySelector('#refund-status').textContent=objResult.strMessage;strRefundRequestId=undefined;
  }catch(objError){elError.hidden=false;elError.textContent=objError.name==='AbortError'||objError instanceof TypeError?'Refund result could not be confirmed. Check the same request before starting another.':objError.message;}
  finally{clearTimeout(intTimer);elRefresh.disabled=false;if(bUncertain&&document.querySelector('#refund-submit')){elRefundButton.disabled=false;elRefundButton.textContent='Check refund result';}}
});
