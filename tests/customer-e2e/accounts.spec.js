import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const PASSWORD='Invented customer browser passphrase only';
test.beforeEach(async({request:objRequest})=>{await objRequest.get('/__test/reset-integrated');});
async function register(objPage,strUser='browser.customer'){
  await objPage.goto('/account/register');await objPage.getByLabel('Username',{exact:true}).fill(strUser);
  await objPage.getByLabel('Password',{exact:true}).fill(PASSWORD);await objPage.getByRole('button',{name:'Create customer account',exact:true}).click();
  await expect(objPage.getByRole('heading',{name:'Your customer account',exact:true})).toBeVisible();
  return (await objPage.getByLabel('Private customer recovery codes').inputValue()).split('\n');
}
test('register, save profile, buy an associated order and keep other accounts/staff isolated',async({page:objPage,browser:objBrowser,baseURL:strOrigin})=>{
  await register(objPage);await objPage.getByRole('button',{name:'I saved my codes — hide them'}).click();
  await expect(objPage.getByLabel('Private customer recovery codes')).toHaveCount(0);
  await objPage.getByLabel('Your name (optional)',{exact:true}).fill('Synthetic Account Guest');await objPage.getByLabel('Phone number (optional)',{exact:true}).fill('2025550100');
  await objPage.getByRole('button',{name:'Save contact details',exact:true}).click();await expect(objPage.getByRole('status')).toContainText('saved');
  expect((await objPage.request.get('/api/staff/orders')).status()).toBe(401);
  await objPage.goto('/order');await objPage.getByRole('button',{name:'Continue',exact:true}).click();await objPage.getByRole('button',{name:'Add pizza',exact:true}).click();
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();await objPage.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(objPage.getByLabel('Your name',{exact:true})).toHaveValue('Synthetic Account Guest');
  await expect(objPage.getByLabel('Phone number',{exact:true})).toHaveValue('2025550100');
  await objPage.getByRole('button',{name:'Continue',exact:true}).click();await expect(objPage.locator('#pickup-status')).toContainText('Choose a ready time');
  await objPage.getByLabel('Pickup or dine-in ready time').selectOption('0');await objPage.getByRole('button',{name:'Continue to payment',exact:true}).click();
  await objPage.getByRole('button',{name:'Confirm demo payment',exact:true}).click();await expect(objPage.locator('#demo-receipt')).toBeVisible();
  await objPage.goto('/account');await expect(objPage.getByRole('heading',{level:3})).toHaveCount(1);await expect(objPage.getByText('Status:',{exact:false})).toContainText('Received');
  const objOther=await objBrowser.newContext({baseURL:strOrigin,ignoreHTTPSErrors:true});
  try{const objOtherPage=await objOther.newPage();await register(objOtherPage,'other.customer');await expect(objOtherPage.getByText('No eligible orders yet.',{exact:false})).toBeVisible();}finally{await objOther.close();}
});
test('customer recovery rotates codes and invalidates sessions; deletion requires password',async({page:objPage,browser:objBrowser,baseURL:strOrigin})=>{
  const arrCodes=await register(objPage);const objOther=await objBrowser.newContext({baseURL:strOrigin,ignoreHTTPSErrors:true});
  try{
    const objRecover=await objOther.newPage();await objRecover.goto('/account/recover');await objRecover.getByLabel('Username',{exact:true}).fill('browser.customer');
    await objRecover.getByLabel('Unused customer recovery code').fill(arrCodes[0]);await objRecover.getByLabel('New password',{exact:true}).fill(PASSWORD+' changed');
    await objRecover.getByRole('button',{name:'Reset password and replace codes'}).click();await expect(objRecover.getByLabel('Private customer recovery codes')).toBeVisible();
    await objPage.goto('/account');await expect(objPage).toHaveURL(/\/account\/sign-in$/);
    await objPage.getByLabel('Username',{exact:true}).fill('browser.customer');await objPage.getByLabel('Password',{exact:true}).fill(PASSWORD+' changed');await objPage.getByRole('button',{name:'Sign in',exact:true}).click();
    await objPage.getByLabel('Current password to confirm deletion').fill('wrong');await objPage.getByRole('button',{name:'Delete account permanently'}).click();await expect(objPage.getByRole('alert')).toContainText('not accepted');
    await objPage.getByLabel('Current password to confirm deletion').fill(PASSWORD+' changed');await objPage.getByRole('button',{name:'Delete account permanently'}).click();await expect(objPage.getByRole('status')).toContainText('deleted');
  }finally{await objOther.close();}
});
test('native forms, CSRF, cookies, accessibility and narrow-screen themes',async({page:objPage,context:objContext})=>{
  await objPage.goto('/account/register');
  expect((await objPage.request.post('/account/register',{headers:{Origin:'https://localhost:3444'},form:{strUsername:'forged.customer',strPassword:PASSWORD}})).status()).toBe(403);
  const objResponse=await objPage.goto('/account/register');expect(objResponse.headers()['cache-control']).toBe('no-store');expect(objResponse.headers()['x-robots-tag']).toContain('noindex');
  await register(objPage);const arrCookies=await objContext.cookies();const objCookie=arrCookies.find(objItem=>objItem.name==='__Host-luigis-customer');
  expect(objCookie.secure).toBe(true);expect(objCookie.httpOnly).toBe(true);expect(objCookie.sameSite).toBe('Strict');expect(arrCookies.some(objItem=>objItem.name==='__Host-luigis-session')).toBe(false);
  await objPage.getByRole('button',{name:'I saved my codes — hide them'}).click();
  for(const strTheme of ['light','dark']){
    await objPage.locator(`label[for="appearance-${strTheme}"]`).click();
    await expect(objPage.locator('html')).toHaveAttribute('data-bs-theme',strTheme);
    // Wait for the approved brick/cream palette before auditing contrast. These
    // exact colors replace the superseded purple palette, not the axe assertions.
    await expect(objPage.getByRole('button',{name:'Sign out',exact:true})).toHaveCSS('color',strTheme==='dark'?'rgb(248, 236, 216)':'rgb(48, 37, 31)');
    const objResults=await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();expect(objResults.violations).toEqual([]);
    await objPage.setViewportSize({width:320,height:800});expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
});
test('account forms work without JavaScript and wrong-origin requests fail closed',async({browser:objBrowser,baseURL:strOrigin})=>{
  const objContext=await objBrowser.newContext({baseURL:strOrigin,ignoreHTTPSErrors:true,javaScriptEnabled:false});
  try{
    const objPage=await objContext.newPage();
    expect((await objPage.request.get('/account/register',{headers:{Origin:'https://outside.example'}})).status()).toBe(403);
    await register(objPage,'native.customer');
    await objPage.getByRole('button',{name:'Sign out',exact:true}).click();await expect(objPage).toHaveURL(/\/account\/sign-in$/);
    await objPage.goto('/account');await expect(objPage).toHaveURL(/\/account\/sign-in$/);
    await objPage.getByLabel('Username',{exact:true}).fill('native.customer');await objPage.getByLabel('Password',{exact:true}).fill(PASSWORD);
    await objPage.getByRole('button',{name:'Sign in',exact:true}).click();await expect(objPage.getByRole('heading',{name:'Your customer account',exact:true})).toBeVisible();
  }finally{await objContext.close();}
});
