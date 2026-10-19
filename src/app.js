import express from 'express';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { SIZES, TOPPINGS, DRINKS } from './public/js/ordering/order-model.js';

const objApp = express();

function prepareText(objBody, strType) {
  return { objBody, objGzip: gzipSync(objBody), strType };
}

// Cache only these public text assets. Other public files retain Express static handling.
const mapTextAssets = new Map();
for (const strPath of ['/css/tokens.css', '/css/global.css', '/css/ordering.css',
  '/js/theme.js', '/js/ordering/order-wizard.js', '/js/ordering/order-model.js',
  '/js/checkout/payment.js']) {
  const objBody = readFileSync(fileURLToPath(new URL(`./public${strPath}`, import.meta.url)));
  mapTextAssets.set(strPath, prepareText(objBody, strPath.endsWith('.css') ? 'css' : 'js'));
}
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
  if (objRequest.headers.range && objRequest.path !== '/vendor/bootstrap.min.css') return fnNext();
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
objApp.get('/order', (objRequest, objResponse, fnNext) => {
  renderPage(objRequest, objResponse, fnNext, 'pages/order', {
    strTitle: "Order Online | Luigi's Pizza",
    strDescription: "Build your Luigi's pizza, choose drinks, and review your dine-in or carry-out order.",
    objSizes: SIZES, objToppings: TOPPINGS, arrDrinks: DRINKS,
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
objApp.use((objRequest, objResponse) => {
  objResponse.status(404).type('text').send('Page not found. Visit / for Luigi’s Pizza.');
});
objApp.use((objError, objRequest, objResponse, fnNext) => {
  if (objResponse.headersSent) return fnNext(objError);
  objResponse.status(500).type('text').send('Something went wrong. Please try again later.');
});

export default objApp;
