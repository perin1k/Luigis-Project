import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const PASSWORD='Synthetic staff browser passphrase only';
async function signIn(objPage,objRequest,strUser){
 await objPage.goto('/staff/sign-in');await objPage.getByLabel('Username',{exact:true}).fill(strUser);await objPage.getByLabel('Password',{exact:true}).fill(PASSWORD);await objPage.getByRole('button',{name:'Sign in',exact:true}).click();
 if(strUser!=='employee'){await objPage.getByLabel('Authenticator code',{exact:true}).fill(await(await objRequest.get('/__test/code'+(strUser==='owner'?'?secret=owner':''))).text());await objPage.getByRole('button',{name:'Verify and sign in',exact:true}).click();}
 await expect(objPage).toHaveURL(/\/staff\/account$/);
}
async function post(objPage,strPath,objBody){const objCsrf=await(await objPage.request.get('/auth/csrf')).json();return objPage.request.post('/auth'+strPath,{headers:{Origin:'https://localhost:3443','X-CSRF-Token':objCsrf.strCsrfToken},data:objBody});}
test.beforeEach(async({request:objRequest})=>{await objRequest.get('/__test/reset');});
test('owner promotes employee, mandatory first MFA enrollment then grants only manager access',async({page:objPage,request:objRequest})=>{
 await signIn(objPage,objRequest,'owner');await expect(objPage.getByRole('group',{name:'Account role',exact:true})).toBeVisible();
 objPage.on('dialog',objDialog=>objDialog.accept());await objPage.getByRole('button',{name:'Promote to Admin: employee',exact:true}).click();await expect(objPage.locator('#staff-status')).toContainText('Account updated');
 await objPage.getByRole('button',{name:'Sign out',exact:true}).click();
 await objPage.getByLabel('Username',{exact:true}).fill('employee');await objPage.getByLabel('Password',{exact:true}).fill(PASSWORD);await objPage.getByRole('button',{name:'Sign in',exact:true}).click();await expect(objPage.locator('#staff-status')).toContainText('Unable to complete');
 await objPage.goto('/staff/recovery');await objPage.getByText('First administrator authenticator setup',{exact:true}).click();
 await objPage.getByLabel('Setup username',{exact:true}).fill('employee');await objPage.getByLabel('Setup password',{exact:true}).fill(PASSWORD);await objPage.getByRole('button',{name:'Begin first authenticator setup',exact:true}).click();await expect(objPage.locator('#setup-key')).toBeVisible();
 await expect(objPage.getByRole('img',{name:'Private authenticator setup QR code'})).toBeVisible();
 const strSecret=await objPage.locator('#setup-key').inputValue();await objPage.getByLabel('New authenticator code',{exact:true}).fill(await(await objRequest.get('/__test/code?secret='+encodeURIComponent(strSecret))).text());await objPage.getByRole('button',{name:'Confirm replacement',exact:true}).click();await expect(objPage.locator('#codes-text')).toBeVisible();
 expect(await objPage.locator('#authenticator-qr').evaluate(elCanvas=>elCanvas.width===0&&elCanvas.height===0)).toBe(true);
 await objPage.goto('/staff/sign-in');await objPage.getByLabel('Username',{exact:true}).fill('employee');await objPage.getByLabel('Password',{exact:true}).fill(PASSWORD);await objPage.getByRole('button',{name:'Sign in',exact:true}).click();
 await objPage.getByLabel('Authenticator code',{exact:true}).fill(await(await objRequest.get('/__test/code?secret='+encodeURIComponent(strSecret))).text());await objPage.getByRole('button',{name:'Verify and sign in',exact:true}).click();await expect(objPage).toHaveURL(/\/staff\/account$/);
 expect((await objPage.request.get('/auth/session')).ok()).toBe(true);await expect(objPage.getByRole('group',{name:'Account role',exact:true})).toHaveCount(0);
});
test('admin invites employees only and cannot see or modify admin accounts',async({page:objPage,request:objRequest})=>{
 await signIn(objPage,objRequest,'admin');await expect(objPage.getByRole('group',{name:'Account role',exact:true})).toHaveCount(0);await expect(objPage.getByRole('button',{name:/Promote to Admin/})).toHaveCount(0);
 expect((await post(objPage,'/employees/invitations',{strUsername:'forged.admin',strRole:'admin'})).status()).toBe(403);
 expect((await post(objPage,'/staff/update',{strUserId:'owner',strRevision:'1',strField:'state',strValue:'disabled'})).status()).toBe(403);
 await objPage.getByLabel('Employee username',{exact:true}).fill('new.employee');await objPage.getByRole('button',{name:'Create invitation',exact:true}).click();await expect(objPage.locator('#invitation-token')).toBeVisible();
});
test('deactivation removes access; reactivation requires a new sign-in and stale writes fail',async({page:objPage,request:objRequest,browser:objBrowser})=>{
 const objEmployeeContext=await objBrowser.newContext({ignoreHTTPSErrors:true});const objEmployeePage=await objEmployeeContext.newPage();try{
 await signIn(objEmployeePage,objRequest,'employee');await signIn(objPage,objRequest,'owner');objPage.on('dialog',objDialog=>objDialog.accept());
 const objList=await(await objPage.request.get('/auth/employees')).json();const objEmployee=objList.arrEmployees.find(objRow=>objRow.strUsername==='employee');
 await objPage.getByRole('button',{name:'Deactivate employee',exact:true}).click();await expect(objPage.getByRole('button',{name:'Reactivate employee',exact:true})).toBeVisible();expect((await objEmployeePage.request.get('/auth/session')).status()).toBe(401);
 expect((await post(objPage,'/staff/update',{strUserId:objEmployee.strUserId,strRevision:String(objEmployee.intRevision),strField:'state',strValue:'active'})).status()).toBe(403);
 await objPage.getByRole('button',{name:'Reactivate employee',exact:true}).click();await expect(objPage.getByRole('button',{name:'Deactivate employee',exact:true})).toBeVisible();expect((await objEmployeePage.request.get('/auth/session')).status()).toBe(401);await signIn(objEmployeePage,objRequest,'employee');
 }finally{await objEmployeeContext.close();}
});
test('owner role choices respect CSP without browser errors in both themes',async({page:objPage,request:objRequest})=>{
 const arrBrowserErrors=[];
 objPage.on('console',objMessage=>{if(objMessage.type()==='error')arrBrowserErrors.push(objMessage.text());});
 objPage.on('pageerror',objError=>arrBrowserErrors.push(objError.message));
 await signIn(objPage,objRequest,'owner');
 // Keep this runtime check separate from axe, which injects diagnostic styles.
 for(const strTheme of ['Light','Dark']){
  await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();
  await expect.poll(()=>objPage.evaluate(()=>document.getAnimations().filter(objAnimation=>objAnimation.playState==='running').length)).toBe(0);
  await objPage.getByRole('radio',{name:'Employee',exact:true}).focus();
  await objPage.keyboard.press('ArrowRight');
  await expect(objPage.getByRole('radio',{name:'Admin',exact:true})).toBeChecked();
  expect(await objPage.locator('form[data-result="invited"]').evaluate(elForm=>new FormData(elForm).get('strRole'))).toBe('admin');
  await objPage.keyboard.press('ArrowLeft');
  await expect(objPage.getByRole('radio',{name:'Employee',exact:true})).toBeChecked();
  expect(arrBrowserErrors).toEqual([]);
 }
});
test('owner account visual, keyboard, accessibility and narrow reflow in both themes',async({page:objPage,request:objRequest})=>{
 await signIn(objPage,objRequest,'owner');
 for(const strTheme of ['Light','Dark']){
  await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();
  await expect.poll(()=>objPage.evaluate(()=>document.getAnimations().filter(objAnimation=>objAnimation.playState==='running').length)).toBe(0);
  expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await expect(objPage).toHaveScreenshot('owner-account-'+strTheme+'.png',{fullPage:true});
 }
 await objPage.setViewportSize({width:320,height:900});expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await objPage.getByRole('button',{name:'Promote to Admin: employee',exact:true}).focus();await expect(objPage.getByRole('button',{name:'Promote to Admin: employee',exact:true})).toBeFocused();
});
