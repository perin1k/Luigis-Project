# SEC-01 throttled payment recovery

October 22, 2026. Story: https://trello.com/c/3fVC3XbV.

A payment result can commit before the browser loses its response. Previously a
subsequent 429 response was treated as a definitive result, clearing the pending
payment request and allowing editing. `src/public/js/checkout/payment.js` now marks
429 as non-definitive, so the existing wizard recovery path retains the exact
payment identity and keeps conflicting edits disabled. Confirmed declines still
require review. No price, permission, schema or server payment behavior changed.

`tests/payments-e2e/payments.spec.js` adds a focused scenario using the actual
isolated payment fixture: commit payment and interrupt its response, return a
controlled 429 on recovery, then retry successfully. The three outgoing payment
requests use one identifier, and the database contains exactly one payment and
one confirmed order. The error is visible, retry remains enabled, conflicting
navigation stays disabled, and the throttled state has no axe WCAG-tag violations.
The controlled 429 verifies browser recovery; the earlier HTTP request-limit tests
separately exercise the real middleware threshold.

- Chromium desktop/mobile: **2 passed**.
- WebKit desktop/mobile: **2 passed**.
- Firefox desktop/mobile: **2 failed before navigation** with the existing local
  browser startup error, “Could not find profile folder.” No application assertion
  ran in Firefox; no operating-system privacy control was bypassed.
- `npm run test:unit`: **241 passed**, no failures/skips, including the new
  `tests/unit/payment-retry.test.js` regression for 429 versus confirmed decline.
- Syntax/whitespace and focused diff review passed.
- Affected `/order` page: Lighthouse **100 Performance, 100 Accessibility,
  100 Best Practices, 100 SEO**. Default simulated mobile profile, production
  environment, Lighthouse 13.5.0. Configuration, URL, scores and advisories are in
  [the audit report](sec-01-payment-retry-lighthouse.json). Scores do not mean every
  individual audit is perfect or establish WCAG conformance.

Reproduce the focused browser checks with:
`npx playwright test --config=playwright.payments.config.js --grep 'throttled recovery'`.
For the audit, start the disposable `tests/fixtures/payments-server.js`, then run
`node tests/audit-payments.js`. The fixture keeps invented data in memory and
exposes test controls only in that fixture; it is not a production server.

No template, style or visual baseline was changed. New error-state visual/manual
acceptance and the Firefox gate remain open. Existing broader manual keyboard,
zoom, contrast and screen-reader acceptance is not replaced by these checks.
Keep SEC-01 open; this verified fix does not complete its full release scope.
