import { configureMenu, SIZES, TOPPINGS, calculatePizzaPrice, calculateSubtotal, formatCurrency, validatePizzaAvailability } from './order-model.js';
import { openSecureCheckout } from '../checkout/payment.js';

let objCatalog = JSON.parse(document.querySelector('#order-app').dataset.catalog);
if (objCatalog) configureMenu(objCatalog);
let objPricing = null;
let bCheckingPrice = false;
const elForm = document.querySelector('#order-form');
const elNext = document.querySelector('#next-button');
const elBack = document.querySelector('#back-button');
const elError = document.querySelector('#form-error');
const elAdd = document.querySelector('#add-pizza');
const elCancel = document.querySelector('#cancel-edit');
const arrSections = [...document.querySelectorAll('[data-step]')];
const objOrder = { strService: 'carry-out', arrPizzas: [], arrDrinks: [], strName: '', strPhone: '' };
const elAvailability = document.querySelector('#ingredient-availability');
const objAvailability = {
  bKnown: elAvailability.dataset.known === 'true',
  arrUnavailableBases: elAvailability.dataset.bases.split(',').filter(Boolean),
  arrUnavailableToppings: elAvailability.dataset.toppings.split(',').filter(Boolean),
};
let intStep = 0;
let intEditingIndex = null;
let bOpeningPayment = false;

function createElement(strTag, strText, strClass = '') {
  const elElement = document.createElement(strTag);
  elElement.textContent = strText;
  if (strClass) elElement.className = strClass;
  return elElement;
}

function clearError() {
  elError.hidden = true;
  elError.textContent = '';
  for (const elInput of elForm.querySelectorAll('[aria-invalid]')) {
    elInput.removeAttribute('aria-invalid');
    const strDescription = (elInput.getAttribute('aria-describedby') ?? '')
      .split(' ').filter((strId) => strId && strId !== 'form-error').join(' ');
    if (strDescription) elInput.setAttribute('aria-describedby', strDescription);
    else elInput.removeAttribute('aria-describedby');
  }
}

function showError(strMessage, elTarget) {
  elError.textContent = strMessage;
  elError.hidden = false;
  if (elTarget) {
    elTarget.setAttribute('aria-invalid', 'true');
    elTarget.setAttribute('aria-describedby', `${elTarget.getAttribute('aria-describedby') ?? ''} form-error`.trim());
    elTarget.focus();
  }
}

function getPizzaDraft() {
  return {
    strSize: elForm.elements.size.value,
    strCrust: elForm.elements.crust.value,
    arrToppings: [...elForm.querySelectorAll('[name="topping"]:checked')].map((elInput) => elInput.value),
    intQuantity: Number(document.querySelector('#pizza-quantity').value),
  };
}

function updatePizzaPreview() {
  document.querySelector('#topping-price').textContent = `${formatCurrency(SIZES[elForm.elements.size.value].centsTopping)} per topping`;
  try {
    document.querySelector('#pizza-price').textContent = formatCurrency(calculatePizzaPrice(getPizzaDraft()));
  } catch {
    document.querySelector('#pizza-price').textContent = '—';
  }
}

function getPizzaDescription(objPizza) {
  const strSize = objPizza.strSize[0].toUpperCase() + objPizza.strSize.slice(1);
  const strCrust = objPizza.strCrust === 'new-york' ? 'New York-style' : 'Regular';
  const strToppings = objPizza.arrToppings.length
    ? objPizza.arrToppings.map((strId) => TOPPINGS[strId]).join(', ') : 'Marinara & cheese';
  return `${objPizza.intQuantity} × ${strSize} pizza · ${strCrust} · ${strToppings}`;
}

function getServiceLabel() {
  return objOrder.strService === 'carry-out' ? 'Carry-out' : 'Dine-in';
}

function createEditButton(strLabel, fnAction) {
  const elButton = createElement('button', strLabel, 'text-button');
  elButton.type = 'button';
  elButton.addEventListener('click', fnAction);
  return elButton;
}

function renderSummary(strAnnouncement = '') {
  const elItems = document.querySelector('#summary-items');
  elItems.replaceChildren();
  for (const objPizza of objOrder.arrPizzas) {
    const elItem = createElement('li', '');
    elItem.append(createElement('span', getPizzaDescription(objPizza)), createElement('strong', formatCurrency(calculatePizzaPrice(objPizza))));
    elItems.append(elItem);
  }
  for (const objDrink of objOrder.arrDrinks.filter((objItem) => objItem.intQuantity > 0)) {
    const elItem = createElement('li', '');
    elItem.append(createElement('span', `${objDrink.intQuantity} × ${objDrink.strSize} ${objDrink.strName}`),
      createElement('strong', formatCurrency(SIZES[objDrink.strSize].centsDrink * objDrink.intQuantity)));
    elItems.append(elItem);
  }
  if (!elItems.children.length) elItems.append(createElement('li', 'Your order is empty. Add a pizza to get started.', 'empty-cart'));
  const strSubtotal = formatCurrency(calculateSubtotal(objOrder));
  document.querySelector('#summary-total').textContent = strSubtotal;
  document.querySelector('#payment-subtotal').textContent = strSubtotal;
  document.querySelector('#summary-service').textContent = getServiceLabel();
  if (strAnnouncement) document.querySelector('#cart-status').textContent = `${strAnnouncement} Subtotal ${strSubtotal}.`;
}

function resetPizzaEditor() {
  intEditingIndex = null;
  elForm.elements.size.value = [...elForm.querySelectorAll('[name=size]')].find((elInput) => !elInput.disabled && elInput.value === 'medium')?.value
    ?? [...elForm.querySelectorAll('[name=size]')].find((elInput) => !elInput.disabled)?.value ?? 'medium';
  elForm.elements.crust.value = objAvailability.arrUnavailableBases.includes('regular') ? 'new-york' : 'regular';
  for (const elInput of elForm.querySelectorAll('[name="topping"]')) { elInput.checked = false; elInput.disabled = objAvailability.arrUnavailableToppings.includes(elInput.value); }
  document.querySelector('#pizza-quantity').value = '1';
  elAdd.textContent = 'Add pizza';
  elCancel.hidden = true;
  updatePizzaPreview();
}

function editPizza(intIndex) {
  intEditingIndex = intIndex;
  const objPizza = objOrder.arrPizzas[intIndex];
  elForm.elements.size.value = objPizza.strSize;
  elForm.elements.crust.value = objPizza.strCrust;
  for (const elInput of elForm.querySelectorAll('[name="topping"]')) {
    elInput.checked = objPizza.arrToppings.includes(elInput.value);
    elInput.disabled = objAvailability.arrUnavailableToppings.includes(elInput.value) && !elInput.checked;
  }
  document.querySelector('#pizza-quantity').value = String(objPizza.intQuantity);
  elAdd.textContent = 'Save pizza';
  elCancel.hidden = false;
  updatePizzaPreview();
  showStep(1);
}

function renderPizzaList() {
  const elList = document.querySelector('#pizza-list');
  elList.replaceChildren();
  if (objOrder.arrPizzas.length) elList.append(createElement('h3', 'Your pizzas'));
  objOrder.arrPizzas.forEach((objPizza, intIndex) => {
    const elItem = createElement('div', '', 'pizza-item');
    elItem.append(createElement('p', getPizzaDescription(objPizza)), createElement('strong', formatCurrency(calculatePizzaPrice(objPizza))));
    const elActions = createElement('div', '', 'item-actions');
    elActions.append(createEditButton(`Edit pizza ${intIndex + 1}`, () => editPizza(intIndex)),
      createEditButton(`Remove pizza ${intIndex + 1}`, () => {
        objOrder.arrPizzas.splice(intIndex, 1);
        resetPizzaEditor();
        renderPizzaList();
        renderSummary('Pizza removed.');
        elAdd.focus();
      }));
    elItem.append(elActions);
    elList.append(elItem);
  });
}

function renderReview() {
  const elReview = document.querySelector('#order-review');
  elReview.replaceChildren();
  const elService = createElement('div', '', 'review-block');
  elService.append(createElement('h3', 'Service'), createElement('p', getServiceLabel()), createEditButton('Edit service', () => showStep(0)));
  const elFood = createElement('div', '', 'review-block');
  elFood.append(createElement('h3', 'Pizza & drinks'));
  for (const objPizza of objOrder.arrPizzas) elFood.append(createElement('p', getPizzaDescription(objPizza)));
  for (const objDrink of objOrder.arrDrinks.filter((objItem) => objItem.intQuantity > 0)) {
    elFood.append(createElement('p', `${objDrink.intQuantity} × ${objDrink.strSize} ${objDrink.strName}`));
  }
  elFood.append(createEditButton('Edit pizzas', () => showStep(1)), createEditButton('Edit drinks', () => showStep(2)));
  const elContact = createElement('div', '', 'review-block');
  elContact.append(createElement('h3', 'Contact details'), createElement('p', objOrder.strName));
  if (objOrder.strService === 'carry-out') elContact.append(createElement('p', objOrder.strPhone));
  elContact.append(createEditButton('Edit contact details', () => showStep(3)));
  const elTotal = createElement('div', '', 'subtotal');
  elTotal.append(createElement('span', 'Subtotal'), createElement('strong', formatCurrency(calculateSubtotal(objOrder))));
  elReview.append(elService, elFood, elContact);
  if (!objCatalog) elReview.append(elTotal);
}

function updateContactFields() {
  const bCarryOut = objOrder.strService === 'carry-out';
  document.querySelector('#phone-field').hidden = !bCarryOut;
  document.querySelector('#customer-phone').required = bCarryOut;
  document.querySelector('#contact-intro').textContent = bCarryOut
    ? 'Who’s picking up? We’ll use your number if we need to reach you about your order.'
    : 'Who’s joining us? Your name helps us match you with your order.';
}

function updateNextButton() {
  elNext.textContent = intStep === 5
    ? (elForm.elements.payment.value === 'apple-pay' ? 'Continue with Apple Pay' : 'Continue to secure payment')
    : intStep === 4 ? 'Continue to payment' : 'Continue';
}

function showStep(intNextStep) {
  clearError();
  intStep = intNextStep;
  arrSections.forEach((elSection, intIndex) => { elSection.hidden = intIndex !== intStep; });
  document.querySelectorAll('[data-progress]').forEach((elProgress, intIndex) => {
    if (intIndex === intStep) elProgress.setAttribute('aria-current', 'step');
    else elProgress.removeAttribute('aria-current');
    elProgress.classList.toggle('step-completed', intIndex < intStep);
  });
  document.querySelector('#step-count').textContent = `Step ${intStep + 1} of 6`;
  elBack.hidden = intStep === 0;
  updateContactFields();
  if (intStep === 4) { renderReview(); if (objCatalog) void checkPrice(); }
  updateNextButton();
  arrSections[intStep].querySelector('h2').focus();
}

function validateCurrentStep() {
  if ((intStep === 1 && objAvailability.bKnown) || intStep === 5) {
    try {
      for (const objPizza of objOrder.arrPizzas) validatePizzaAvailability(objPizza, objAvailability);
    } catch (objError) { showError(objError.message); return false; }
  }
  if (intStep === 1 && intEditingIndex !== null) {
    showError('Save your pizza changes or cancel editing before continuing.', elAdd);
    return false;
  }
  if (intStep === 1 && !objOrder.arrPizzas.length) {
    showError('Add at least one pizza before continuing.', elAdd);
    return false;
  }
  if (intStep === 2) {
    for (const elInput of arrSections[2].querySelectorAll('input')) {
      if (!elInput.validity.valid || !Number.isSafeInteger(Number(elInput.value))) {
        showError('Enter a whole-number drink quantity of zero or more.', elInput);
        return false;
      }
    }
    try { calculateSubtotal(objOrder); } catch (objError) { showError(objError.message); return false; }
  }
  if (intStep === 3) {
    const elName = document.querySelector('#customer-name');
    const elPhone = document.querySelector('#customer-phone');
    objOrder.strName = elName.value.trim();
    objOrder.strPhone = elPhone.value.trim();
    if (!objOrder.strName) { showError('Please enter your name.', elName); return false; }
    if (objOrder.strService === 'carry-out' && !objOrder.strPhone) {
      showError('Please enter a phone number for carry-out.', elPhone);
      return false;
    }
  }
  return true;
}

elAdd.addEventListener('click', () => {
  clearError();
  const objPizza = getPizzaDraft();
  if (objAvailability.bKnown) {
    try { validatePizzaAvailability(objPizza, objAvailability); }
    catch (objError) { showError(objError.message, elAdd); return; }
  }
  try { calculatePizzaPrice(objPizza); } catch (objError) {
    showError(objError.message, document.querySelector('#pizza-quantity'));
    return;
  }
  const bEditing = intEditingIndex !== null;
  const arrPrevious = [...objOrder.arrPizzas];
  if (bEditing) objOrder.arrPizzas[intEditingIndex] = objPizza;
  else objOrder.arrPizzas.push(objPizza);
  try { calculateSubtotal(objOrder); } catch (objError) {
    objOrder.arrPizzas = arrPrevious;
    showError(objError.message, document.querySelector('#pizza-quantity'));
    return;
  }
  resetPizzaEditor();
  renderPizzaList();
  renderSummary(bEditing ? 'Pizza updated.' : 'Pizza added.');
  elAdd.focus();
});

elCancel.addEventListener('click', () => { clearError(); resetPizzaEditor(); elAdd.focus(); });
elBack.addEventListener('click', () => { if (!bOpeningPayment && !bCheckingPrice) showStep(intStep - 1); });

elForm.addEventListener('input', (objEvent) => {
  clearError();
  const elTarget = objEvent.target;
  if (elTarget.matches('[name="size"], [name="topping"], #pizza-quantity')) updatePizzaPreview();
  if (elTarget.matches('[name="service"]')) {
    objOrder.strService = elTarget.value;
    updateContactFields();
    renderSummary();
  }
  if (elTarget.name === 'topping' && !elTarget.checked && objAvailability.arrUnavailableToppings.includes(elTarget.value)) elTarget.disabled = true;
  if (elTarget.id === 'tip-percent') {
    objPricing = null; document.querySelector('#server-totals').hidden = true;
    document.querySelector('#pricing-status').textContent = 'Continue to calculate and review your updated total.';
  }
  if (elTarget.matches('[data-drink]')) {
    const arrDrinks = [...arrSections[2].querySelectorAll('input')].map((elInput) => ({
      strName: elInput.dataset.drink, strSize: elInput.dataset.size, intQuantity: Number(elInput.value),
    }));
    objOrder.arrDrinks = arrDrinks;
    try {
      calculateSubtotal(objOrder);
      renderSummary();
    } catch { /* Keep the last valid preview; validate the field on Continue. */ }
  }
  if (elTarget.matches('[name="payment"]')) updateNextButton();
});

elForm.addEventListener('change', (objEvent) => {
  if (objEvent.target.matches('[data-drink]')) {
    try { document.querySelector('#cart-status').textContent = `Order subtotal ${formatCurrency(calculateSubtotal(objOrder))}.`; }
    catch { document.querySelector('#cart-status').textContent = 'Review your drink quantities before continuing.'; }
  }
});

elForm.addEventListener('submit', async (objEvent) => {
  objEvent.preventDefault();
  if (bOpeningPayment || bCheckingPrice) return;
  clearError();
  if (!validateCurrentStep()) return;
  if (objCatalog && intStep >= 4) {
    const strDisplayed = objPricing ? JSON.stringify(objPricing) : null;
    const objChecked = await checkPrice();
    if (!objChecked) return;
    if (strDisplayed !== JSON.stringify(objChecked)) {
      if (intStep === 5) { showStep(4); }
      showError('Review the current total below, then continue again to confirm it.'); return;
    }
  }
  if (intStep < 5) { showStep(intStep + 1); return; }
  bOpeningPayment = true;
  elNext.disabled = true;
  elBack.disabled = true;
  elForm.setAttribute('aria-busy', 'true');
  document.querySelector('#payment-status').textContent = 'Opening secure checkout…';
  try { await openSecureCheckout(); } catch (objError) { showError(objError.message); }
  finally {
    bOpeningPayment = false;
    elNext.disabled = false;
    elBack.disabled = false;
    elForm.removeAttribute('aria-busy');
    document.querySelector('#payment-status').textContent = '';
  }
});

function pricingInput() {
  return { strCatalogFingerprint: objCatalog.strFingerprint,
    arrPizzas: objOrder.arrPizzas.map((objPizza) => ({ ...objPizza, arrToppings: [...objPizza.arrToppings] })),
    arrDrinks: objOrder.arrDrinks.filter((objDrink) => objDrink.intQuantity > 0).map((objDrink) => ({
      strBeverage: objCatalog.arrBeverages.find((objItem) => objItem.strLabel === objDrink.strName)?.strCode ?? '',
      strSize: objDrink.strSize, intQuantity: objDrink.intQuantity })),
    intTipPercent: Number(document.querySelector('#tip-percent').value) };
}
function displayPrice() {
  if (!objPricing) return;
  const elTotals = document.querySelector('#server-totals'); elTotals.replaceChildren();
  for (const [strLabel, centsAmount] of [['Items', objPricing.centsSubtotal], [`Tax (${objPricing.intTaxBasisPoints / 100}%)`, objPricing.centsTax], ['Optional tip', objPricing.centsTip], ['Total', objPricing.centsTotal]]) {
    const elLine = createElement('div', '', 'subtotal');
    elLine.append(createElement('span', strLabel), createElement('strong', formatCurrency(centsAmount))); elTotals.append(elLine);
  }
  elTotals.hidden = false;
  document.querySelector('#payment-total').textContent = `Total ${formatCurrency(objPricing.centsTotal)} · Tax ${formatCurrency(objPricing.centsTax)} · Tip ${formatCurrency(objPricing.centsTip)}`;
}
function refreshCatalog(objCurrent) {
  objCatalog = objCurrent; configureMenu(objCatalog);
  objAvailability.bKnown = true;
  objAvailability.arrUnavailableToppings = objCatalog.arrToppings.filter((objItem) => !objItem.bAvailable).map((objItem) => objItem.strCode);
  objAvailability.arrUnavailableBases = objCatalog.arrUnavailableBases;
  for (const elInput of elForm.querySelectorAll('[name=size]')) {
    const objSize = objCatalog.arrSizes.find((objItem) => objItem.strCode === elInput.value);
    elInput.disabled = !objSize?.bAvailable;
    if (objSize) elInput.closest('label').querySelector('small').textContent = `${formatCurrency(objSize.centsBase)} base`;
  }
  for (const elInput of elForm.querySelectorAll('[name=topping], [name=crust]')) {
    elInput.disabled = !(elInput.name === 'topping' ? objCatalog.arrToppings : objCatalog.arrCrusts).find((objItem) => objItem.strCode === elInput.value)?.bAvailable
      && !(elInput.name === 'topping' && elInput.checked);
  }
  for (const elInput of elForm.querySelectorAll('[data-drink]')) {
    const objSize = objCatalog.arrDrinkSizes.find((objItem) => objItem.strCode === elInput.dataset.size);
    const bAvailable = objSize?.bAvailable && objCatalog.arrBeverages.find((objItem) => objItem.strLabel === elInput.dataset.drink)?.bAvailable;
    elInput.disabled = !bAvailable && Number(elInput.value) === 0; elInput.max = bAvailable ? '10' : '0';
    elInput.closest('.field').querySelector('.field-hint').textContent = `${formatCurrency(objSize?.centsPrice ?? 0)} each${bAvailable ? '' : ' · Currently unavailable; remove this drink'}`;
  }
  renderSummary(); renderPizzaList(); if (intStep === 4) renderReview();
}
async function checkPrice() {
  if (bCheckingPrice) return null;
  const objInput = pricingInput();
  if (!document.querySelector('#tip-percent').validity.valid || !Number.isSafeInteger(objInput.intTipPercent) || objInput.intTipPercent < 0) { showError('Enter a whole-number tip percentage of zero or more.', document.querySelector('#tip-percent')); return null; }
  const strInput = JSON.stringify(objInput); const intStartedStep = intStep;
  bCheckingPrice = true; elNext.disabled = true; elBack.disabled = true; elForm.setAttribute('aria-busy', 'true');
  document.querySelector('#pricing-status').textContent = 'Checking current prices and availability…';
  const objAbort = new AbortController(); const intTimer = setTimeout(() => objAbort.abort(), 10000);
  try {
    const objResponse = await fetch('/api/pricing/preview', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: strInput, signal: objAbort.signal });
    const objResult = await objResponse.json();
    if (JSON.stringify(pricingInput()) !== strInput || intStep !== intStartedStep) return null;
    if (objResponse.status === 409 && objResult.objCatalog) {
      refreshCatalog(objResult.objCatalog); objPricing = null;
      document.querySelector('#server-totals').hidden = true;
      showError('The menu changed. Your selections are saved. Continue to check and review the updated total.'); return null;
    }
    if (!objResponse.ok) { objPricing = null; document.querySelector('#server-totals').hidden = true; throw new Error(objResult.strMessage ?? 'Unable to check pricing. Please try again.'); }
    objPricing = objResult; displayPrice();
    document.querySelector('#pricing-status').textContent = 'Current prices and availability checked. Review your total before continuing.';
    return objResult;
  } catch (objError) {
    if (intStep === intStartedStep) {
      objPricing = null; document.querySelector('#server-totals').hidden = true;
      document.querySelector('#pricing-status').textContent = 'Current prices could not be confirmed.';
      document.querySelector('#payment-total').textContent = 'Confirm the current total before continuing.';
      showError(objError instanceof TypeError || objError.name === 'AbortError' || objError instanceof SyntaxError
      ? 'Unable to check current prices. Your selections are saved. Please try again.' : objError.message);
    }
    return null;
  } finally {
    clearTimeout(intTimer); bCheckingPrice = false; elNext.disabled = false; elBack.disabled = false; elForm.removeAttribute('aria-busy');
  }
}
resetPizzaEditor();
renderSummary();
document.querySelector('#order-app').hidden = false;
document.querySelector('#order-fallback').hidden = true;
