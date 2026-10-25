/**
 * Browser-only privacy cleanup for customer pages; authentication remains server-side.
 * Native forms work without this module. Codes and private account content are cleared on departure.
 */
const elCodes = document.querySelector('#customer-recovery-codes');
const elHide = document.querySelector('#hide-customer-codes');
// Clear both the field and its container so hidden codes are no longer reachable in the document.

function clearCodes() {
  if (!elCodes) return;
  const elText = elCodes.querySelector('textarea');
  if (elText) elText.value = '';
  elCodes.remove();
}
elHide?.addEventListener('click',() => {
  clearCodes();
  document.querySelector('h1')?.setAttribute('tabindex', '-1');
  document.querySelector('h1')?.focus();
});
window.addEventListener('pagehide',() => {
  clearCodes();
  document.querySelector('main')?.replaceChildren();
});
window.addEventListener('pageshow', objEvent => {
  if (objEvent.persisted) window.location.reload();
});
document.addEventListener('visibilitychange',() => {
  if (document.hidden) clearCodes();
});
