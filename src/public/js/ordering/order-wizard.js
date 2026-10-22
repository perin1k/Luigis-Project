import { configureMenu, SIZES, TOPPINGS, calculatePizzaPrice, calculateSubtotal, formatCurrency, validatePizzaAvailability } from './order-model.js';
import { openSecureCheckout } from '../checkout/payment.js';

let objCatalog = JSON.parse(document.querySelector('#order-app').dataset.catalog);
if (objCatalog) configureMenu(objCatalog);
let objPricing = null;
let bCheckingPrice = false;
const bDemoPayments = document.querySelector('#order-app').dataset.demoPayments === 'true';
let objPendingPayment = null;
let bPaymentUnknown = false;
let bCheckingPickup = false;
let objPickupSelection = null;
let arrPickupOptions = [];
let intPickupRequest = 0;
let objPickupAbort = null;
const bScheduling = document.querySelector('#order-app').dataset.scheduling === 'true';
const elForm = document.querySelector('#order-form');
const elNext = document.querySelector('#next-button');
const elBack = document.querySelector('#back-button');
const elError = document.querySelector('#form-error');
const elAdd = document.querySelector('#add-pizza');
const elCancel = document.querySelector('#cancel-edit');
const arrSections = [...document.querySelectorAll('[data-step]')];
const objOrder = { strService: 'carry-out', arrPizzas: [], arrDrinks: [], strName: '', strPhone: '', strEmail: '' };
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
  if (objOrder.strPhone) elContact.append(createElement('p', objOrder.strPhone));
  if (objOrder.strEmail) elContact.append(createElement('p', objOrder.strEmail));
  elContact.append(createEditButton('Edit contact details', () => showStep(3)));
  const elTotal = createElement('div', '', 'subtotal');
  elTotal.append(createElement('span', 'Subtotal'), createElement('strong', formatCurrency(calculateSubtotal(objOrder))));
  elReview.append(elService, elFood, elContact);
  if (!objCatalog) elReview.append(elTotal);
}

const bOrderSubmission = document.querySelector('#order-app').dataset.orderSubmission === 'true';
let objPendingSubmission = null;

function updateContactFields() {
  const bCarryOut = objOrder.strService === 'carry-out';
  document.querySelector('#phone-field').hidden = !bCarryOut && !bOrderSubmission;
  if (bOrderSubmission) document.querySelector('#email-field').hidden = bCarryOut;
  document.querySelector('#customer-phone').required = bCarryOut;
  document.querySelector('#contact-intro').textContent = bCarryOut
    ? 'Who’s picking up? We’ll use your number if we need to reach you about your order.'
    : bOrderSubmission ? 'Who’s joining us? Provide your name and a phone number or email address.' : 'Who’s joining us? Your name helps us match you with your order.';
}

function updateNextButton() {
  elNext.textContent = intStep === 5 && bDemoPayments ? (bPaymentUnknown ? 'Check demo payment result' : elForm.elements.payment.value === 'apple-pay' ? 'Confirm demo Apple Pay' : 'Confirm demo payment') : intStep === 5
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
  if (bScheduling && intStep < 5) clearPickupReceipt();
  if (intStep === 4) { renderReview(); if (objCatalog) void checkPrice(); if (bScheduling) void loadPickupTimes(); }
  if (bScheduling && intStep === 5 && objPickupSelection) document.querySelector('#payment-pickup').textContent = `Selected ready time: ${formatPickup(objPickupSelection.dtPromisedAt)} (Central). Not reserved yet; not a confirmed booking.`;
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
    objOrder.strEmail = bOrderSubmission && objOrder.strService === 'dine-in' ? document.querySelector('#customer-email').value.trim() : '';
    if (bOrderSubmission) {
      if (objOrder.strPhone && (!/^[+()0-9 .-]{7,40}$/.test(objOrder.strPhone) || objOrder.strPhone.replace(/[^0-9]/g, '').length < 7 || objOrder.strPhone.replace(/[^0-9]/g, '').length > 15)) { showError('Enter a usable phone number, including your area code.', elPhone); return false; }
      if (objOrder.strEmail && !document.querySelector('#customer-email').validity.valid) { showError('Enter a usable email address.', document.querySelector('#customer-email')); return false; }
      if (objOrder.strService === 'dine-in' && !objOrder.strPhone && !objOrder.strEmail) { showError('Provide a phone number or email address for dine-in.', elPhone); return false; }
    }
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
  if (bOpeningPayment || bCheckingPrice || bCheckingPickup) return;
  clearError();
  if (bDemoPayments && bPaymentUnknown && intStep === 5) { await startPayment(); return; }
  if (!validateCurrentStep()) return;
  if (bScheduling && intStep >= 4 && !objPickupSelection) { if (intStep === 5) showStep(4); showError('Choose an available pickup time before continuing.', document.querySelector('#pickup-time')); return; }
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
  await startPayment();
});

async function startPayment() {
  bOpeningPayment = true; elNext.disabled = true; elBack.disabled = true; elForm.setAttribute('aria-busy','true');
  document.querySelector('#payment-status').textContent = bDemoPayments ? 'Processing demonstration payment…' : 'Opening secure checkout…';
  try {
    if (bDemoPayments) {
      if (!objPendingPayment) {
        await saveUnpaidOrder();
        objPendingPayment = { strOrderId: objPendingSubmission.strRequestId, strRequestId: crypto.randomUUID(), strMethod: elForm.elements.payment.value };
      }
      bPaymentUnknown = true;
      const objReceipt = await openSecureCheckout(objPendingPayment);
      showDemoReceipt(objReceipt); bPaymentUnknown = false; objPendingPayment = null;
    } else {
      if (bOrderSubmission) await saveUnpaidOrder();
      await openSecureCheckout();
    }
  } catch (objError) {
    if (objError.bKnownResponse) { bPaymentUnknown = false; objPendingPayment = null; }
    if (objError.bNeedsReview) { objPendingSubmission = null; objPickupSelection = null; clearPickupReceipt(); showStep(4); }
    showError(objError.message);
  } finally {
    bOpeningPayment = false; elNext.disabled = false; elBack.disabled = bPaymentUnknown;
    for (const elInput of elForm.querySelectorAll('[name="payment"]')) elInput.disabled = bPaymentUnknown;
    elForm.removeAttribute('aria-busy'); document.querySelector('#payment-status').textContent = ''; updateNextButton();
  }
}
function showDemoReceipt(objReceipt) {
  const elReceipt = document.querySelector('#demo-receipt'); const elDetails = document.querySelector('#receipt-details'); elDetails.replaceChildren();
  const elReference = createElement('p','Order '); const elReferenceValue = createElement('span',objReceipt.strReference,'font-monospace'); elReferenceValue.id = 'receipt-reference'; elReference.append(elReferenceValue); elDetails.append(elReference);
  for (const strText of [objReceipt.strService === 'carry-out' ? 'Carry-out' : 'Dine-in', `Ready: ${formatPickup(objReceipt.objPickup.dtPromisedAt)}`]) elDetails.append(createElement('p',strText));
  const elMethod = createElement('p',`${objReceipt.strMethod === 'apple-pay' ? 'Demonstration Apple Pay' : 'Generated test card'} `); const elMasked = createElement('span',objReceipt.strMaskedIdentity,'font-monospace'); elMasked.id = 'receipt-identity'; elMethod.append(elMasked); elDetails.append(elMethod);
  const elItems = createElement('ul','');
  for (const objItem of objReceipt.arrItems) elItems.append(createElement('li',`${objItem.intQuantity} × ${objItem.strLabel} · ${formatCurrency(objItem.centsTotal)}`));
  elDetails.append(elItems);
  for (const [strLabel,centsAmount] of [['Items',objReceipt.objTotals.centsSubtotal],['Tax',objReceipt.objTotals.centsTax],['Optional tip',objReceipt.objTotals.centsTip],['Total',objReceipt.objTotals.centsTotal]]) {
    const elLine = createElement('div','','subtotal'); elLine.append(createElement('span',strLabel),createElement('strong',formatCurrency(centsAmount))); elDetails.append(elLine);
  }
  elForm.hidden = true; document.querySelector('.order-progress').hidden = true; document.querySelector('#step-count').textContent = 'Order confirmed · demonstration';
  elReceipt.hidden = false; elReceipt.focus();
}

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

elForm.addEventListener('input', () => { if (bOrderSubmission) document.querySelector('#order-save-status').textContent = ''; });

async function saveUnpaidOrder() {
  const objBody = { strService: objOrder.strService,
    objContact: { strName: objOrder.strName, strPhone: objOrder.strPhone, strEmail: objOrder.strEmail }, objPricing: pricingInput(), ...(bScheduling ? { objPickup: objPickupSelection } : {}) };
  const strBody = JSON.stringify(objBody);
  if (objPendingSubmission?.strBody !== strBody) objPendingSubmission = { strBody, strRequestId: crypto.randomUUID() };
  const objAbort = new AbortController(); const intTimer = setTimeout(() => objAbort.abort(), 10000);
  try {
    const objResponse = await fetch('/api/orders', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, signal: objAbort.signal,
      body: JSON.stringify({ strRequestId: objPendingSubmission.strRequestId, ...objBody }) });
    const objResult = await objResponse.json();
    if (objResponse.status === 409 && objResult.objCatalog) {
      refreshCatalog(objResult.objCatalog); objPricing = null; showStep(4);
      throw new Error('The menu changed. Review the current total before saving your order.');
    }
    if (objResponse.status === 409 && objResult.strCode === 'pickup_changed') { objPickupSelection = null; showStep(4); throw new Error(objResult.strMessage); }
    if (!objResponse.ok) throw new Error(objResult.strMessage ?? 'Unable to save your order. Please try again.');
    if (bScheduling && objResult.objPickup?.strHoldState !== 'active') { objPendingSubmission = null; objPickupSelection = null; showStep(4); throw new Error('Your previous pickup hold expired. Choose a time and review it before starting a new checkout.'); }
    if (bScheduling) document.querySelector('#payment-pickup').textContent = `Temporary unpaid hold: ${formatPickup(objResult.objPickup.dtPromisedAt)} (Central). Expires ${formatPickup(objResult.objPickup.dtExpiresAt)}. This is not a confirmed booking.`;
    document.querySelector('#order-save-status').textContent = `${objResult.strMessage}${objResult.objPickup ? ` Ready time: ${formatPickup(objResult.objPickup.dtPromisedAt)}. Hold expires: ${formatPickup(objResult.objPickup.dtExpiresAt)}.` : ''} Reference: ${objResult.strReference}`;
  } catch (objError) {
    if (objError instanceof TypeError || objError.name === 'AbortError' || objError instanceof SyntaxError) throw new Error('Unable to confirm whether your order details were saved. Your selections are here; retry to safely check the same request.');
    throw objError;
  } finally { clearTimeout(intTimer); }
}

function formatPickup(dtInstant) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(dtInstant));
}
function clearPickupReceipt() {
  document.querySelector('#payment-pickup').textContent = '';
  if (bOrderSubmission) document.querySelector('#order-save-status').textContent = '';
}
async function loadPickupTimes() {
  const intRequest = ++intPickupRequest; objPickupAbort?.abort();
  const intPizzas = objOrder.arrPizzas.reduce((intSum, objPizza) => intSum + objPizza.intQuantity, 0);
  const elSelect = document.querySelector('#pickup-time'); const elStatus = document.querySelector('#pickup-status');
  const strPrevious = objPickupSelection ? JSON.stringify(objPickupSelection) : '';
  objPickupSelection = null; bCheckingPickup = true; elSelect.disabled = true;
  clearPickupReceipt();
  document.querySelector('#pickup-day').textContent = '';
  elSelect.replaceChildren(new Option('Checking ready times…', ''));
  document.querySelector('#refresh-pickup').disabled = true; elStatus.textContent = 'Checking available ready times…';
  const objAbort = new AbortController(); objPickupAbort = objAbort; const intTimer = setTimeout(() => objAbort.abort(), 10000);
  try {
    const objResponse = await fetch(`/api/pickup-times?pizzas=${intPizzas}`, { cache: 'no-store', signal: objAbort.signal });
    const objResult = await objResponse.json(); if (!objResponse.ok) throw new Error('Pickup times could not be loaded. Refresh to try again.');
    if (intRequest !== intPickupRequest) return;
    arrPickupOptions = objResult.arrOptions;
    if (!arrPickupOptions.length) {
      elSelect.replaceChildren(new Option('No ready times available', ''));
      elStatus.textContent = 'No ready times are available right now. Your order selections are preserved. Refresh to check again.';
      return;
    }
    const objDayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric' });
    const strCheckedDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(objResult.dtCheckedAt));
    document.querySelector('#pickup-day').textContent = `${objDayFormatter.format(new Date(arrPickupOptions[0].dtPromisedAt))} · Central time${arrPickupOptions[0].strServiceDate !== strCheckedDay ? ' · next available service day' : ''}`;
    elSelect.replaceChildren(new Option('Choose a time', ''));
    for (const [intIndex, objOption] of arrPickupOptions.entries()) elSelect.add(new Option(`${objOption.strSelectionType === 'ASAP' ? 'Earliest available' : 'Scheduled'} · ${formatPickup(objOption.dtPromisedAt)}`, String(intIndex)));
    const intPrevious = arrPickupOptions.findIndex((objOption) => JSON.stringify(objOption) === strPrevious);
    if (intPrevious >= 0) { elSelect.value = String(intPrevious); objPickupSelection = arrPickupOptions[intPrevious]; }
    elStatus.textContent = intPrevious >= 0 ? 'Your selected time is still available. Capacity is reserved at checkout.' : 'Choose a ready time. Availability is rechecked when saving your order.';
  } catch { if (intRequest !== intPickupRequest) return; arrPickupOptions = []; elSelect.replaceChildren(new Option('Refresh to load times', '')); elStatus.textContent = 'Pickup times could not be loaded. Your order selections are preserved. Refresh to try again.'; }
  finally { clearTimeout(intTimer); if (intRequest === intPickupRequest) { bCheckingPickup = false; elSelect.disabled = arrPickupOptions.length === 0; document.querySelector('#refresh-pickup').disabled = false; } }
}
if (bScheduling) {
  document.querySelector('#refresh-pickup').addEventListener('click', () => { void loadPickupTimes(); });
  document.querySelector('#pickup-time').addEventListener('change', (objEvent) => {
    objPickupSelection = objEvent.target.value === '' ? null : arrPickupOptions[Number(objEvent.target.value)] ?? null;
    document.querySelector('#pickup-status').textContent = objPickupSelection ? `Selected ready time: ${formatPickup(objPickupSelection.dtPromisedAt)}. Not reserved until checkout.` : 'Choose a ready time.';
  });
}
