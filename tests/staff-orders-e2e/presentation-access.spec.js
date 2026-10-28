import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async({request:objRequest})=>{await objRequest.get('/__test/reset');});

for(const strRole of ['owner','admin','employee']){
  test(`presentation dashboard and report permissions for ${strRole}`,async({page:objPage,request:objRequest},objInfo)=>{
    await objPage.goto('/staff/sign-in');
    await objPage.getByLabel('Username',{exact:true}).fill(strRole);
    await objPage.getByLabel('Password',{exact:true}).fill('Synthetic staff browser passphrase only');
    await objPage.getByRole('button',{name:'Sign in',exact:true}).click();
    if(strRole!=='employee'){
      await objPage.getByLabel('Authenticator code',{exact:true}).fill(await(await objRequest.get(`/__test/code${strRole==='owner'?'?secret=owner':''}`)).text());
      await objPage.getByRole('button',{name:'Verify and sign in',exact:true}).click();
    }
    await expect(objPage).toHaveURL(/\/staff\/account$/);
    const elNavigation=objPage.getByRole('navigation',{name:'Staff navigation',exact:true});
    await expect(elNavigation.getByRole('link',{name:'Order queue',exact:true})).toHaveClass(/btn-primary/);
    await expect(elNavigation.getByRole('link',{name:'Menu management',exact:true})).toHaveCount(strRole==='owner'?1:0);
    await expect(elNavigation.getByRole('link',{name:'Sales & analytics',exact:true})).toHaveCount(strRole==='employee'?0:1);
    for(const strTheme of ['Light','Dark']){
      await objPage.getByRole('group',{name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();
      await expect.poll(()=>objPage.evaluate(()=>document.getAnimations().filter(obj=>obj.playState==='running').length)).toBe(0);
      expect((await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
      // Synthetic screenshots stay in bounded internal review artifacts only.
      await objPage.screenshot({path:objInfo.outputPath(`dashboard-${strRole}-${strTheme}.png`),fullPage:true});
    }
    await objPage.setViewportSize({width:320,height:900});
    expect(await objPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(strRole!=='employee'){
      const elSales=elNavigation.getByRole('link',{name:'Sales & analytics',exact:true});
      await elSales.focus();await expect(elSales).toBeFocused();await objPage.keyboard.press('Enter');
      await expect(objPage.getByRole('heading',{name:'Sales, clearly served.',exact:true})).toBeVisible();
      await expect(objPage.getByRole('button',{name:'Update report',exact:true})).toBeVisible();
      expect((await objPage.request.get('/api/staff/analytics?from=2026-10-21&to=2026-10-21')).status()).toBe(200);
      // Report controls only read; they cannot publish prices or special hours.
      await objPage.goto('/staff/menu');
      await expect(objPage.getByRole('button',{name:'Publish reviewed prices',exact:true})).toHaveCount(strRole==='owner'?1:0);
    }else{
      await objPage.goto('/staff/analytics');
      await expect(objPage.getByRole('heading',{name:'Manager or Owner access required.',exact:true})).toBeVisible();
      expect((await objPage.request.get('/api/staff/analytics?from=2026-10-21&to=2026-10-21')).status()).toBe(403);
    }
  });
}
