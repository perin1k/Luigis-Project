/**
 * Progressive staff account controls with keyboard/focus and private-token handling.
 * Server-side session, MFA, role and CSRF checks remain authoritative for every action.
 */
const elMain = document.querySelector('[data-staff-mode]');
const elStatus = document.querySelector('#staff-status');
let bSubmitting = false;
let intSetupTimer;
function clearAuthenticator(){
  clearTimeout(intSetupTimer);
  const elCanvas=document.querySelector('#authenticator-qr');
  if(elCanvas){elCanvas.width=0;elCanvas.height=0;elCanvas.hidden=true;}
  const elKey=document.querySelector('#setup-key');if(elKey)elKey.value='';
  const elVisuals=document.querySelector('#authenticator-visuals');if(elVisuals)elVisuals.hidden=true;
}
function showAuthenticator(objQrCode){
  clearAuthenticator();
  document.querySelector('#authenticator-visuals').hidden=false;
  const elCanvas=document.querySelector('#authenticator-qr');
  try{
    const {intSize,strModules}=objQrCode??{};
    if(!Number.isInteger(intSize)||intSize<21||intSize>177||typeof strModules!=='string'
      ||strModules.length!==intSize**2||!/^[01]+$/.test(strModules))throw new Error();
    elCanvas.width=(intSize+8)*4;elCanvas.height=elCanvas.width;
    const objContext=elCanvas.getContext('2d');
    objContext.fillStyle='#fff';objContext.fillRect(0,0,elCanvas.width,elCanvas.height);
    objContext.fillStyle='#000';
    for(let intIndex=0;intIndex<strModules.length;intIndex++)if(strModules[intIndex]==='1')
      objContext.fillRect((intIndex%intSize+4)*4,(Math.floor(intIndex/intSize)+4)*4,4,4);
    elCanvas.hidden=false;
  }catch{elCanvas.width=0;elCanvas.height=0;elCanvas.hidden=true;}
  intSetupTimer=setTimeout(()=>{clearAuthenticator();announce('Private setup details hidden after ten minutes. Confirmation may have expired.');},600000);
  return !elCanvas.hidden;
}
function announce(strMessage, bFocus = true) {
  elStatus.hidden = false; elStatus.textContent = strMessage;
  if (bFocus) elStatus.focus();
}
function reportError(objError) {
  announce(objError instanceof TypeError || objError instanceof SyntaxError
    ? 'Connection interrupted. Your request could not be confirmed. Refresh current records before retrying an action.' : objError.message);
  if (objError.bRequiresSignIn) {
    const elLink = document.createElement('a'); elLink.href = '/staff/sign-in';
    elLink.textContent = ' Go to sign-in'; elStatus.append(elLink);
  }
}
async function request(strPath, objBody) {
  const objOptions = { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
  if (objBody !== undefined) {
    const objCsrfResponse = await fetch('/auth/csrf', objOptions);
    if (!objCsrfResponse.ok) throw new Error('Secure access is unavailable. Refresh this page and try again.');
    const objCsrf = await objCsrfResponse.json();
    objOptions.method = 'POST';
    objOptions.headers = { ...objOptions.headers, 'Content-Type': 'application/json', 'X-CSRF-Token': objCsrf.strCsrfToken };
    objOptions.body = JSON.stringify(objBody);
  }
  const objResponse = await fetch(`/auth${strPath}`, objOptions);
  if (!objResponse.ok) {
    const bRequiresSignIn = [401, 403].includes(objResponse.status) && elMain.dataset.staffMode === 'account';
    if (bRequiresSignIn) clearSecrets();
    const objError = new Error(objResponse.status >= 500 ? 'Staff access is temporarily unavailable. Please try again.'
      : 'Unable to complete this request. Check your details and try again. Expired or revoked access requires signing in again; repeated attempts may need a 15-minute wait.');
    objError.bRequiresSignIn = bRequiresSignIn;
    throw objError;
  }
  return objResponse.status === 204 ? {} : objResponse.json();
}
function clearSecrets() {
  clearAuthenticator();
  for (const elInput of document.querySelectorAll('input[type=password], input[autocomplete=one-time-code], textarea')) elInput.value = '';
  for (const strId of ['recovery-codes', 'invitation-result', 'recovery-enrollment']) {
    const elPanel = document.getElementById(strId); if (elPanel) elPanel.hidden = true;
  }
}
function showCodes(arrCodes) {
  document.querySelector('#codes-text').value = arrCodes.join('\n');
  document.querySelector('#recovery-codes').hidden = false;
  document.querySelector('#codes-text').focus();
}
for (const elForm of document.querySelectorAll('form[data-endpoint]')) {
  elForm.querySelector('button[type=submit]').disabled = false;
  elForm.addEventListener('submit', async (objEvent) => {
    objEvent.preventDefault();
    if (bSubmitting) return;
    bSubmitting = true;
    const elButton = elForm.querySelector('button[type=submit]'); elButton.disabled = true;
    elForm.setAttribute('aria-busy', 'true');
    const objBody = Object.fromEntries(new FormData(elForm));
    if (objBody.strRecoveryMfa !== undefined) { objBody.strCode = objBody.strRecoveryMfa; delete objBody.strRecoveryMfa; }
    announce('Working…', false);
    try {
      const objResult = await request(elForm.dataset.endpoint, objBody);
      elForm.reset();
      const strResult = elForm.dataset.result;
      if (strResult === 'session' || (strResult === 'login' && objResult.strState === 'authenticated')) {
        clearSecrets(); window.location.replace('/staff/account');
      } else if (strResult === 'login') {
        elForm.hidden = true; document.querySelector('#mfa-form').hidden = false;
        announce('Password verified. Enter your authenticator code.'); document.querySelector('#strCode').focus();
      } else if (strResult === 'enrolled') {
        elForm.hidden = true; announce('Your account is ready. Employees can sign in now. New administrators must complete first authenticator setup on the recovery page before signing in.');
      } else if (strResult === 'password' || strResult === 'logout') {
        clearSecrets(); window.location.replace('/staff/sign-in');
      } else if (strResult === 'invited') {
        document.querySelector('#invitation-token').value = objResult.strInvitationToken;
        document.querySelector('#invitation-result').hidden = false;
        announce('Invitation created. Share it privately before its 24-hour expiry.');
        await refreshLists(); document.querySelector('#invitation-token').focus();
      } else if (strResult === 'codes') {
        announce('Previous recovery codes are invalid. Save this replacement set privately.'); showCodes(objResult.arrRecoveryCodes);
      } else if (strResult === 'recovery') {
        elForm.hidden = true;
        const bHasQr=showAuthenticator(objResult.objQrCode);
        document.querySelector('#setup-key').value = new URL(objResult.strProvisioningUri).searchParams.get('secret');
        document.querySelector('#recovery-enrollment').hidden = false;
        announce(bHasQr?'Scan the QR code with your authenticator app or enter the private setup key, then confirm a new code. Previous access is revoked during replacement.'
          :'QR display is unavailable. Enter the private setup key in your authenticator app, then confirm a new code.');
        document.querySelector('#setup-key').focus();
      } else if (strResult === 'recovered') {
        clearSecrets(); elForm.hidden = true;
        announce('Authenticator replaced. Save your new recovery codes, then return to sign-in.'); showCodes(objResult.arrRecoveryCodes);
      }
    } catch (objError) {
      // Retain non-secret fields for correction; never keep submitted passwords/codes.
      for (const elInput of elForm.querySelectorAll('input[type=password], input[autocomplete=one-time-code]')) elInput.value = '';
      reportError(objError);
    } finally {
      objBody.strPassword = ''; objBody.strCurrentPassword = ''; objBody.strNewPassword = ''; objBody.strCode = ''; objBody.strRecoveryCode = ''; objBody.strInvitationToken = '';
      bSubmitting = false; elButton.disabled = false; elForm.removeAttribute('aria-busy');
    }
  });
}
for (const elButton of document.querySelectorAll('[data-clear]')) elButton.addEventListener('click', () => {
  if(elButton.dataset.clear==='authenticator-visuals')clearAuthenticator();
  const elPanel = document.getElementById(elButton.dataset.clear);
  for (const elField of elPanel.querySelectorAll('textarea')) elField.value = '';
  elPanel.hidden = true; announce('Private information hidden.');
});
async function loadList(elSection, intOffset = 0, objInitialResult) {
  const bEmployees = elSection.dataset.list === 'employees';
  const strPath = bEmployees ? '/employees' : '/employees/invitations';
  const arrButtons = [...elSection.querySelectorAll('button[data-page]')];
  arrButtons.forEach((elButton) => { elButton.disabled = true; });
  try {
    const objResult = objInitialResult ?? await request(`${strPath}?intOffset=${intOffset}&intLimit=10`);
    const arrRecords = bEmployees ? objResult.arrEmployees : objResult.arrInvitations;
    const elList = elSection.querySelector('ul'); elList.replaceChildren();
    for (const objRecord of arrRecords) {
      const elItem = document.createElement('li');
      const elName=document.createElement('span'); elName.textContent = `${objRecord.strUsername ?? 'Unassigned username'} · ${objRecord.strState}`; elItem.append(elName);
      if (!bEmployees && objRecord.strState === 'pending') {
        const elExpiry = document.createElement('p'); elExpiry.className = 'small';
        elExpiry.textContent = `Recorded expiry: ${objRecord.strExpiresAt}. The server checks validity when accepted.`; elItem.append(elExpiry);
      }
      if (bEmployees) {
        const elRole = document.createElement('p'); elRole.textContent = 'Role: ' + (objRecord.strRole==='admin'?'Admin':'Employee'); elItem.append(elRole);
        async function update(strField, strValue, elAction) {
          if (bSubmitting || !window.confirm('Change '+objRecord.strUsername+' '+strField+' to '+strValue+' and revoke its existing sessions?')) return;
          bSubmitting = true; elAction.disabled = true;
          try {
            await request('/staff/update', {strUserId:objRecord.strUserId,strRevision:String(objRecord.intRevision),strField,strValue});
            announce(strField==='role'&&strValue==='admin'?'Account updated. Ask the new admin to complete first authenticator setup before signing in.':'Account updated. A fresh sign-in is required.'); await loadList(elSection,intOffset);
          } catch(objError) { reportError(objError); elAction.disabled = false; }
          finally { bSubmitting = false; }
        }
        const elState = document.createElement('button'); elState.type='button'; elState.className='btn btn-outline-primary';
        elState.textContent=(objRecord.strState==='active'?'Deactivate ':'Reactivate ')+objRecord.strUsername;
        elState.addEventListener('click',()=>update('state',objRecord.strState==='active'?'disabled':'active',elState));elItem.append(elState);
        if (objResult.bOwner) {
          const elRoleButton=document.createElement('button'); elRoleButton.type='button'; elRoleButton.className='btn btn-outline-primary';
          elRoleButton.textContent=(objRecord.strRole==='employee'?'Promote to Admin: ':'Change to Employee: ')+objRecord.strUsername;
          elRoleButton.addEventListener('click',()=>update('role',objRecord.strRole==='employee'?'admin':'employee',elRoleButton));elItem.append(elRoleButton);
        }
      } else if (objRecord.strState === 'pending') {
        const elAction=document.createElement('button');elAction.type='button';elAction.className='btn btn-outline-primary';
        elAction.textContent='Revoke invitation for '+objRecord.strUsername;
        elAction.addEventListener('click',async()=>{
          if(bSubmitting||!window.confirm('Revoke this invitation?'))return;bSubmitting=true;elAction.disabled=true;
          try{await request('/employees/invitations/revoke',{strInvitationId:objRecord.strInvitationId});announce('Invitation revoked.');await loadList(elSection,intOffset);}
          catch(objError){reportError(objError);elAction.disabled=false;}finally{bSubmitting=false;}
        });elItem.append(elAction);
      }
      elList.append(elItem);
    }
    elSection.querySelector('.list-summary').textContent = arrRecords.length ? `Showing ${intOffset + 1}–${intOffset + arrRecords.length}. Refresh for the latest team changes.` : 'No records on this page.';
    for (const elButton of arrButtons) {
      elButton.disabled = elButton.dataset.page === 'previous' ? intOffset === 0 : elButton.dataset.page === 'next' ? !objResult.bHasMore : false;
      elButton.onclick = async () => {
        const intNextOffset = elButton.dataset.page === 'previous' ? Math.max(0, intOffset - 10) : elButton.dataset.page === 'next' ? intOffset + 10 : intOffset;
        if (await loadList(elSection, intNextOffset)) elSection.querySelector('h2').focus();
      };
    }
    return true;
  } catch (objError) {
    elSection.querySelector('ul').replaceChildren();
    elSection.querySelector('.list-summary').textContent = 'Unable to load current records.';
    const elRefresh = arrButtons.find((elButton) => elButton.dataset.page === 'refresh');
    elRefresh.disabled = false; elRefresh.onclick = () => loadList(elSection, intOffset); reportError(objError);
  }
}
async function refreshLists() { await Promise.all([...document.querySelectorAll('[data-list]')].map((elSection) => loadList(elSection))); }
const objInitialLists = JSON.parse(elMain.dataset.staffLists);
await Promise.all([...document.querySelectorAll('[data-list]')].map((elSection) => loadList(elSection, 0, objInitialLists[elSection.dataset.list])));
window.addEventListener('pagehide', clearSecrets);
window.addEventListener('pageshow', (objEvent) => { if (objEvent.persisted) window.location.reload(); });
