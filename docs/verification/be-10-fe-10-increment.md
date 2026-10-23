# BE-10 / FE-10 focused reconciliation — October 23, 2026

Cards: [BE-10](https://trello.com/c/jJblyoFo) and
[FE-10](https://trello.com/c/f8yQT7qN).
Preserves the team's scheduling, inventory, tracking and refund implementation.
Broad acceptance is grouped on [TEST-02](https://trello.com/c/DlgHEJjl), with
cross-feature inventory/refund recovery on [TEST-03](https://trello.com/c/WOZ38Ufw).

## Confirmed gap and change

A hold created before the order cutoff could previously accept a new payment
after cutoff while its quote and pickup remained valid. A new service boundary
test reproduced that failure before implementation.

`src/payments/demo-payment-service.js` now checks the stored service day's cutoff
inside the existing payment transaction, before processing a new payment. Exactly
at cutoff remains eligible. After cutoff it returns 409 `checkout_closed`, releases
the active hold and creates no payment, encrypted identity or confirmed order.
Stored special-hours cutoffs apply rather than a hardcoded normal closing time.
Existing committed-payment replays precede this check and still return the same
receipt; a late response is not confused with a new late payment.

The existing browser recovery handles the 409: clears the unpaid checkout/pickup
identity, returns to ready-time review and retains pizza/contact choices. No new
UI rendering, CSS, database migration, dependency, real transaction or notification
delivery was introduced.

## Reusable tests and focused results

- `tests/unit/demo-payment.test.js`: configurable synthetic start time, normal
  exact/after-cutoff boundaries, special cutoff, hold release, no payment/secret
  creation and replay of an already successful payment after cutoff.
- `tests/fixtures/payments-server.js`: test-only near-close/after-cutoff clock
  controls; these endpoints are not mounted by production.
- `tests/payments-e2e/payments.spec.js`: advances the server clock between real
  order saving and payment, verifying rejection, pickup reselection, retained
  basket/contact, hidden receipt and zero payments/confirmed orders.

Focused checks passed on native Windows / Node 24.19.0 with locked browsers:

```sh
node --test tests/unit/scheduling-service.test.js tests/unit/scheduling-concurrency.test.js tests/unit/menu-service.test.js tests/unit/order-progress.test.js tests/unit/demo-refund-service.test.js tests/unit/retention-service.test.js
node --test tests/unit/demo-payment.test.js tests/unit/demo-payment-concurrency.test.js tests/unit/payment-retry.test.js tests/unit/scheduling-service.test.js tests/unit/scheduling-concurrency.test.js tests/unit/menu-service.test.js
node node_modules/@playwright/test/cli.js test -c playwright.scheduling.config.js --project=chromium-desktop --project=firefox-desktop --grep 'ready time is required|competing reservation|expired saved hold|empty availability|after cutoff'
node node_modules/@playwright/test/cli.js test -c playwright.payments.config.js --project=chromium-desktop --project=firefox-desktop --grep 'crossing the service cutoff|server decline and expiry|lost payment response'
node node_modules/@playwright/test/cli.js test -c playwright.staff-orders.config.js --project=chromium-desktop --project=firefox-desktop --grep 'private customer cancellation holds'
```

These cover Chicago/DST boundaries, rolling capacity and competing connections,
expiry without renewal, paid capacity, inventory preparation locks, authorized
whole-order cancellation and exact refund, retention, payment rollback/replay,
customer contention/reselection and network recovery. Use isolated data and local
loopback access; no working database or application protection was changed.
The connected cancellation browser case also passed: a private customer request
holds preparation until an authorized administrator denies it, with persisted
tracking state rather than an isolated status example.

## Remaining acceptance

Implementation readiness is not Done. TEST-02 retains connected order/checkout,
supported native browser/mobile, visual/accessibility and applicable audit review.
TEST-03 retains full scheduled inventory-change/cancellation/refund/notification
journeys. Final hosted QA remains separate. This focused increment claims no new
broad visual/native-platform comparison, manual accessibility or Lighthouse
pass. Historical macOS evidence is preserved; its old Firefox startup limitation
does not describe these successful Windows Firefox flows.
