# BE-02 unpaid persistence verification — 2026-10-21

## TEST-02 feature acceptance — October 23, 2026

The applicable feature checkpoint passed. See [TEST-02 acceptance](test-02-checkout-acceptance.md) for exact source/run links, native platform/browser visuals, connected journeys, human keyboard/Narrator/zoom review, contrast sampling and reused audit evidence. The initial macOS WebKit keyboard failure was resolved by enabling the documented native runner preference; assertions and application code were unchanged. BE-02/BE-03/FE-03 are accepted for their demonstration application scope. Existing final hosted, integrated privacy/security and operator gates remain separate. Historical pending notes below retain their original increment context and are superseded only by the explicit current evidence.

## Focused reconciliation — October 23, 2026

Reviewed existing contributor implementation at `78f81cf` on native Windows,
Node 24.19.0 and the locked Playwright browsers. No application or test change
was necessary. These focused checks passed:

```sh
node --test tests/unit/order-submission.test.js tests/unit/scheduling-service.test.js tests/unit/demo-payment.test.js tests/unit/demo-payment-concurrency.test.js
node node_modules/@playwright/test/cli.js test -c playwright.orders.config.js --project=chromium-desktop --project=firefox-desktop
```

The service/HTTP checks verify contact rules, forged/stale input rejection,
atomic rollback, immutable price snapshots, identical-request replay, conflicting
request rejection, same-origin/size protections, scheduling/capacity, payment
confirmation/decline/cutoff/expiry and rollback/concurrent-payment behavior.
Chromium/Firefox desktop checks verify carry-out response loss after a real server
commit without duplicate orders, dine-in contact/email preservation and explicit
unpaid state in the submission-only fixture. Existing axe checks in those selected
cases also passed; this is not a complete manual accessibility review.

The [design/file guide](../order-submission-design.md) now distinguishes current
configured payment/tracking/cleanup from the original isolated persistence scope.
The earlier missing-integration and macOS Firefox-launch notes below are historical,
not evidence that those services are absent or Windows Firefox is failing now.

BE-02 is implementation-ready, not fully accepted. Remaining connected
customer/employee data, supported browser/mobile/native visual, manual accessibility
and applicable audit acceptance remain on [TEST-02](https://trello.com/c/DlgHEJjl)
and final QA. No new broad visual, Lighthouse, hosted or live-provider result is
claimed by this documentation-only reconciliation.

## Original persistence increment

Historical increment. See the [current customer integration checkpoint](customer-checkout-checkpoint.md)
for subsequently implemented scheduling/payment/tracking and remaining acceptance.

Approved increment: save validated unpaid order snapshots, prevent duplicate
retries, integrate the wizard and keep unconfirmed status explicit. This is not
full BE-02 acceptance: scheduling/payment integration and quality gates remain.

## Passed

- `npm run test:unit`: 169/169 tests, including new order/HTTP tests for
  contact rules, forged prices, stale menus, quantity limits, immutable prices,
  changed-request conflicts, identical retries after menu changes, no payment or
  capacity side effects, mid-write rollback and same-origin/body-size defenses.
- `npx playwright test -c playwright.orders.config.js`: eight passed cases in
  Chromium and WebKit across desktop/mobile. Tests exercise carry-out lost-response
  retries (actual server commit before response loss), one persisted order after
  retry, dine-in phone/email requirements, input preservation and unconfirmed
  status with recoverable payment failure. Axe checks passed on details and saved
  payment states. Browser errors are checked in the dine-in journey.
- Captured and visually inspected representative Chromium mobile contact details
  and WebKit desktop saved/unpaid screenshots. These captures are evidence of
  focused visual review, not approved deterministic regression baselines.
- Lighthouse 13.5.0, default mobile simulated throttling, production-mode isolated
  database fixture on `/order`: 100 Performance, 100 Accessibility, 100 Best
  Practices, 100 SEO. See [configuration and advisories](be-02-lighthouse.json).
  This navigation audit does not cover every dynamic wizard state or establish
  WCAG conformance.
- Actual configured application preview on loopback port 3005 returned 200,
  enabled order submission and displayed the invented-contact disclosure.
- JavaScript syntax and diff whitespace checks passed; focused source review.
  Environment: Node 24.14.1, macOS 27.0.1 arm64, existing project dependencies.

## Failed / pending

- Four Firefox UI cases failed at browser launch before navigation, with the
  known local profile-folder error. Firefox application behavior remains unverified.
- Deterministic visual comparison baselines for the new submission states,
  representative screen-reader review and complete manual keyboard/zoom/contrast
  acceptance remain pending. No accessibility or browser gate is waived here.
- Scheduling/capacity reservations, payment lifecycle/confirmation, abandoned
  unpaid-order cleanup and guest tracking remain subsequent integrations.
  This increment must never be represented as a complete checkout or confirmed
  order. It creates no booking, payment attempt or received fulfillment status.

Run the isolated audit with `NODE_ENV=production node tests/fixtures/orders-server.js`
and `node tests/audit-orders.js`; stop the fixture before Playwright starts its
own server. Tests use synthetic contacts and an in-memory database.

[Implementation/file guide](../order-submission-design.md).
