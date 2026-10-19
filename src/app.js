import express from 'express';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { SIZES, TOPPINGS, DRINKS } from './public/js/ordering/order-model.js';

const objApp = express();
// Serve only the installed Bootstrap stylesheet, not the node_modules directory.
const objBootstrapCss = readFileSync(fileURLToPath(new URL('../node_modules/bootstrap/dist/css/bootstrap.min.css', import.meta.url)));
const objCompressedBootstrapCss = gzipSync(objBootstrapCss);
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
objApp.get('/vendor/bootstrap.min.css', (objRequest, objResponse) => {
  objResponse.type('css').vary('Accept-Encoding');
  objResponse.set('Cache-Control', 'public, max-age=3600');
  if (objRequest.acceptsEncodings('gzip')) {
    objResponse.set('Content-Encoding', 'gzip');
    objResponse.send(objCompressedBootstrapCss);
  } else objResponse.send(objBootstrapCss);
});
objApp.use(express.static(fileURLToPath(new URL('./public/', import.meta.url))));
objApp.get('/', (objRequest, objResponse) => {
  objResponse.render('pages/home', {
    strTitle: "Luigi's Pizza | Dine-in & Carry-out",
    strDescription: "Explore Luigi's Pizza: 12, 14, and 18-inch pizzas, your choice of toppings, and fountain drinks. Dine-in and carry-out, daily 10 AM to 11 PM.",
  });
});
// View serving only: no order submission, persistence, or payment endpoints.
objApp.get('/order', (objRequest, objResponse) => {
  objResponse.render('pages/order', {
    strTitle: "Order Online | Luigi's Pizza",
    strDescription: "Build your Luigi's pizza, choose drinks, and review your dine-in or carry-out order.",
    objSizes: SIZES, objToppings: TOPPINGS, arrDrinks: DRINKS,
  });
});
// Isolated visual reference only. Checkout never redirects to this route.
objApp.get('/preview/confirmation', (objRequest, objResponse) => {
  objResponse.set('X-Robots-Tag', 'noindex');
  objResponse.render('pages/confirmation', {
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
