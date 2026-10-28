import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function signIn(objPage,objRequest,bAdmin=true){await objPage.goto('/staff/sign-in');await objPage.getByLabel('Username',{exact:true}).fill(bAdmin?'owner':'employee');await objPage.getByLabel('Password',{exact:true}).fill('Synthetic staff browser passphrase only');await objPage.getByRole('button',{name:'Sign in',exact:true}).click();if(bAdmin){await objPage.getByLabel('Authenticator code',{exact:true}).fill(await(await objRequest.get('/__test/code?secret=owner')).text());await objPage.getByRole('button',{name:'Verify and sign in',exact:true}).click();}await expect(objPage).toHaveURL(/\/staff\/account$/);}
test.beforeEach(async({request:objRequest})=>{await objRequest.get('/__test/reset');});
test('owner navigation, keyboard date filters and invalid-range recovery use actual reports',async({page:objPage,request:objRequest})=>{
  await signIn(objPage,objRequest);await objPage.getByRole('link',{name:'Sales & analytics',exact:true}).click();await expect(objPage.getByRole('heading',{name:'Sales, clearly served.',exact:true})).toBeVisible();
  await objPage.getByLabel('From date',{exact:true}).fill('2026-10-21');await objPage.getByLabel('Through date',{exact:true}).fill('2026-10-21');await objPage.getByRole('button',{name:'Update report',exact:true}).focus();await objPage.keyboard.press('Enter');await expect(objPage.locator('.analytics-table--items')).toContainText('Medium pizza');await expect(objPage.getByRole('definition').filter({hasText:'$27.00'})).toHaveCount(2);
  await objPage.getByLabel('From date',{exact:true}).fill('2026-10-23');await objPage.getByRole('button',{name:'Update report',exact:true}).click();await expect(objPage.getByRole('alert')).toContainText('valid date range');await expect(objPage.getByLabel('From date',{exact:true})).toHaveValue('2026-10-23');await expect(objPage.locator('.analytics-table--items')).toHaveCount(0);
});
test('employees and expired sessions cannot retain or reload the owner report',async({page:objPage,request:objRequest})=>{
  await objPage.goto('/staff/analytics?from=2026-10-21&to=2026-10-21');await expect(objPage.getByRole('heading',{name:'Manager or Owner access required.',exact:true})).toBeVisible();await signIn(objPage,objRequest,false);await objPage.getByRole('link',{name:'Order queue',exact:true}).click();await expect(objPage.getByRole('link',{name:'Sales & analytics',exact:true})).toHaveCount(0);expect((await objPage.request.get('/api/staff/analytics?from=2026-10-21&to=2026-10-21')).status()).toBe(403);
  await signIn(objPage,objRequest);await objPage.goto('/staff/analytics?from=2026-10-21&to=2026-10-21');await expect(objPage.locator('.analytics-table--items')).toBeVisible();await objRequest.get('/__test/expire');await objPage.reload();await expect(objPage.getByRole('heading',{name:'Manager or Owner access required.',exact:true})).toBeVisible();await expect(objPage.locator('.analytics-table--items')).toHaveCount(0);
});
for(const strMode of ['populated','empty'])test(`analytics ${strMode} visual, accessibility and narrow reflow`,async({page:objPage,request:objRequest})=>{
  await signIn(objPage,objRequest);const strDate=strMode==='populated'?'2026-10-21':'2026-10-22';await objPage.goto(`/staff/analytics?from=${strDate}&to=${strDate}`);await expect(objPage.getByRole('heading',{name:'Sales, clearly served.',exact:true})).toBeVisible();
  for(const strTheme of ['Light','Dark']){await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();await expect.poll(()=>objPage.evaluate(()=>document.getAnimations().filter((objAnimation)=>objAnimation.playState==='running').length)).toBe(0);expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);await objPage.screenshot({path:test.info().outputPath(`analytics-${strMode}-${strTheme}.png`),fullPage:true});await expect.soft(objPage).toHaveScreenshot(`analytics-${strMode}-${strTheme}.png`,{fullPage:true});}
  await objPage.setViewportSize({width:320,height:900});expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test.describe('FE-06 reporting trends and shortcuts',()=>{
  test.use({timezoneId:'Pacific/Honolulu'});

  test('Central date shortcuts and custom error recovery work without dashboard JavaScript',async({page:objPage,request:objRequest,browser:objBrowser,baseURL:strBaseURL})=>{
    await signIn(objPage,objRequest);
    const objContext=await objBrowser.newContext({baseURL:strBaseURL,ignoreHTTPSErrors:true,javaScriptEnabled:false,timezoneId:'Pacific/Honolulu',viewport:objPage.viewportSize(),storageState:await objPage.context().storageState()});
    try{
      const objReportPage=await objContext.newPage();await objReportPage.goto('/staff/analytics');
      const objShortcuts=objReportPage.getByRole('navigation',{name:'Reporting date shortcuts',exact:true});
      await expect(objShortcuts.getByRole('link',{name:'Today',exact:true})).toHaveAttribute('aria-current','page');
      await expect(objReportPage.getByLabel('From date',{exact:true})).toHaveValue('2026-10-21');
      await objShortcuts.getByRole('link',{name:'Last 7 Days',exact:true}).focus();await objReportPage.keyboard.press('Enter');
      await expect(objReportPage.getByLabel('From date',{exact:true})).toHaveValue('2026-10-15');
      await expect(objReportPage.getByLabel('Through date',{exact:true})).toHaveValue('2026-10-21');
      await objShortcuts.getByRole('link',{name:'Last 30 Days',exact:true}).click();
      await expect(objReportPage.getByLabel('From date',{exact:true})).toHaveValue('2026-09-22');
      await objReportPage.getByLabel('From date',{exact:true}).fill('2026-10-23');
      await objReportPage.getByRole('button',{name:'Update report',exact:true}).click();
      await expect(objReportPage.getByRole('alert')).toContainText('valid date range');
      await expect(objReportPage.getByLabel('From date',{exact:true})).toHaveValue('2026-10-23');
      await expect(objReportPage.locator('.analytics-table')).toHaveCount(0);
      await objShortcuts.getByRole('link',{name:'Today',exact:true}).click();
      await expect(objReportPage.getByRole('table',{name:'Promised pickup date in America/Chicago',exact:true})).toBeVisible();
    }finally{await objContext.close();}
  });

  test('genuine completed collections and coverage appear beside date and weekday trends',async({page:objPage,request:objRequest})=>{
    await signIn(objPage,objRequest);
    const objQueue=await(await objPage.request.get('/api/staff/orders')).json();
    const objOrder=objQueue.arrOrders.find(objCandidate=>objCandidate.strCustomerName==='Synthetic Guest 2');
    const strApi=`/api/staff/orders/${objOrder.strReference}`;
    let intRevision=(await(await objPage.request.get(strApi)).json()).intRevision;
    const objCsrf=await(await objPage.request.get('/api/staff/orders/csrf')).json();
    for(const strStatus of ['Preparing','Baking','Ready','Completed']){
      const objResponse=await objPage.request.post(`${strApi}/progress`,{headers:{Origin:'https://localhost:3444','X-CSRF-Token':objCsrf.strCsrfToken},data:{intRevision,strStatus}});
      expect(objResponse.status()).toBe(200);intRevision=(await objResponse.json()).intRevision;
    }
    await objPage.goto('/staff/analytics?from=2026-10-21&to=2026-10-21');
    await expect(objPage.locator('#analytics-completed')).toHaveText('1');
    await expect(objPage.locator('#analytics-on-time')).toContainText('100.0%');
    await expect(objPage.locator('#analytics-on-time')).toContainText('1 of 1 orders with recorded ready times');
    await expect(objPage.getByText(/2 non-cancelled pickup orders have no ready time/)).toBeVisible();
    await expect(objPage.getByRole('table',{name:'Promised pickup date in America/Chicago',exact:true}).locator('tbody tr').locator('th,td')).toHaveText(['2026-10-21','3','0','0']);
    await expect(objPage.getByRole('table',{name:'Promised pickup weekday in America/Chicago',exact:true}).locator('tbody tr').locator('th,td')).toHaveText(['Wednesday','3','0','0']);
    await objPage.setViewportSize({width:320,height:900});
    for(const strTheme of ['Light','Dark']){
      await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();
      await expect.poll(()=>objPage.evaluate(()=>document.getAnimations().filter(objAnimation=>objAnimation.playState==='running').length)).toBe(0);
      expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
      expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    await objPage.goto('/staff/analytics?from=2026-10-22&to=2026-10-22');
    await expect(objPage.locator('#analytics-completed')).toHaveText('0');
    await expect(objPage.locator('#analytics-on-time')).toContainText('Not available');
    await expect(objPage.locator('.analytics-table--pickup')).toHaveCount(0);
    await expect(objPage.getByText('No promised pickup times in this date range.',{exact:true})).toBeVisible();
  });
});
