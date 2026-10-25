import {test,expect} from '@playwright/test';

test('top and bottom payment controls reconcile one uncertain payment without reopening editing', async ({page:objPage,request:objRequest}) => {
  await objRequest.get('/__test/reset');
  const arrPaymentIds=[];
  objPage.on('request', objRequest => {
    if(objRequest.url().endsWith('/api/demo-payments')) arrPaymentIds.push(objRequest.postDataJSON().strRequestId);
  });
  await objPage.goto('/order');
  await objPage.locator('#next-button-top').click();
  await objPage.getByRole('button',{name:'Add pizza',exact:true}).click();
  await objPage.locator('#next-button-top').click();
  await objPage.locator('#next-button-top').click();
  await objPage.getByLabel('Your name').fill('Synthetic Retry Review');
  await objPage.getByLabel('Phone number').fill('2025550100');
  await objPage.locator('#next-button-top').click();
  await expect(objPage.locator('#pickup-status')).toContainText('Choose a ready time');
  await objPage.getByLabel('Pickup or dine-in ready time').selectOption('0');
  await objPage.locator('#next-button-top').click();
  await objRequest.get('/__test/ambiguous-next');
  await objPage.locator('#next-button-top').click();
  await expect(objPage.locator('#form-error')).toContainText('Keep this page open');
  for(const strSuffix of ['', '-top']) {
    await expect(objPage.locator('#back-button'+strSuffix)).toBeDisabled();
    await expect(objPage.locator('#next-button'+strSuffix)).toHaveText('Check demo payment result');
  }
  await expect(objPage.getByRole('button',{name:'Edit order review',exact:true})).toBeDisabled();
  await objPage.locator('#next-button').click();
  await expect(objPage.locator('#demo-receipt')).toBeVisible();
  expect(arrPaymentIds).toHaveLength(2);
  expect(arrPaymentIds[0]).toBe(arrPaymentIds[1]);
  expect((await(await objRequest.get('/__test/count')).json()).intPayments).toBe(1);
});
