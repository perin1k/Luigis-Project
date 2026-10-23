# BE-10 lifecycle integration checkpoint

October 22, 2026. Card: https://trello.com/c/jJblyoFo. This preserves the existing
scheduling, payment, menu, progress, exception, refund and retention services.
No new runtime feature, schema, account or provider is introduced.

`tests/unit/menu-service.test.js` adds one connected regression scenario using
actual isolated SQLite records and real demo payment/order creation. An employee's
ingredient change opens an inventory review; preparation is blocked and employee
cancellation is denied. An authorized administrator cancels the whole order,
releasing confirmed capacity without claiming an automatic refund. A separately
authorized demo refund returns the exact purchased total; replay creates no second
refund, signed allocations net to zero and purchased lines remain unchanged.
Foreign-key checks pass. Nothing is silently substituted or repriced.

Reproduce the lifecycle regression set:

```sh
node --test tests/unit/menu-service.test.js tests/unit/scheduling-service.test.js tests/unit/scheduling-concurrency.test.js tests/unit/order-progress.test.js tests/unit/demo-refund-service.test.js tests/unit/retention-service.test.js
```

The focused menu suite passed eight tests; the combined suite passed **30 tests**,
both with zero failures/skips. Environment: macOS arm64,
Node 24.14.1/npm 11.11.0. This test uses only disposable in-memory data; no working
database, keys, real payment or external notification is touched.

The older [scheduling checkpoint](be-10-scheduling.md) predates payment, menu,
preparation, refund and cleanup integration. Its then-open lifecycle list is
historical, not evidence that those services remain absent. Current contracts are
in [payment design](../demo-payment-design.md), [menu management](../menu-management-design.md),
[tracking/exceptions](../tracking-and-exceptions.md),
[refund design](../demo-refund-design.md) and [retention enforcement](../retention-enforcement.md).
The synchronous local payment adapter has no asynchronous provider callback;
late-provider success must not be invented as an exercised event.

BE-10 remains open for complete browser/visual/manual and platform acceptance.
This test-only increment adds no UI and claims no fresh Lighthouse or browser pass.
Firefox, Windows/Linux and manual accessibility gates remain intact. Existing
concurrent role-hierarchy implementation is not changed or claimed here.

## Scheduling browser follow-up

At commit `39929f9`, the existing isolated SQLite scheduling fixture passed
**20 functional cases (50.4 seconds)** across desktop/mobile Chromium and WebKit:

```sh
npx playwright test --config=playwright.scheduling.config.js --project=chromium-desktop --project=chromium-mobile --project=webkit-desktop --project=webkit-mobile --grep 'ready time is required|competing reservation|expired saved hold|empty availability|after cutoff'
```

Verified required ready-time selection and retained booking on retry; competing
reservations force explicit reselection; failed pickup requests preserve the basket;
expired holds cannot renew through replay; empty availability clears stale choices
and recovers; after-cutoff selection offers the next open day in Central time even
when the device timezone differs. No runtime, tests or visual baselines changed
for this follow-up. Fixture-only controls are not production routes.

This does not exercise asynchronous provider late success, native Wallet, a hosted
environment, Windows/Linux, Firefox, new visual comparisons or manual accessibility.
The known Firefox startup blocker was not redundantly retried. The full card stays
open for those applicable retained acceptance checks and complete journey review.

## Native visual, accessibility and keyboard follow-up

The complete server suite at `fb02245` passed **256 tests**, zero failures/skips.
The existing scheduling visual tests initially failed eight cases because macOS
references were missing. Missing-only generation preserved every Windows baseline
and produced 16 light/dark Chromium/WebKit desktop/mobile references. The images
were inspected together for layout consistency and representative light/dark
320px reviews were inspected at readable scale.

Generation exposed a real WebKit keyboard failure in two cases: Tab from the ready
time select skipped Refresh pickup times. The native button now has `tabindex="0"`,
consistent with other explicitly keyboard-reachable project controls. This keeps
natural DOM order and adds no positive tabindex or scripted Tab interception.

Normal comparison, without snapshot updating, then passed **8 cases (29.4s)**:

```sh
npx playwright test --config=playwright.scheduling.config.js --project=chromium-desktop --project=chromium-mobile --project=webkit-desktop --project=webkit-mobile --grep 'visual scheduled status|scheduling policy and recovery'
```

The checks cover both themes, 320px reflow, axe WCAG-tagged checks, skip-link focus
and select-to-refresh Tab order. These complement manual accessibility review;
they do not replace it. Fixture status examples are not persisted customer cases
or proof that the reusable status partial is integrated into guest tracking.

With the keyboard change, production-mode scheduling-enabled `/order` scored
**100 Performance, Accessibility, Best Practices and SEO** using Lighthouse
13.5.0's default simulated mobile profile. [Retained report](be-10-keyboard-lighthouse.json)
includes configuration and optimization advisories; a perfect category score does
not mean no advisory exists. The disposable fixture was stopped after the audit.

Only the template button attribute, new macOS references and verification records
change. Firefox/Linux/Windows execution and representative manual screen-reader
acceptance remain unverified here. BE-10 and FE-10 retain full-card acceptance.
