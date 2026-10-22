const elMain=document.querySelector('[data-order-reference]');
const strReference=elMain.dataset.orderReference;
const elRefresh=document.querySelector('#refresh-orders');const elStatus=document.querySelector('#orders-status');const elError=document.querySelector('#orders-error');
function element(strTag,strText){const elElement=document.createElement(strTag);elElement.textContent=strText;return elElement;}
function readyTime(dtValue){return dtValue?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(dtValue)):'Ready time unavailable';}
function summary(objOrder){return `${objOrder.strService==='carry-out'?'Carry-out':'Dine-in'} · ${objOrder.strStatus} · ${readyTime(objOrder.dtReadyAt)}${objOrder.bReadyTimePassed?' · Ready time passed':''}`;}
function renderReference(elTarget,objOrder){elTarget.replaceChildren(document.createTextNode(`${objOrder.strCustomerName} · `));const elValue=element('span',objOrder.strReference);elValue.className='staff-order-reference font-monospace';elTarget.append(elValue);}
function renderQueue(objQueue){
  const elList=document.querySelector('#orders-list');elList.replaceChildren();document.querySelector('#orders-empty').hidden=objQueue.arrOrders.length>0;
  for(const objOrder of objQueue.arrOrders){const elItem=element('li','');const elTitle=element('h3','');const elLink=element('a','');renderReference(elLink,objOrder);elLink.href=`/staff/orders/${encodeURIComponent(objOrder.strReference)}`;elTitle.append(elLink);
    elItem.append(elTitle,element('p',summary(objOrder)),element('p',`${objOrder.intPizzaQuantity} pizzas · ${objOrder.intDrinkQuantity} drinks`));
    if(objOrder.arrWarnings.length){const elWarnings=element('ul','');for(const strWarning of objOrder.arrWarnings)elWarnings.append(element('li',strWarning));elItem.append(elWarnings);}elList.append(elItem);
  }
  const elPages=document.querySelector('#orders-pages');elPages.replaceChildren();
  for(const [strLabel,intPage,bShow] of [['Previous page',objQueue.intPage-1,objQueue.intPage>0],['Next page',objQueue.intPage+1,objQueue.bHasNext]])if(bShow){const elLink=element('a',strLabel);elLink.className='btn btn-outline-primary';elLink.href=`/staff/orders?${new URLSearchParams({date:objQueue.strDate,status:objQueue.strStatus,page:String(intPage)})}`;elPages.append(elLink);}
  elStatus.textContent=`Refreshed. ${objQueue.arrOrders.length} orders on this page.`;
}
function renderDetail(objOrder){
  renderReference(document.querySelector('#detail-reference'),objOrder);document.querySelector('#detail-summary').textContent=summary(objOrder);
  const elWarnings=document.querySelector('#detail-warnings');elWarnings.replaceChildren();for(const strWarning of objOrder.arrWarnings)elWarnings.append(element('li',strWarning));
  const elItems=document.querySelector('#detail-items');elItems.replaceChildren();for(const objItem of objOrder.arrItems)elItems.append(element('li',`${objItem.intQuantity} × ${objItem.strDescription}`));
  document.querySelector('#detail-contact').textContent=objOrder.objContact?[objOrder.objContact.strName,objOrder.objContact.strPhone||objOrder.objContact.strEmail].filter(Boolean).join(' · '):'Contact details have been removed.';elStatus.textContent='Order refreshed.';
}
elRefresh.hidden=false;
elRefresh.addEventListener('click',async()=>{
  elRefresh.disabled=true;elMain.setAttribute('aria-busy','true');elError.hidden=true;elStatus.textContent='Refreshing orders…';
  const objAbort=new AbortController();const intTimer=setTimeout(()=>objAbort.abort(),10000);
  try{
    const objResponse=await fetch(strReference?`/api/staff/orders/${encodeURIComponent(strReference)}`:`/api/staff/orders${location.search}`,{credentials:'same-origin',cache:'no-store',signal:objAbort.signal});
    if([400,401,403,404].includes(objResponse.status)){document.querySelector('#orders-content').replaceChildren();document.querySelector('#orders-pages')?.replaceChildren();document.querySelector('#orders-signin').hidden=false;elRefresh.hidden=true;throw new Error('Your staff session is unavailable. Sign in again.');}
    const objResult=await objResponse.json();if(!objResponse.ok)throw new Error(objResult.strMessage??'Orders could not be refreshed.');
    if(strReference)renderDetail(objResult);else renderQueue(objResult);
  }catch(objError){elStatus.textContent='Refresh did not complete.';elError.textContent=objError instanceof TypeError||objError instanceof SyntaxError||objError.name==='AbortError'?'Unable to refresh. Previously loaded details may be out of date. Try again.':objError.message;elError.hidden=false;}
  finally{clearTimeout(intTimer);elRefresh.disabled=false;elMain.removeAttribute('aria-busy');}
});
