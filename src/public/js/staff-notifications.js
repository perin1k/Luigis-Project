const elPanel=document.querySelector('#notification-panel');
const elMain=document.querySelector('[data-order-reference]');
const strReference=elMain.dataset.orderReference;
const elList=document.querySelector('#notification-list');
const elStatus=document.querySelector('#notification-status');
const elError=document.querySelector('#notification-error');
const elRefresh=document.querySelector('#notification-refresh');
let intGeneration=0;let bSessionDenied=false;
function element(strTag,strText){const elNode=document.createElement(strTag);elNode.textContent=strText;return elNode;}
function clearPrivate(){bSessionDenied=true;intGeneration++;elList.replaceChildren();elPanel.open=false;elPanel.hidden=true;}
window.addEventListener('staff-session-unavailable',clearPrivate);
function deny(){clearPrivate();window.dispatchEvent(new Event('staff-session-unavailable'));document.querySelector('#orders-signin').hidden=false;}
function render(objResult){
  elList.replaceChildren();
  for(const objNotice of objResult.arrPreviews){
    const elItem=element('li','');elItem.append(element('h3',`${objNotice.strChannel==='sms'?'SMS':'Email'} · ${objNotice.strTemplate}`),element('p',`Generation: ${objNotice.strState} · Attempts: ${objNotice.intAttempts}`));
    if(objNotice.strState==='previewed'&&typeof objNotice.strBody==='string'){
      elItem.append(element('p',objNotice.strSubject));const elBody=element('p','');elBody.className='notification-body';
      const arrParts=objNotice.strBody.split(strReference);for(let intIndex=0;intIndex<arrParts.length;intIndex++){if(intIndex){const elReference=element('span',strReference);elReference.className='notification-order-reference font-monospace';elBody.append(elReference);}elBody.append(document.createTextNode(arrParts[intIndex]));}elItem.append(elBody);
    }else if(objNotice.strState==='previewed')elItem.append(element('p','Preview content is unavailable. Nothing is being sent.'));
    else if(objNotice.strState==='failed'){
      elItem.append(element('p','The preview could not be generated. Nothing was sent.'));
      if(objResult.bCanRetry){const elRetry=element('button',`Retry ${objNotice.strChannel==='sms'?'SMS':'email'} ${objNotice.strTemplate} preview`);elRetry.type='button';elRetry.tabIndex=0;elRetry.className='btn btn-outline-primary';elRetry.addEventListener('click',()=>retry(objNotice.strId,elRetry));elItem.append(elRetry);}
    }
    elList.append(elItem);
  }
  elStatus.textContent=objResult.bExpired?'Previews have expired or contact details were removed.':objResult.arrPreviews.length?'Previews refreshed.':'No notification previews are recorded for this order.';
}
async function load(){
  if(bSessionDenied)return;const intRequest=++intGeneration;elRefresh.disabled=true;elError.hidden=true;elStatus.textContent='Loading previews…';elList.setAttribute('aria-busy','true');
  const objAbort=new AbortController();const intTimer=setTimeout(()=>objAbort.abort(),10000);
  try{const objResponse=await fetch(`/api/staff/orders/${encodeURIComponent(strReference)}/notifications`,{credentials:'same-origin',cache:'no-store',signal:objAbort.signal});
    if(intRequest!==intGeneration)return;if([401,403].includes(objResponse.status)){deny();return;}const objResult=await objResponse.json();if(intRequest!==intGeneration)return;if(!objResponse.ok)throw new Error('Previews could not be loaded.');render(objResult);
  }catch{if(intRequest===intGeneration){elList.replaceChildren();elError.hidden=false;elError.textContent='Previews could not be loaded. Refresh to try again.';elStatus.textContent='Refresh required.';}}
  finally{clearTimeout(intTimer);if(intRequest===intGeneration){elRefresh.disabled=false;elList.removeAttribute('aria-busy');}}
}
async function retry(strId,elRetry){
  const intRequest=++intGeneration;elRetry.disabled=true;elRefresh.disabled=true;elError.hidden=true;
  const objAbort=new AbortController();const intTimer=setTimeout(()=>objAbort.abort(),10000);
  try{const objCsrfResponse=await fetch('/api/staff/orders/csrf',{credentials:'same-origin',cache:'no-store',signal:objAbort.signal});if(intRequest!==intGeneration)return;if(objCsrfResponse.status===401){deny();return;}if(!objCsrfResponse.ok)throw new Error();const objCsrf=await objCsrfResponse.json();if(intRequest!==intGeneration)return;
    const objResponse=await fetch(`/api/staff/orders/${encodeURIComponent(strReference)}/notifications/retry`,{method:'POST',credentials:'same-origin',cache:'no-store',signal:objAbort.signal,headers:{'Content-Type':'application/json','X-CSRF-Token':objCsrf.strCsrfToken},body:JSON.stringify({strNotificationId:strId})});if(intRequest!==intGeneration)return;
    if([401,403].includes(objResponse.status)){deny();return;}const objResult=await objResponse.json();if(intRequest!==intGeneration)return;if(!objResponse.ok)throw new Error();elStatus.textContent=`Preview generation: ${objResult.strState}. Refresh to check the result.`;
  }catch{if(intRequest===intGeneration){elError.hidden=false;elError.textContent='The retry could not be confirmed. Refresh before trying again.';}}
  finally{clearTimeout(intTimer);if(intRequest===intGeneration)elRefresh.disabled=false;}
}
elPanel.addEventListener('toggle',()=>{if(elPanel.open)load();else{intGeneration++;elList.replaceChildren();elRefresh.disabled=false;}});
elRefresh.addEventListener('click',load);
