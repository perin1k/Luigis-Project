# INT-01 customer journey integration

October 23, 2026. [Source card](https://trello.com/c/Tx1SW85u).

## Scope and provenance

The initial card's 58592af checkpoint predates the existing BE/FE implementations.
This increment preserves those services and verifies their connected customer
path, rather than claiming their implementation as new work. Approved external
substitutes remain generated demonstration payments and restricted internal
notification previews. No live charge, Wallet sheet or email/SMS delivery is
introduced. Public hosting remains under OPS; integrated release gates remain
under QA-01/02/03. Card wording referring to provider checkout is interpreted under
its DECISION-07 demonstration scope, as approved in the INT-01 plan.

## Acceptance and file guide

| Requirement | Existing integration and focused coverage |
| --- | --- |
| Menu, price, availability and customer/service details | Server catalog delivered to the wizard; `/api/pricing/preview` rechecks current menu and integer-cent totals. New tests change the fixture's catalog/ingredient records and require renewed review or block checkout. |
| Persisted order and verified payment | `/api/orders` submits contact, recipe and pickup selection through the order service; `/api/demo-payments` commits the approved demo result. Both service types use these services in browser tests. Confirmation follows the committed response. |
| Receipt, private tracking, recoverable retry | Receipt references and private links come from the payment result; tracking reads the persisted order. New tests cover tracking reload, public-reference rejection, interrupted order persistence and ambiguous server payment failures. |
| Changed totals require review | Fixture raises pizza base prices by 100 cents. Checkout stops, refreshes the catalog, displays the changed tax-inclusive total, and requires another explicit continuation before payment. |
| Customer isolation and approved state | Draft/contact/payment IDs stay in memory. A separate page in the same browser context starts empty; storage contains no tested contact/order/tracking data. Reloaded tracking uses its fragment token and omits contacts. No customer account is introduced. |
| No sample outcomes on final path | Tests submit through genuine application services in disposable SQLite. Test-control endpoints exist only in the fixture, not `src/server.js`; design previews remain isolated. |

Files changed:

- `src/public/js/checkout/payment.js`: server errors, HTTP 408 and HTTP 429 are
  uncertain results. They retain the original pending payment and locked review
  controls; a retry queries the same idempotent operation. Known rejection/review
  responses retain their existing recovery behavior. No server transaction,
  payment protocol, dependency or persisted schema changes.
- `tests/payments-e2e/customer-journey.spec.js`: six connected browser scenarios,
  using native role/label selectors and real fixture services. No mocked success
  is asserted as a committed payment: the 503 recovery case first lets the real
  service commit, then replaces only its response to reproduce a lost result.
- `tests/fixtures/payments-server.js`: isolated price/ingredient changes for
  deterministic stale-menu scenarios. No production routes were added.
- `tests/unit/payment-retry.test.js`: existing adapter regression expanded to
  HTTP 408/429/500/503 and definitive 402/404/409/422 responses, including the
  keep-this-page-open instruction for uncertain results.
- `docs/integrations.md`: current customer integration and state/recovery policy.

## Reproduced failure and fix

Before the fix, four of five initial Chromium desktop checks passed. The fifth
reproduced a committed payment followed by a 503 response: the adapter classified
503 as definitive and removed the safe same-request retry. It now treats server
errors as ambiguous, preserving the request ID and preventing edits until the
result is checked. The regression requires one payment after recovery. Existing
decline, expiry and lost-response coverage remains separately reproducible.

## Verification

Environment: Windows x64, Node 24.19.0, locked Playwright 1.64.1. Synthetic contacts,
generated test payment identities and a disposable SQLite fixture only. Browser
fixture data is in memory; it does not establish restart persistence or production
configuration. Existing backend tests separately cover file-connection payment
durability and concurrency.

```sh
node node_modules/@playwright/test/cli.js test -c playwright.payments.config.js tests/payments-e2e/customer-journey.spec.js
node --test --test-concurrency=1 tests/unit/order-submission.test.js tests/unit/order-pricing.test.js tests/unit/demo-payment.test.js tests/unit/demo-payment-http.test.js tests/unit/demo-payment-concurrency.test.js tests/unit/payment-retry.test.js
```

Focused backend result: **20 passed**. The new six-scenario journey suite passed
**36 checks** across Chromium, Firefox and WebKit, desktop/mobile (3.7 minutes).
The final recovery-message and existing success/decline regression run passed
**18 checks** across the same six projects (3.2 minutes), including existing axe
checks on payment/receipt states. Reproduce with:

```sh
node node_modules/@playwright/test/cli.js test -c playwright.payments.config.js --grep 'ambiguous server failure|both methods show committed|server decline and expiry'
```

The expanded payment-retry unit check also passed independently after the final
message change. The 36 and 18 browser totals overlap on six recovery checks;
they are 54 successful executions, not 54 distinct scenarios.
`git diff --check` passed. No new Lighthouse audit or visual baseline acceptance
was performed in this focused increment.

Concurrent development: the first publish attempt was rejected because shared
`dev` had advanced. The unpushed INT-01 commit was replayed without conflicts on
`12ff600`, retaining the team's TEST-03 and privacy work. On that reconciled base,
the same **20 backend checks** and all **6 Chromium desktop journey checks** passed
again (browser run 51.3 seconds). The three-engine runs above occurred before this
reconciliation; they are not claimed as a new three-engine run of the later base.

## Limits and remaining acceptance

In-memory checkout retries do not survive navigation/reload. This increment does
not add customer data, payment IDs or bearer grants to browser storage. Customers
must retain their private link/reference; after an uncertain payment they should
check the existing operation before leaving and never assume reload means failure.
Tracking grant replacement is an authorized restaurant-team operation.

These focused checks do not certify the deployed runtime, actual external
delivery, native Apple Pay, macOS/Linux application behavior or the entire WCAG
gate. QA-01/02/03 retain integrated/manual accessibility, security, hosted
configuration, restart/durability and release checks. Existing visual/Lighthouse
evidence must be assessed at that acceptance milestone; no baselines or score
requirements were weakened here. Keep INT-01 incomplete until applicable
acceptance evidence is accepted; Ready for Testing is not Done.
