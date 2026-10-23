# BE-06 sales reporting and owner dashboard

Story: https://trello.com/c/4K7rYt9e. The initial API increment added genuine server aggregates. The dashboard
follow-up below connects them to a private owner page; full acceptance is still
pending. It uses the existing demo
payment/refund allocations, purchased quotes, bookings and timestamps. No new
dependency, migration, provider evidence, external service or financial action.

`src/staff/analytics-service.js` authorizes through the existing `analytics.read`
permission and persisted MFA Owner session in the same synchronous transaction as
the reads. Admins, Employees, invalid/expired sessions and missing MFA cannot obtain a
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
- `objPickup.arrDates` groups promised pickups by America/Chicago calendar date
  (`strDate`, chronological order). `arrWeekdays` groups those same pickups by ISO
  weekday (`intWeekday` 1=Monday through 7=Sunday, `strWeekday` English label),
  ordered Monday–Sunday. Each returns `intOrders`, `intCancelled`, `intNotCollected`,
  matching the existing hourly semantics: total includes all outcomes while the
  two exceptional outcomes are counted separately. Empty periods return empty
  arrays, not invented observations. Derive weekdays from the Central date before
  calendar arithmetic, preserving UTC-midnight and daylight-saving boundaries.
  FE-06 displays these date/weekday trends alongside the hourly table.
  `intCompletedOrders` counts paid orders whose current outcome is Completed,
  filtered by promised pickup date, separately from active orders.
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
are not claimed. The initial API increment changed no browser component. The follow-up below
adds the dashboard and quantity breakdown; full browser/manual acceptance remains
open.

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

The initial API-only increment required no new page audit. Dashboard verification
and remaining gates are recorded in the follow-up evidence below. Keep the card
open until the mandatory acceptance checks are met.

## Owner dashboard follow-up — October 22

`src/views/pages/staff-analytics.ejs` provides `/staff/analytics`, using the same
server-authorized report and native GET date filters. No new browser script,
charting library or client-side financial authority is introduced. The route in
`src/staff/orders-router.js` inherits direct HTTPS, origin/host, session, no-store
and noindex guards. Unauthorized/expired sessions receive a private-data-free
403 error page. Invalid date ranges return an accessible error and preserved
filter fields, without displaying a stale report. Default dates use the current
Central day; submitted dates are revalidated by the service.

FE-06 adds Today, Last 7 Days and Last 30 Days native links alongside the custom
form. `readDateRanges` uses the authorized session's clock and inclusive Central
calendar dates; calendar subtraction avoids treating a daylight-saving day as
exactly 24 hours. Links and filtering work without dashboard JavaScript after
sign-in; authentication retains its existing JavaScript requirements.

The page renders captioned date, weekday and hour pickup tables, with exceptional
outcomes in separate columns. Completed collections are labeled by their pickup
date scope. On-time percentage is explicitly limited to recorded ready times;
missing observations stay visible and are never treated as on-time orders.
Received-to-Ready remains elapsed order time, not measured cooking time. Empty
reports show no invented buckets and an unavailable percentage rather than 0%.
See [FE-06 focused verification](verification/fe-06-analytics.md); native visual,
manual accessibility and applicable audit acceptance remain with TEST-03.

The admin order queue now exposes an Owner sales navigation link, using the
persisted session role in `src/staff/orders-service.js`; employees do not receive
this navigation or reporting permission. `src/public/css/staff.css` adds scoped
responsive definition lists and tables, with normal-sized table row labels and
compact headings on mobile. Tables have captions and native scoped headers;
missing values remain explicit rather than appearing as measured zeros.

`arrBestSellers` uses order-line recipe, topping, crust, beverage and size snapshots,
not the current menu. Matching purchased snapshots are grouped across price changes
and ranked by net quantity, then label. Sales count on payment dates; the approved
full refund reverses every purchased line quantity on its confirmation date.
Refund-only periods can therefore have negative net quantities. Purchased and
refunded quantities remain separate columns, and paid no-shows are retained.
Cancelled orders awaiting a refund remain visible as an unresolved case rather
than being represented as confirmed quantity reversals. No partial-refund rule
or guessed recipe is added.

The user explicitly approved the SEO-only exception for this new private page on
October 22: retain noindex; all other gates still apply. See
[dashboard verification](verification/be-06-dashboard.md). This does not waive
Firefox or manual accessibility acceptance and makes no deployment claim.
