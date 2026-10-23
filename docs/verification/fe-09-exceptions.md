# FE-09 exceptions and receipt implementation checkpoint

October 23, 2026. [FE-09](https://trello.com/c/3d7QEaAQ).
Status: **Ready for Testing, not Done**; [TEST-03](https://trello.com/c/WOZ38Ufw)
retains broader acceptance. Baseline: `44cbcfe03b387ccfd6f8466e3bbb8c9f6bab9303`
plus the focused application/test changes in this increment.

## Behavior and policy

Preserves the team's genuine cancellation, refund, receipt and tracking interfaces.
The approved policy is full demonstration refunds of items, tax and tip with no
fee deduction, superseding older FE-09 deduction wording. No provider verification,
remote reconciliation or money movement is invented. Persisted pending is distinct
from completed; cancellation approval alone never claims a refund succeeded.

During refund submission, a rejected/expired session already cleared private
content and financial controls, but the alert could show Administrative access is
required while offering sign-in recovery. The refund HTTP 401/403 branch now
announces Your staff session is unavailable. Sign in again., consistent with
existing refresh recovery. Clear-private behavior, server authorization, original
successful/failed outcomes and uncertain same-request retry remain intact. This
is a presentation correction, not a change to permission or refund policy.

## Files and reusable tests

- `src/public/js/staff-orders.js` changes only the refund 401/403 alert path:
  clear private content, expose sign-in recovery and throw the explicit sign-in
  message before ordinary refund outcome rendering. No success is inferred.
- `tests/staff-orders-e2e/exceptions-presentation.spec.js` verifies missing
  explicit approval sends no refund request; full amount/no-fee copy is visible;
  persisted pending disables another approval in initial server-rendered HTML and
  refreshed detail; guest tracking says pending rather than completed; expired
  sessions before CSRF/submission and between CSRF and POST clear private details,
  remove financial controls, announce recovery and retain unauthorized API denial.
- `tests/fixtures/staff-orders-app.js` adds an opt-in seed for an exceptional
  pending-refund record after a real paid order and approved cancellation. The
  record passes existing immutable schema guards and uses the purchased amount;
  no successful evidence/reversal is fabricated. The current synchronous local
  adapter normally leaves no pending attempt at rest: this is a persisted-state
  presentation fixture, not proof of an asynchronous provider implementation.
- `tests/fixtures/staff-orders-server.js` exposes that fixed test-only seed on
  the disposable loopback fixture. It is never mounted by production runtime.
  Existing fixtures are unchanged unless the new endpoint is requested.
- Existing `src/views/pages/staff-orders.ejs` and tracking templates retain
  labeled approval, live status/errors, no-charge/no-fee explanations and minimum
  customer-visible outcomes. No template, CSS or snapshot change was necessary.

## Focused verification and reuse

Windows x64 / Node 24.22.1 / Playwright 1.64.1, locked Chromium 156.0.8078.4 and
Firefox 157.0 desktop. Approval and persisted-pending cases passed in both browsers.
The first run also verified private-data clearing but failed the mid-submission
expiry message expectation: actual alert was Administrative access is required.
After the production message correction and case-insensitive semantic recovery
assertion, both expiry paths passed in both browsers. Unaffected approval/pending
passes were retained rather than repeated. Syntax and diff checks passed.

```sh
node node_modules/@playwright/test/cli.js test -c playwright.staff-orders.config.js exceptions-presentation.spec.js --project=chromium-desktop --project=firefox-desktop
# After the focused expiry-copy correction:
node node_modules/@playwright/test/cli.js test -c playwright.staff-orders.config.js exceptions-presentation.spec.js --project=chromium-desktop --project=firefox-desktop --grep 'session expiry'
```

Reuse [BE-09](be-09-refunds.md) for full integer-cent reversal, permissions,
idempotency, rollback, immutable payment history and interrupted-response replay;
reuse [FE-05](fe-05-tracking.md) for independent customer cancellation/failed/retried
refund and no-show outcomes, [BE-05](be-05-follow-up.md) for pending/denied requests
and [TEST-02](test-02-checkout-acceptance.md) for committed receipts/payment recovery.
The affected refund-denial path was rerun here; these unrelated service and success
paths were not changed. Reuse does not claim new execution. See the
[refund integration guide](../demo-refund-design.md) for server responsibilities.

## Remaining acceptance

TEST-03 retains supported native browser/mobile coverage, reviewed light/dark
visual comparisons and axe, manual keyboard/zoom/contrast/screen-reader review,
applicable audit gates and integrated inventory/fulfillment/exception/notification
acceptance. No screenshot reference was generated or changed here; no new broad
axe, Lighthouse, native Safari or hosted result is claimed. The new focused cases
are reusable checkpoint coverage, not checkpoint completion. Existing private
noindex exceptions and final QA/INT/OPS requirements remain. No dependency,
migration, real account, real financial action or external sending was introduced.
