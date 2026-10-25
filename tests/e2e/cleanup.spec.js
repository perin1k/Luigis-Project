import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('top navigation shares validation, focus and back behavior with bottom controls', async ({page: objPage}) => {
  await objPage.goto('/order');
  await expect(objPage.locator('#back-button-top')).toBeHidden();
  await objPage.locator('#next-button-top').click();
  await expect(objPage.locator('#pizza-title')).toBeFocused();
  await objPage.locator('#next-button-top').click();
  await expect(objPage.getByRole('alert')).toContainText('Add at least one pizza');
  await objPage.getByRole('button', {name:'Add pizza', exact:true}).click();
  await objPage.locator('#next-button').click();
  await expect(objPage.locator('#drinks-title')).toBeFocused();
  await objPage.locator('#back-button-top').click();
  await expect(objPage.locator('#pizza-title')).toBeFocused();
  await expect(objPage.getByLabel('Order summary')).toContainText('Medium');
});

test('drink sizes open on demand and preserve selected quantities when collapsed', async ({page: objPage}) => {
  await objPage.goto('/order');
  await objPage.locator('#next-button').click();
  await objPage.getByRole('button', {name:'Add pizza', exact:true}).click();
  await objPage.locator('#next-button').click();
  await expect(objPage.locator('.drink-group')).toHaveCount(6);
  const elDrink = objPage.locator('.drink-group').filter({has:objPage.locator('summary', {hasText:/^Sweet iced tea/})});
  await expect(elDrink.getByLabel('Large sweet iced tea quantity')).toBeHidden();
  await elDrink.locator('summary').click();
  await elDrink.getByLabel('Large sweet iced tea quantity').fill('2');
  await expect(objPage.getByLabel('Order summary')).toContainText('Sweet iced tea');
  await elDrink.locator('summary').click();
  await expect(elDrink.locator('summary')).toContainText('2 selected');
  await objPage.locator('#next-button-top').click();
  await objPage.locator('#back-button-top').click();
  await elDrink.locator('summary').click();
  await expect(elDrink.getByLabel('Large sweet iced tea quantity')).toHaveValue('2');
  await expect(objPage.getByLabel('Order summary')).toContainText('$13.00');
  const objAxe = await new AxeBuilder({page:objPage}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(objAxe.violations).toEqual([]);
  await elDrink.getByRole('button', {name:'Remove Sweet iced tea from order',exact:true}).click();
  await expect(elDrink.locator('summary')).toBeFocused();
  await expect(objPage.getByLabel('Order summary')).toContainText('$7.00');
  await expect(elDrink.locator('summary')).not.toContainText('selected');
});

test('dedicated menu exposes approved choices, original identity and account navigation without JavaScript', async ({browser: objBrowser}) => {
  const objContext = await objBrowser.newContext({javaScriptEnabled:false, viewport:{width:390,height:844}});
  try {
    const objPage = await objContext.newPage();
    await objPage.goto('/menu');
    await expect(objPage.getByRole('heading', {name:'The Luigi’s menu', exact:true})).toBeVisible();
    await expect(objPage.getByRole('table', {name:'Pizza sizes and prices'})).toContainText('$5.00');
    await expect(objPage.getByRole('list', {name:'Fountain drink choices'}).getByRole('listitem')).toHaveCount(6);
    await expect(objPage.getByRole('list', {name:'Pizza toppings'}).locator('svg')).toHaveCount(0);
    await expect(objPage.locator('.brand-mark')).toBeVisible();
    await expect(objPage.getByRole('link', {name:'My account', exact:true})).toHaveAttribute('href','/account');
    await expect(objPage.getByRole('link', {name:'Staff sign-in', exact:true})).toHaveAttribute('href','/staff/sign-in');
    expect(await objPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {await objContext.close();}
});

test('leaving an active order warns before discarding it without saving contact data in storage', async ({page: objPage}) => {
  await objPage.goto('/order');
  await objPage.locator('#next-button').click();
  await objPage.getByRole('button', {name:'Add pizza',exact:true}).click();
  const pDialog = objPage.waitForEvent('dialog');
  const pNavigation = objPage.getByRole('link', {name:'Our menu',exact:true}).click({noWaitAfter:true});
  const objDialog = await pDialog;
  expect(objDialog.type()).toBe('beforeunload');
  await objDialog.dismiss();
  await pNavigation;
  await expect(objPage).toHaveURL(/\/order$/);
  await expect(objPage.getByLabel('Order summary')).toContainText('Medium');
  expect(await objPage.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});

test('cleanup visual home, menu and compact drink states in both themes', async ({page: objPage}) => {
  for (const strTheme of ['Light','Dark']) {
    await objPage.goto('/');
    await objPage.getByRole('group', {name:'Appearance',exact:true}).getByText(strTheme,{exact:true}).click();
    await expect(objPage).toHaveScreenshot(`cleanup-home-${strTheme}.png`, {fullPage:true,animations:'disabled'});
    await objPage.getByRole('link', {name:'Our menu',exact:true}).click();
    await expect(objPage).toHaveScreenshot(`cleanup-menu-${strTheme}.png`, {fullPage:true,animations:'disabled'});
    await objPage.goto('/order');
    await objPage.locator('#next-button-top').click();
    await objPage.getByRole('button', {name:'Add pizza',exact:true}).click();
    await objPage.locator('#next-button-top').click();
    await objPage.locator('summary').filter({hasText:/^Coca-Cola/}).click();
    await objPage.getByLabel('Medium Coca-Cola quantity').fill('1');
    await objPage.mouse.move(0,0);
    await expect(objPage).toHaveScreenshot(`cleanup-drinks-${strTheme}.png`, {fullPage:true,animations:'disabled'});
    objPage.once('dialog', objDialog => objDialog.accept());
  }
});
