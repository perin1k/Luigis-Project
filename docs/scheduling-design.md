# BE-10 — pickup selection and atomic capacity holds

Current integrated-service reconciliation is recorded in
[the BE-10/FE-10 focused increment](verification/be-10-fe-10-increment.md).
The original scheduling-only scope below does not imply that later payment,
inventory, refund or retention services are missing.

This approved increment connects BE-02 unpaid order persistence to scheduling.
It does not confirm payment, start preparation, issue refunds or complete BE-10.

## Files and responsibilities

- `src/ordering/scheduling-service.js`: Chicago-time service dates and normal
  hours, stored closed/special-day overrides, available scheduled/ASAP instants,
  rolling capacity checks, transactional booking/hold writes, derived hold status.
- `src/ordering/scheduling-router.js`: no-store `GET /api/pickup-times?pizzas=1`
  (one integer quantity from 1–6). Responses contain timezone, server check time
  and selection records; no customer data or reservation is created by this GET.
- `src/ordering/order-service.js`: with a scheduling service configured, requires
  `objPickup`, includes it in request identity, and reserves capacity before quote
  acceptance within the same `BEGIN IMMEDIATE` transaction. Any conflict rolls
  back order, contact, lines, quote and reservation together. Identical retries
  return the original booking/hold without renewing or duplicating it.
- `src/app.js` and `src/server.js`: expose scheduling with the configured database
  and wire the same service into order submission. Legacy isolated pricing-only
  and presentation fixtures remain explicitly unconfigured for scheduling.
- `src/views/partials/ordering/order-review.ejs`, `payment.ejs`, the order page and
  browser wizard: explicit ready-time selection, Central-time labels, refresh,
  loading/error/reselection states and an unpaid hold receipt. The server remains
  authoritative; the browser clock never establishes availability. Superseded
  refresh responses are ignored. Unavailable/expired selections require review.
- `tests/unit/scheduling-service.test.js`, `scheduling-concurrency.test.js` and
  the isolated scheduling browser fixture/config/suite cover boundaries,
  competing connections and UI recovery. No dependencies or migrations added.

## Rules and transaction boundary

Normal service is daily 10:00–23:00 America/Chicago, cutoff 22:30, latest ready
22:50. Exactly at cutoff is eligible; times after cutoff move to the next open
service day. The minimum lead is 20 minutes from the server clock. Before opening,
that day's opening can be offered if it meets lead/capacity. Stored service-day
rows override normal hours and closed days; existing schema requires special
cutoff/latest ready to be closing minus 30/10 minutes.

Scheduled options advance 20 minutes from the service day's opening, ending at
or before latest pickup (normally 22:40 on that grid). ASAP is the earliest
capacity-feasible instant with at least 20 minutes lead, rounded up to a minute
for a usable review interval; it need not align to the scheduled grid. Submission
rechecks that an ASAP selection is still earliest and available. Crossing that
review interval can therefore require a refreshed explicit selection.

Options cover the earliest eligible day with capacity, not a multi-day advance
booking calendar. The next-open-day safety search is bounded to 366 days; if no
options exist, return a recoverable unavailable result. It is not a booking horizon
promise. Default day instants use explicit Chicago timezone conversion, including
DST; no developer-machine timezone is used. Default schedules are materialized
only when an order is reserved; public option reads do not write.

Every size counts as one pizza equivalent. Active unexpired holds and confirmed
bookings consume capacity. For a candidate promise, sort relevant promises and
slide a half-open 20-minute span; no span may contain more than six pizzas. Fixed
clock buckets alone are insufficient. Exactly 20 minutes apart do not overlap.
ASAP candidates advance to the instants where existing promises leave the span.

SQLite's immediate write transaction serializes rechecks and writes across
connections. The retained capacity-window row starts at the booking promise; the
cross-window rolling check is enforced by the service, not by that row alone.
Other future reservation writers must use this same serialized rule. The six-unit
rule is a conservative approved demo assumption, not measured restaurant throughput.

Each accepted hold expires exactly 30 minutes after the shared order/quote creation
instant. Option reads and idempotent responses treat expiration inclusively, without
requiring a worker. Successful new reservations also mark elapsed active holds
expired. A replay never extends a hold; expired/released status is returned to the
browser, which requires new review and a new checkout request. Confirmed holds keep
consuming after their original expiry until a later lifecycle operation releases
them. No hold confirmation is performed here.

## API and remaining integration

`objPickup` has exactly `strServiceDate` (Chicago YYYY-MM-DD), `intRevision`
(service-day revision), `strSelectionType` (`ASAP`/`scheduled`) and `dtPromisedAt`
(canonical UTC ISO timestamp). These are selection hints, not trusted authorization.
Unknown fields, invalid dates, stale revisions, lead/cutoff/capacity conflicts and
unavailable choices are rejected. Changed availability returns 409 `pickup_changed`.
Order responses include `objPickup` with preserved promised/expiry instants and
current derived hold state. The opaque order reference grants no tracking access.

The current demonstration payment service rechecks the persisted quote, hold,
capacity, service-day cutoff and ingredient/price availability before confirming
fulfillment. Exactly at cutoff is allowed; a later unprocessed payment returns
409 `checkout_closed` and releases its active capacity hold. The customer returns
to pickup review with choices preserved. A replay of an already committed payment
returns its receipt even after cutoff; it does not attempt another payment.

Payment failure/expiry release, menu/hours-change review, pre-preparation inventory
checks, administrator-reviewed cancellation, separate full demo refunds, tracking
and retention cleanup now have implementations in their respective services.
Owner schedule editing is described in [menu management](menu-management-design.md).
The local payment adapter is synchronous: do not claim that asynchronous provider
callbacks or late-provider-success handling were exercised. Real provider support
remains future PAY-01 scope. Public requests cannot edit stored schedule overrides.
Full connected acceptance remains on TEST-02/TEST-03 and final integrated QA;
implemented services alone do not certify card completion or deployment.
