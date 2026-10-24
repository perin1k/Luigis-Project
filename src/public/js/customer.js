const elCodes=document.querySelector('#customer-recovery-codes');
const elHide=document.querySelector('#hide-customer-codes');
function clearCodes(){if(!elCodes)return;const elText=elCodes.querySelector('textarea');if(elText)elText.value='';elCodes.remove();}
elHide?.addEventListener('click',()=>{clearCodes();document.querySelector('h1')?.setAttribute('tabindex','-1');document.querySelector('h1')?.focus();});
window.addEventListener('pagehide',()=>{clearCodes();document.querySelector('main')?.replaceChildren();});
window.addEventListener('pageshow',objEvent=>{if(objEvent.persisted)window.location.reload();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearCodes();});
