# BE-01 — Authoritative catalog and pricing

[Story](https://trello.com/c/RuhnxuTd). The user approved the complete service,
endpoint and ordering-wizard integration increment. This implements current menu
pricing and review; [BE-02](order-submission-design.md) adds unpaid order/quote
acceptance, while payment and scheduling integration remain separate.

## Files and boundaries

- `src/ordering/catalog-service.js` reads SQLite menu/ingredient requirements and
  computes all line/subtotal/tax/tip/total amounts. Read transactions are synchronous
  and coherent; previews do not write orders, quotes, payments or catalog records.
- `src/ordering/pricing-router.js` exposes public, no-store JSON catalog and pricing
  responses. Inputs are strict/bounded, not authority for prices. Errors exclude
  database details. These read-only calculations do not require a staff session;
  no staff access or customer data is exposed.
- `src/app.js` supplies the database catalog to EJS and mounts the router only when
  a catalog service is configured. `src/server.js` uses `DATABASE_PATH` for that
  runtime. Existing HTTP presentation fixtures remain available without a database.
  Any authentication-specific setting still requires the full HTTPS configuration;
  a catalog-only connection never mounts staff routes.
- `src/public/js/ordering/order-model.js` receives page-delivered menu values for
  previews. `order-wizard.js` obtains current server totals, checks again before
  payment, requires another explicit review after changes, and retains editable
  selections through unavailable items/network failures. Browser prices and menu
  fingerprints never establish payment or accepted-order authority.
- Ordering EJS partials render escaped database labels/prices, specific seeded
  beverages, availability controls and an optional whole-number percentage tip.
  A selected unavailable topping remains removable. A selected unavailable drink
  can be reduced to zero. The tip starts at zero and is not mandatory.
- During a price check, the browser wizard temporarily disables navigation. If
  disabling the focused navigation button drops focus onto the document body,
  `checkPrice()` restores that button after the check, provided the step is still
  current. It does not move focus away from another control the visitor selected.
  The pricing browser suite includes keyboard-only carry-out and dine-in journeys
  covering step focus, changed-tip confirmation, payment navigation and Back.
- The staff-style asset approach is reused for the database-backed ordering page:
  `order-bundle.css` combines the existing CSS sources, and module preloads avoid
  unnecessary dependency discovery delays. Source styles, CSP and functionality
  remain intact. Legacy fixture asset URLs are preserved.

## Catalog selection and validation

The highest published catalog revision is authoritative. An unpublished future
version is never selected. Until publication management in BE-07, the previously
reviewed `luigis:menu:v1` revision-one seed is the explicit demo baseline when no
published version exists. Missing/incomplete current catalog data fails closed;
no alternative prices or inventory are invented. Seed reruns do not reset changes.

Availability combines active option flags with their ingredient requirements.
Pizza sizes require both marinara and cheese mappings; other ingredient-backed
options require an explicit mapping. An inactive size/crust/drink size/beverage,
unavailable base or selected topping cannot be priced for checkout.

All quantities must be positive safe integers: six pizzas total and ten drinks
across all lines. Zero-quantity drinks are omitted by the browser. Unknown fields,
unsupported options, duplicate selected toppings and client-supplied prices/totals
are rejected. Money uses integer cents and BigInt intermediate arithmetic; any
unsafe result is rejected. No checkout surcharge or crust fee is added.

## API contract

GET `/api/pricing/catalog` returns the selected catalog ID/revision, public option
labels/prices/availability, tax policy and `strFingerprint`. The SHA-256 fingerprint
covers current published menu values and availability; it is a change detector,
not an authentication secret, signed quote, reservation or price guarantee.

POST `/api/pricing/preview` accepts exactly:

```js
{
  strCatalogFingerprint: '64-character lowercase hex fingerprint',
  arrPizzas: [{ strSize: 'large', strCrust: 'regular',
    arrToppings: ['pepperoni', 'sausage'], intQuantity: 1 }],
  arrDrinks: [{ strBeverage: 'coca-cola', strSize: 'medium', intQuantity: 1 }],
  intTipPercent: 0
}
```

Maximum JSON body: 8 KiB; compression, wrong content types and cross-site browser
POSTs are rejected. Success returns authoritative integer-cent line totals,
`centsSubtotal`, `centsTax`, `centsTip`, `centsTotal`, catalog fingerprint/version
and tax-policy reference. Stale fingerprints return 409 and the new public catalog;
invalid/unavailable selections return 422; unavailable infrastructure returns a
sanitized 503. These requests never collect contact or payment-card data.

The browser updates its preview after a 409, keeps selections, and requires
checking/reviewing the new total again. The final payment action also rechecks.
BE-02 must validate and persist an accepted quote atomically with its order and
capacity rules; a prior preview or browser confirmation cannot substitute for that.
Existing accepted snapshot immutability remains enforced by the reviewed schema.
The current payment adapter still reports a recoverable failure, not fake success.

## Approved Tennessee-based demonstration policy

Use the previously approved fictional Cookeville policy: 975 basis points (9.75%)
on the whole item subtotal, invoice-level half-up cent rounding; optional tips
use items plus tax and the same rounding, and are modeled entirely for service
staff. A $10 subtotal produces $0.98 tax; a 10% tip is $1.10; total $12.08.
The real-address/live-tax verification limitation in DATA-01 remains.

The general prepared-food rate was rechecked against
[Tennessee Revenue SUT-54](https://revenue.support.tn.gov/hc/en-us/articles/360058231192-SUT-54-Prepared-Food-Definition-and-Tax-Rate),
and the local component against the [TNECD Putnam profile](https://tnecd.com/counties/putnam/).
The earlier approved rule/statute and source limitations remain documented in
[data-schema-proposal.md](data-schema-proposal.md#tennessee-tax-research--october-21-2026).
Official rule/manual PDF fetches again returned 403; this does not assert complete
current-law or filing/remittance compliance. No live charge or tax remittance occurs.

## Running and verification

For an existing migrated/seeded demo database, set `DATABASE_PATH` to its private
path before `npm start`. Use loopback for local HTTP work. Public hosting and real
staff setup remain separately reviewed; no key or account is created by BE-01.

Run `npm run test:unit` and `npx playwright test -c playwright.pricing.config.js`.
The browser fixture owns an isolated in-memory database; its `/__test/*` controls
are absent from production. Browser screenshots use only synthetic customer data.
For Lighthouse, run `NODE_ENV=production node tests/fixtures/pricing-server.js`
separately, then `node tests/audit-pricing.js`; stop it before Playwright starts its
own fixture. Baseline updates are disabled by default and need actual-image review.
