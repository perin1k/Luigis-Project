# BE-06 reporting API increment

Story: https://trello.com/c/4K7rYt9e. This increment adds genuine server aggregates,
not a completed dashboard or full card acceptance. It uses the existing demo
payment/refund allocations, purchased quotes, bookings and timestamps. No new
dependency, migration, provider evidence, external service or financial action.

`src/staff/analytics-service.js` authorizes through the existing `analytics.read`
permission and persisted MFA admin session in the same synchronous transaction as
the reads. Employees, invalid/expired sessions and missing MFA cannot obtain a
report. `src/staff/orders-router.js` adds GET `/api/staff/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD`
under its direct HTTPS, pinned host/origin, fetch-site, no-store/noindex and cookie
guards. Exactly two valid calendar dates are required, in ascending order, with
at most 366 inclusive days and four-digit years 1000–9999. SQL is fixed; no caller
can submit a role, total or grouping expression. `src/app.js` and `src/server.js`
wire the service only through the configured staff runtime. Public HTTP does not
gain staff access. No contact, order identifier, card or secret link is returned.

## Metric contract

- All date filters are inclusive **America/Chicago calendar dates**, using the
  existing timezone helper rather than a fixed UTC offset. Payments after UTC
  midnight may still belong to the previous Central date. Dates and original
  timestamps are never rewritten.
- `objPeriod` sums actual signed allocation components by their own effective
  dates. Item, tax, tip and net recorded cents stay separate. `centsRefunds` is a
  positive total of confirmed negative reversals in the period, including refunds
  of older purchases. Original-period payments stay on their original dates.
  Pending cancellations are surfaced separately, not represented as completed
  refunds. Processor cost and retained cancellation recovery are explicitly zero
  under the approved no-fee full-demo-refund policy, not estimates of live costs.
- `objPaymentCohort` includes payments dated in the range whose current order is
  not Cancelled. Paid no-shows remain eligible. Net item allocations for that
  cohort include later reversals, so a later cancellation/refund can revise the
  earlier cohort. No eligible orders gives a null average; cent averages use
  half-up integer division. Tax and tips do not enter item AOV. Unsafe monetary
  aggregate precision returns 422 rather than a rounded financial result.
- `objPickup` groups promised pickup times into local hours (0–23), independently
  of payment date. Order counts include separate cancellation and Not collected
  counts. Non-cancelled ready-time coverage and missing-time counts are explicit;
  only known ready times enter on-time counts. Received-to-Ready minutes use actual
  elapsed instants, including overnight waiting, and only valid timestamp pairs.
  No measured pair gives a null average. Missing pickup times are counted for the
  payment-date cohort because those orders have no pickup date to filter.

This API deliberately reports the current `luigis-demo-v1` ledger. Future real
provider records need separately reviewed integration. It scans the small demo
history inside one synchronous transaction; large-scale reporting/index changes
are not claimed. Best-selling quantity/reversal details, dashboard integration,
browser/visual/manual acceptance and any remaining full-card requirements stay
open. No existing customer/staff HTML, CSS or browser module changes in this
increment; no new page or SEO exception is introduced.

## Verification

`tests/unit/analytics-service.test.js` exercises actual app payments, cancellation,
refund and no-show writes with isolated staff sessions. It covers next-day
refunds, excluded cancelled cohorts, null averages, invalid/extra/range inputs,
UTC/Central boundaries, missing MFA, employee/expired-session denial, pickup hour
grouping and timing coverage. The HTTP fixture mounts the real service;
`tests/unit/staff-orders-http.test.js` checks admin success, employee/unauthenticated/
wrong-origin denial, no-store and absence of private customer/card/link fields.
Existing scheduling tests cover the shared timezone helper's daylight-saving
behavior. Run `npm run test:unit` to reproduce the full server regression suite.

There is no new browser component or HTML page to visually audit in this bounded
API increment. Browser, Lighthouse and manual acceptance for the future dashboard
are still required before accepting the full BE-06 story. This does not waive
those gates or claim a completed UI. Syntax, content and focused diff review apply
here; keep the Trello card open.
