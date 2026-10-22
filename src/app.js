import express from 'express';
import { AUTH_COOKIES, readAuthCookies } from './auth/auth-transport.js';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { SIZES, TOPPINGS, DRINKS, normalizeAvailability } from './public/js/ordering/order-model.js';

export function createApp({ objAuthRuntime } = {}) {
const objApp = express();
// Integration seam: BE supplies current ingredient flags. No inventory is invented here.
objApp.locals.fnGetAvailability = async () => null;

function prepareText(objBody, strType) {
  return { objBody, objGzip: gzipSync(objBody), strType };
}

// Cache only these public text assets. Other public files retain Express static handling.
const mapTextAssets = new Map();
for (const strPath of ['/css/tokens.css', '/css/global.css', '/css/ordering.css',
  '/js/theme.js', '/js/ordering/order-wizard.js', '/js/ordering/order-model.js',
  '/js/checkout/payment.js', '/css/staff.css', '/js/staff.js']) {
  const objBody = readFileSync(fileURLToPath(new URL(`./public${strPath}`, import.meta.url)));
  mapTextAssets.set(strPath, prepareText(objBody, strPath.endsWith('.css') ? 'css' : 'js'));
}
// Staff pages share one CSS response without changing the source styles or customer assets.
mapTextAssets.set('/css/staff-bundle.css', prepareText(Buffer.concat(
  ['/css/tokens.css', '/css/global.css', '/css/staff.css'].flatMap((strPath) =>
    [mapTextAssets.get(strPath).objBody, Buffer.from('\n')])), 'css'));
// Expose only the intended Bootstrap stylesheet, never node_modules itself.
mapTextAssets.set('/vendor/bootstrap.min.css', prepareText(
  readFileSync(fileURLToPath(new URL('../node_modules/bootstrap/dist/css/bootstrap.min.css', import.meta.url))), 'css'));

function sendText(objRequest, objResponse, objText) {
  objResponse.vary('Accept-Encoding');
  const strEncoding = objRequest.acceptsEncodings('gzip', 'identity');
  if (!strEncoding) return objResponse.status(406).type('text').send('No acceptable text encoding.');
  objResponse.type(objText.strType);
  if (strEncoding === 'gzip') objResponse.set('Content-Encoding', 'gzip');
  return objResponse.send(strEncoding === 'gzip' ? objText.objGzip : objText.objBody);
}

function renderPage(objRequest, objResponse, fnNext, strView, objData) {
  objResponse.render(strView, objData, (objError, strHtml) => {
    if (objError) return fnNext(objError);
    sendText(objRequest, objResponse, prepareText(Buffer.from(strHtml), 'html'));
  });
}
objApp.disable('x-powered-by');
objApp.set('view engine', 'ejs');
objApp.set('views', fileURLToPath(new URL('./views/', import.meta.url)));
objApp.use((objRequest, objResponse, fnNext) => {
  objResponse.set({
    'Content-Security-Policy': "default-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  fnNext();
});
objApp.use((objRequest, objResponse, fnNext) => {
  const objText = mapTextAssets.get(objRequest.path);
  if (!objText || !['GET', 'HEAD'].includes(objRequest.method)) return fnNext();
  objResponse.vary('Accept-Encoding');
  // Let Express retain byte-range semantics for the original public files.
  if (objRequest.headers.range && !['/vendor/bootstrap.min.css', '/css/staff-bundle.css'].includes(objRequest.path)) return fnNext();
  objResponse.set('Cache-Control', 'public, max-age=3600');
  sendText(objRequest, objResponse, objText);
});
objApp.use(express.static(fileURLToPath(new URL('./public/', import.meta.url))));
objApp.get('/', (objRequest, objResponse, fnNext) => {
  renderPage(objRequest, objResponse, fnNext, 'pages/home', {
    strTitle: "Luigi's Pizza | Dine-in & Carry-out",
    strDescription: "Explore Luigi's Pizza: 12, 14, and 18-inch pizzas, your choice of toppings, and fountain drinks. Dine-in and carry-out, daily 10 AM to 11 PM.",
  });
});
// View serving only: no order submission, persistence, or payment endpoints.
objApp.get('/order', async (objRequest, objResponse, fnNext) => {
  const objAvailability = normalizeAvailability(await objApp.locals.fnGetAvailability(objRequest));
  objResponse.set('Cache-Control', 'no-store');
  renderPage(objRequest, objResponse, fnNext, 'pages/order', {
    strTitle: "Order Online | Luigi's Pizza",
    strDescription: "Build your Luigi's pizza, choose drinks, and review your dine-in or carry-out order.",
    objSizes: SIZES, objToppings: TOPPINGS, arrDrinks: DRINKS, objAvailability,
  });
});
// Isolated visual reference only. Checkout never redirects to this route.
objApp.get('/preview/confirmation', (objRequest, objResponse, fnNext) => {
  objResponse.set('X-Robots-Tag', 'noindex');
  renderPage(objRequest, objResponse, fnNext, 'pages/confirmation', {
    strTitle: "Confirmation Design Preview | Luigi's Pizza",
    strDescription: 'Visual review of the Luigi’s Pizza order confirmation layout.',
    bDesignPreview: true,
    objConfirmation: {
      strName: 'Sample guest', strService: 'Carry-out', strSubtotal: '$12.00',
      arrItems: [{ strDescription: '1 × Large pizza · Regular · Pepperoni', strPrice: '$12.00' }],
    },
  });
});
if (objAuthRuntime) {
  objApp.use('/auth', objAuthRuntime.objRouter);
  objApp.get(['/staff/sign-in', '/staff/enroll', '/staff/recovery', '/staff/account'], (objRequest, objResponse, fnNext) => {
    objResponse.set({ 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer', 'Vary': 'Cookie' });
    if (!objRequest.socket.encrypted || objRequest.headers.host !== new URL(objAuthRuntime.strOrigin).host) {
      return objResponse.status(403).type('text').send('A secure connection is required.');
    }
    let objCookies;
    try { objCookies = readAuthCookies(objRequest.headers.cookie); }
    catch { return objResponse.status(400).type('text').send('Unable to read this session.'); }
    const objIdentity = objAuthRuntime.objSessionService.validateSession(objCookies[AUTH_COOKIES.strSession]);
    const strMode = objRequest.path.split('/').at(-1);
    if (strMode === 'account' && !objIdentity) return objResponse.redirect(303, '/staff/sign-in');
    const objInitialLists = strMode === 'account' && objIdentity.strRole === 'admin'
      ? objAuthRuntime.readAccountLists(objCookies[AUTH_COOKIES.strSession]) : {};
    if (!objInitialLists) return objResponse.redirect(303, '/staff/sign-in');
    renderPage(objRequest, objResponse, fnNext, 'pages/staff', {
      strTitle: 'Staff access | Luigi’s Pizza', strDescription: 'Secure staff account access for Luigi’s Pizza.',
      strMode, bAdmin: objIdentity?.strRole === 'admin', objInitialLists,
    });
  });
}
objApp.use((objRequest, objResponse, fnNext) => {
  objResponse.status(404).set({ 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });
  renderPage(objRequest, objResponse, fnNext, 'pages/error', {
    strTitle: "Page not found | Luigi's Pizza", strDescription: 'Find your way back to the Luigi’s Pizza menu.',
    intStatus: 404, strHeading: 'This page isn’t on the menu.',
    strMessage: 'We couldn’t find that page. Let’s get you back to something delicious.',
  });
});
objApp.use((objError, objRequest, objResponse, fnNext) => {
  if (objResponse.headersSent) return fnNext(objError);
  objResponse.status(500).set({ 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });
  renderPage(objRequest, objResponse, () => {
    // Keep a safe fallback if the template itself cannot render.
    objResponse.status(500).type('text').send('Something went wrong. Please try again later.');
  }, 'pages/error', {
    strTitle: "Something went wrong | Luigi's Pizza", strDescription: 'Return to the Luigi’s Pizza menu and try again.',
    intStatus: 500, strHeading: 'A little trouble in the kitchen.',
    strMessage: 'We couldn’t load this page. Please try again later, or return to our menu.',
  });
});

return objApp;
}

export default createApp();
