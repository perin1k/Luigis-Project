const elMain=document.querySelector('[data-privacy-reference]');
const elForm=document.querySelector('#privacy-form');const elFields=document.querySelector('#privacy-fields');
const elReviewed=document.querySelector('#privacy-reviewed');const elStatus=document.querySelector('#privacy-status');
const elError=document.querySelector('#privacy-error');const elCopyPanel=document.querySelector('#privacy-copy-panel');
const elCopy=document.querySelector('#privacy-copy');const elShow=document.querySelector('#privacy-show');
let intRevision=Number(elMain.dataset.privacyRevision);let intGeneration=0;let objActiveAbort;
const strPath=`/api/staff/privacy/${encodeURIComponent(elMain.dataset.privacyReference)}`;
function hideCopy() {elCopy.value='';elCopyPanel.hidden=true;}
function clearPrivate() {
  intGeneration++;objActiveAbort?.abort();hideCopy();document.querySelector('#privacy-content').replaceChildren();
  document.querySelector('#privacy-signin').hidden=false;
}
document.querySelector('#privacy-save').disabled=false;elShow.disabled=false;
document.querySelector('#privacy-hide').addEventListener('click',()=>{hideCopy();elShow.focus();elStatus.textContent='Data copy hidden.';});
window.addEventListener('staff-session-unavailable',clearPrivate);
window.addEventListener('pagehide',clearPrivate);
window.addEventListener('pageshow',objEvent=>{if(objEvent.persisted)location.reload();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){intGeneration++;objActiveAbort?.abort();hideCopy();}});

async function submit(strAction) {
  elError.hidden=true;hideCopy();
  if(!elReviewed.checked) {elError.textContent='Verify the requester and confirm the review first.';elError.hidden=false;elReviewed.focus();return;}
  const objContact={strName:document.querySelector('#privacy-name').value,strPhone:document.querySelector('#privacy-phone').value,strEmail:document.querySelector('#privacy-email').value};
  const objInput={intRevision,bReviewed:true,...(strAction==='correct'?{objContact}:{})};
  const intCurrent=++intGeneration;objActiveAbort=new AbortController();
  const intTimer=setTimeout(()=>objActiveAbort.abort(),10000);
  elFields.disabled=true;elReviewed.disabled=true;elMain.setAttribute('aria-busy','true');elStatus.textContent='Checking administrative access…';
  try {
    const objCsrfResponse=await fetch(`${strPath}/csrf`,{cache:'no-store',credentials:'same-origin',signal:objActiveAbort.signal});
    if(!objCsrfResponse.ok) {if([401,403,404,410].includes(objCsrfResponse.status))clearPrivate();throw new Error('Privacy review is unavailable. Reload or sign in again.');}
    const objCsrf=await objCsrfResponse.json();
    const objResponse=await fetch(`${strPath}/${strAction}`,{method:'POST',cache:'no-store',credentials:'same-origin',signal:objActiveAbort.signal,headers:{'Content-Type':'application/json','X-CSRF-Token':objCsrf.strCsrfToken},body:JSON.stringify(objInput)});
    const objResult=await objResponse.json();
    if([401,403,404,410].includes(objResponse.status)) {clearPrivate();throw new Error('Your administrative access or these contact details are unavailable. Reload or sign in again.');}
    if(intCurrent!==intGeneration)return;
    if(!objResponse.ok)throw new Error(objResult.strMessage??'Privacy review could not be completed.');
    if(strAction==='correct') {intRevision=objResult.intRevision;elReviewed.checked=false;elStatus.textContent=objResult.strMessage;}
    else {elCopy.value=JSON.stringify(objResult,null,2);elCopyPanel.hidden=false;elCopy.focus();elStatus.textContent='Limited data copy ready for private review. Nothing has been sent.';}
  } catch(objError) {
    elError.textContent=objError instanceof TypeError||objError instanceof SyntaxError||objError.name==='AbortError'?'The result could not be confirmed. Reload to check the saved contact before retrying.':objError.message;elError.hidden=false;elStatus.textContent='Privacy review did not complete.';
  } finally {clearTimeout(intTimer);elFields.disabled=false;elReviewed.disabled=false;elMain.removeAttribute('aria-busy');}
}
elForm.addEventListener('submit',objEvent=>{objEvent.preventDefault();submit('correct');});
elShow.addEventListener('click',()=>submit('copy'));
