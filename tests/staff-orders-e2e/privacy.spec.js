import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function settleControls(objPage) {
  // Focus/scroll and disabled-fieldset changes can start CSS transitions on the
  // next render. Move the pointer off controls, allow two render frames, then
  // await actual animations; an immediate zero-animation poll can race styling.
  await objPage.mouse.move(0,0);
  await objPage.evaluate(async()=>{
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    await Promise.all(document.getAnimations().map(objAnimation=>objAnimation.finished.catch(()=>{})));
  });
}

test.beforeEach(async({request:objRequest})=>{await objRequest.get('/__test/reset');});

async function openPrivacy(objPage,objRequest,strUser='admin') {
  await objPage.goto('/staff/sign-in');
  await objPage.getByLabel('Username',{exact:true}).fill(strUser);
  await objPage.getByLabel('Password',{exact:true}).fill('Synthetic staff browser passphrase only');
  await objPage.getByRole('button',{name:'Sign in',exact:true}).click();
  if(strUser!=='employee') {
    await objPage.getByLabel('Authenticator code',{exact:true}).fill(await(await objRequest.get('/__test/code'+(strUser==='owner'?'?secret=owner':''))).text());
    await objPage.getByRole('button',{name:'Verify and sign in',exact:true}).click();
  }
  await expect(objPage).toHaveURL(/\/staff\/account$/);
  await objPage.getByRole('link',{name:'Order queue',exact:true}).click();
  await objPage.getByRole('link',{name:/Synthetic Guest 2 ·/}).click();
  if(strUser==='employee')return;
  await objPage.getByLabel('Decision',{exact:true}).selectOption('privacy');
  await objPage.getByRole('button',{name:'Open privacy review',exact:true}).click();
  await expect(objPage.getByRole('heading',{name:'Customer privacy.',exact:true})).toBeVisible();
}

test('reviewed admin contact correction persists, requires fresh revision and returns only a limited private copy',async({page:objPage,request:objRequest})=>{
  await openPrivacy(objPage,objRequest);
  await objPage.getByRole('button',{name:'Show limited data copy',exact:true}).click();
  await expect(objPage.getByRole('alert')).toContainText('Verify the requester');
  await expect(objPage.getByLabel('I verified the requester and reviewed this order.')).toBeFocused();
  await objPage.getByLabel('I verified the requester and reviewed this order.').check();
  await objPage.getByLabel('Customer name',{exact:true}).fill('Corrected Synthetic Guest');
  await objPage.getByLabel('Phone number',{exact:true}).fill('2025550199');
  await objPage.getByRole('button',{name:'Save contact correction',exact:true}).click();
  await expect(objPage.getByRole('status')).toContainText('Contact correction saved');
  await expect(objPage.getByLabel('I verified the requester and reviewed this order.')).not.toBeChecked();
  await objPage.reload();await expect(objPage.getByLabel('Customer name',{exact:true})).toHaveValue('Corrected Synthetic Guest');
  await objPage.getByLabel('I verified the requester and reviewed this order.').check();
  await objPage.getByRole('button',{name:'Show limited data copy',exact:true}).click();
  const elCopy=objPage.getByLabel('Limited order data copy',{exact:true});
  await expect(elCopy).toBeFocused();
  const objCopy=JSON.parse(await elCopy.inputValue());expect(objCopy.objContact.strPhone).toBe('2025550199');
  expect(Object.keys(objCopy).sort()).toEqual(['arrItems','objContact','strReference','strService','strStatus']);
  await objPage.getByRole('button',{name:'Hide data copy',exact:true}).click();
  await expect(elCopy).toBeHidden();await expect(elCopy).toHaveValue('');
  await expect(objPage.getByRole('button',{name:'Show limited data copy',exact:true})).toBeFocused();
});

test('employee and expired sessions cannot expose privacy controls; late responses cannot restore cleared data',async({page:objPage,request:objRequest})=>{
  await openPrivacy(objPage,objRequest,'employee');
  await expect(objPage.getByRole('option',{name:'Customer privacy review',exact:true})).toHaveCount(0);
  const strReference=new URL(objPage.url()).pathname.split('/').at(-1);
  await objPage.goto(`/staff/privacy/${strReference}`);await expect(objPage.getByRole('heading',{name:'Privacy review is unavailable.'})).toBeVisible();
  await objRequest.get('/__test/reset');await objPage.context().clearCookies();await openPrivacy(objPage,objRequest);
  await objPage.getByLabel('I verified the requester and reviewed this order.').check();
  let fnRelease;const pRelease=new Promise(fnResolve=>{fnRelease=fnResolve;});let fnArrived;const pArrived=new Promise(fnResolve=>{fnArrived=fnResolve;});
  await objPage.route('**/api/staff/privacy/*/copy',async objRoute=>{const objResponse=await objRoute.fetch();fnArrived();await pRelease;await objRoute.fulfill({response:objResponse});});
  await objPage.getByRole('button',{name:'Show limited data copy',exact:true}).click();await pArrived;
  await objPage.evaluate(()=>window.dispatchEvent(new Event('staff-session-unavailable')));fnRelease();
  await expect(objPage.locator('#privacy-content')).toBeEmpty();await expect(objPage.getByRole('link',{name:'Sign in again',exact:true})).toBeVisible();
  await objPage.unrouteAll({behavior:'wait'});
  await objPage.reload();await objRequest.get('/__test/expire');
  await objPage.getByLabel('I verified the requester and reviewed this order.').check();
  await objPage.getByRole('button',{name:'Show limited data copy',exact:true}).click();
  await expect(objPage.locator('#privacy-content')).toBeEmpty();await expect(objPage.getByRole('alert')).toBeVisible();
});

test('uncertain correction preserves inputs and reload checks the committed result before retry',async({page:objPage,request:objRequest})=>{
  await openPrivacy(objPage,objRequest,'owner');
  await objPage.getByLabel('I verified the requester and reviewed this order.').check();
  await objPage.getByLabel('Customer name',{exact:true}).fill('Synthetic Confirmed After Interrupt');
  await objPage.route('**/api/staff/privacy/*/correct',async objRoute=>{await objRoute.fetch();await objRoute.abort();});
  await objPage.getByRole('button',{name:'Save contact correction',exact:true}).click();
  await expect(objPage.getByRole('alert')).toContainText('result could not be confirmed');
  await expect(objPage.getByLabel('Customer name',{exact:true})).toHaveValue('Synthetic Confirmed After Interrupt');
  await objPage.unrouteAll();await objPage.reload();await expect(objPage.getByLabel('Customer name',{exact:true})).toHaveValue('Synthetic Confirmed After Interrupt');
});

for(const strTheme of ['Light','Dark'])test(`privacy visual ${strTheme}: keyboard, reflow and limited copy`,async({page:objPage,request:objRequest})=>{
  await openPrivacy(objPage,objRequest);await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();
  await settleControls(objPage);
  // Explicit keyboard controls and native form semantics; no forced clicks.
  await objPage.getByLabel('I verified the requester and reviewed this order.').focus();await objPage.keyboard.press('Space');
  await expect(objPage.getByLabel('I verified the requester and reviewed this order.')).toBeChecked();
  expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await expect(objPage).toHaveScreenshot(`privacy-form-${strTheme}.png`,{fullPage:true,animations:'disabled'});
  await objPage.getByRole('button',{name:'Show limited data copy',exact:true}).click();
  await expect(objPage.getByLabel('Limited order data copy',{exact:true})).toBeVisible();
  // Only the opaque reference value is normalized; genuine contact/item text remains visible.
  await objPage.getByLabel('Limited order data copy',{exact:true}).evaluate(elInput=>{
    const objValue=JSON.parse(elInput.value);objValue.strReference='00000000-0000-4000-8000-000000000000';
    elInput.value=JSON.stringify(objValue,null,2);
    // A readonly copy must be captured from its first line, not an inherited caret offset.
    elInput.setSelectionRange(0,0);elInput.blur();elInput.scrollTop=0;elInput.scrollLeft=0;
  });
  await settleControls(objPage);
  expect(await objPage.getByLabel('Limited order data copy',{exact:true}).evaluate(elInput=>elInput.scrollTop)).toBe(0);
  expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await expect(objPage).toHaveScreenshot(`privacy-copy-${strTheme}.png`,{fullPage:true,animations:'disabled'});
  const intOriginalWidth=objPage.viewportSize().width;
  await objPage.setViewportSize({width:320,height:1000});
  expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await objPage.setViewportSize({width:intOriginalWidth,height:1000});
});
