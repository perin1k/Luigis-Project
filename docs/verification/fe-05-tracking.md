# FE-05 customer tracking implementation checkpoint

October 23, 2026. [FE-05](https://trello.com/c/413LUQnW).
Status: **Ready for Testing, not Done**; broader acceptance is
[TEST-03](https://trello.com/c/WOZ38Ufw).

## Existing presentation and scope

Preserves the team's existing EJS/browser presentation and real tracking service.
No production application, dependency, schema, price, permission, payment provider
or external notification behavior changed. Customers use a protected fragment
link without a mandatory account. The page renders real progress, Central ready
times, review/cancellation/refund messages and final outcomes, with no contact or
financial details. Existing live regions, keyboard controls, theme styles and
safe text rendering remain intact. See [tracking design](../tracking-and-exceptions.md).

## Reusable coverage and file responsibilities

- `tests/staff-orders-e2e/tracking-presentation.spec.js` adds independent customer
  and staff browser sessions sharing the real disposable database. Customer timezone
  is Pacific/Honolulu to verify restaurant Central-time presentation. Authenticated
  staff actions, MFA, real status writes and demonstration refund records drive
  Ready, Completed, prepared Not collected and cancellation/refund outcomes.
- Its network test injects a connection failure, verifies retained progress is
  explicitly stale and cancellation controls are hidden, then restores the real
  response. A separately injected 404 verifies private-content clearing and
  team-assisted recovery guidance. Actual expiry/revocation remains covered by
  the existing BE-05 service/browser checks; the injected response is not claimed
  as a new service-expiry test.
- `tests/fixtures/staff-app.js` adds forward-only `advanceTo(dtValue)` for a
  disposable fixture clock. Invalid/backward dates are rejected. Existing fixture
  behavior is unchanged unless this method is called.
- `tests/fixtures/staff-orders-server.js` exposes only the test fixture's fixed
  closing-time control. Advancing to 11 PM Central expires the existing staff
  session; the new no-show test requires fresh password/MFA before the actual
  administrative decision. No application route or real account is added.
- Production responsibilities remain `src/views/pages/tracking.ejs` for labels,
  live regions, cancellation confirmation and recovery controls;
  `src/public/js/tracking.js` for real response rendering, stale-response guards,
  explicit refresh and recoverable failures; and server tracking/exception services
  for authorization, privacy, authoritative state and retention deadlines.

## Focused verification and evidence reuse

Application source: `b1410404fa4232e55d059823c1f983de2c68f0d6`.
Windows x64 / Node 24.22.1 / Playwright 1.64.1, locked Chromium 156.0.8078.4 and
Firefox 157.0 desktop profiles. New test/fixture source is included in this increment.
The network/404, Ready/Completed and prepared no-show journeys passed in both
browsers. The cancellation/refund journey passed in a focused follow-up in both
browsers after correcting the new test helper and synchronization described below.
Syntax and diff checks passed. No broad suite or unchanged application tests were
repeated after those focused passes.

```sh
node node_modules/@playwright/test/cli.js test -c playwright.staff-orders.config.js tracking-presentation.spec.js --project=chromium-desktop --project=firefox-desktop
# Focused follow-up after correcting only the refund journey:
node node_modules/@playwright/test/cli.js test -c playwright.staff-orders.config.js tracking-presentation.spec.js --project=chromium-desktop --project=firefox-desktop --grep 'distinguishes approved cancellation'
```

Initial test development found two test-harness mistakes, not production defects:
the helper expected generic Decision saved for cancellation, whose correct message
explicitly says refund review is still required; then Chromium exposed approval
before the refreshed refund summary finished rendering. The helper now asserts
the cancellation-specific message and awaits persisted State: failed before
reviewing a retry. No application message, assertion threshold or security guard
was weakened. The other six passing cases were unaffected and were not rerun.

Reuse the fresh [BE-05 focused record](be-05-follow-up.md) for private-link
minimum output, expiry/revocation and replacement, status/hold/revision guards,
keyboard skip/refresh and superseded-response protection. Reuse
[TEST-02](test-02-checkout-acceptance.md) for genuine checkout-to-private-tracking
issuance and interrupted-payment recovery. Application bytes are unchanged; the
new clock helper is inactive in those cases. These are reused results, not fresh
claims for this increment. Earlier team audit/visual records retain their original
source/environment; they are not presented as current TEST-03 acceptance.

## Remaining acceptance

TEST-03 must complete supported native desktop/mobile browser, light/dark visual
comparisons and automated accessibility, grouped manual keyboard/zoom/contrast/
screen-reader review, applicable tracking/private-page Lighthouse checks and
integrated fulfillment/inventory/cancellation/refund/notification journeys.
The new focused cases strengthen those journeys but do not close the checkpoint.
No snapshots were created or updated here. Keep the existing private noindex SEO
exception and all other acceptance requirements. Final hosted/security/operator
QA/INT/OPS work remains separate. No real charge/refund or external message delivery
is claimed. FE-05 stays incomplete until its applicable gates pass.
