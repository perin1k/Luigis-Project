# BE-02 unpaid persistence verification — 2026-10-21

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
