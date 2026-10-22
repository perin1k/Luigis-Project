let intLoad=0;
const elRefresh=document.querySelector('#tracking-refresh');const elStatus=document.querySelector('#tracking-status');const elError=document.querySelector('#tracking-error');const elContent=document.querySelector('#tracking-content');
function element(strTag,strText){const elNode=document.createElement(strTag);elNode.textContent=strText;return elNode;}
function formatTime(dtValue){return new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'}).format(new Date(dtValue));}
async function refresh(){
  const intRequest=++intLoad;const strToken=location.hash.slice(1);
  if(!/^[a-f0-9]{64}$/.test(strToken)){elContent.replaceChildren();elRefresh.hidden=true;elError.hidden=false;elError.textContent='This private link is unavailable or expired.';elStatus.textContent='Progress could not be loaded.';elContent.removeAttribute('aria-busy');return;}
  elRefresh.disabled=true;elError.hidden=true;elStatus.textContent='Loading order progress…';elContent.setAttribute('aria-busy','true');
  const objAbort=new AbortController();const intTimer=setTimeout(()=>objAbort.abort(),10000);
  try{
    const objResponse=await fetch('/api/tracking',{method:'POST',credentials:'omit',cache:'no-store',signal:objAbort.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({strToken})});
    if(intRequest!==intLoad)return;
    if(objResponse.status===404){elContent.replaceChildren();throw new Error('This private link is unavailable or expired. Ask the team for help recovering your link.');}
    if(!objResponse.ok)throw new Error('Unable to refresh. Previously loaded progress may be out of date. Try again.');
    const objOrder=await objResponse.json();if(intRequest!==intLoad)return;const elReference=element('p','Order ');const elValue=element('span',objOrder.strReference);elValue.className='tracking-reference font-monospace';elReference.append(elValue);elContent.replaceChildren(elReference,element('p',objOrder.strService==='carry-out'?'Carry-out':'Dine-in'),element('h3',objOrder.strStatus));
    if(objOrder.dtReadyAt)elContent.append(element('p',`${['Cancelled','Not collected','Completed'].includes(objOrder.strStatus)?'Original ready time':'Ready time'}: ${formatTime(objOrder.dtReadyAt)} Central`));
    if(objOrder.bReviewPending)elContent.append(element('p',['Cancelled','Not collected','Completed'].includes(objOrder.strStatus)?'Our team is reviewing an outstanding case for this order.':'Our team is reviewing this order. Its ready time may need confirmation.'));
    const elList=element('ol','');for(const objStep of objOrder.arrProgress)elList.append(element('li',`${objStep.strStatus} · ${formatTime(objStep.dtOccurredAt)} Central`));elContent.append(elList);elStatus.textContent='Progress refreshed.';
  }catch(objError){if(intRequest!==intLoad)return;elError.textContent=objError.name==='AbortError'||objError instanceof TypeError?'Unable to refresh. Previously loaded progress may be out of date. Try again.':objError.message;elError.hidden=false;elStatus.textContent='Progress could not be loaded.';}
  finally{clearTimeout(intTimer);if(intRequest===intLoad){elRefresh.disabled=false;elContent.removeAttribute('aria-busy');}}
}
function openLink(){elContent.replaceChildren();elRefresh.hidden=false;refresh();}
elRefresh.addEventListener('click',refresh);window.addEventListener('hashchange',openLink);
for(const elLink of document.querySelectorAll('a[href="#main-content"]'))elLink.addEventListener('click',(objEvent)=>{objEvent.preventDefault();const elMain=document.querySelector('#main-content');elMain.focus();elMain.scrollIntoView();});
if(location.hash)openLink();
