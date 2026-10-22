# BE-04 — authorized employee order queue

The original BE-04 read-only increment connects the existing individual staff sessions and
orders.read permission to genuine paid-order records. It adds no staff accounts,
status mutation, payment administration, dependency or migration.

## File guide and security boundary

- `src/staff/orders-service.js` uses session-service `executeAuthorized` for every
  queue/detail read. Authorization and database reads share its synchronous
  transaction, including disabled/revoked/expired/recovery-locked staff checks and
  admin MFA. No role, identity or permission is trusted from the browser.
- `src/staff/orders-router.js` exposes HTML `/staff/orders` and
  `/staff/orders/:reference`, plus JSON `/api/staff/orders` and its detail path.
  All require direct TLS, the existing exact staff origin/host, safe cookie parsing
  and same-origin/none Fetch Metadata when supplied. Forwarded headers confer no
  HTTPS identity. Responses are no-store, no-referrer and noindex/nofollow. HTML
  session failures redirect to sign-in; JSON failures return 401. Unknown paid
  references return 404; invalid filters 400; unexpected errors sanitized 503.
- `src/app.js` mounts the queue only when both auth runtime and queue service are
  configured. `src/server.js` creates it only with the existing HTTPS auth runtime.
  The public database-only HTTP preview never exposes queue records. No auth
  requirement is weakened to make a private-page preview convenient.
- `src/views/pages/staff-orders.ejs` server-renders queue, filters, pagination and
  preparation detail with escaped dynamic text. Date/status filtering, native
  page/detail links and contact access work without browser JavaScript. The staff
  account page gains an authorized queue navigation link when configured.
- `src/public/js/staff-orders.js` progressively adds explicit refresh, busy/status
  announcements and safe error recovery using JSON and textContent. Authentication,
  malformed-session or missing-detail responses clear previously rendered private
  records and show sign-in recovery. Transient network failure preserves explicitly
  stale prior data. No order/contact data is stored in browser storage; no automatic
  polling refreshes a session indefinitely.
- `src/public/css/staff.css` adds scoped responsive filters and wrapping references
  using existing semantic tokens. The existing staff bundle includes these styles.
- Tests use the real auth, order and demo-payment services with invented contacts
  and disposable HTTPS sessions. Optional composition in the shared staff fixture
  preserves its original behavior for existing tests; production imports no test
  fixture. New unit/HTTP/browser files and `playwright.staff-orders.config.js` cover
  the feature; `tests/audit-staff-orders.js` emits sanitized Lighthouse summaries.

## Queue behavior and returned data

Default queue shows all active Received/Preparing/Baking/Ready orders with an
accepted quote and a successful matching demo payment or existing provider-test
payment. Unpaid/failed orders cannot become operational queue entries merely by
setting a fulfillment status. Completed/cancelled/not-collected records are absent
from the active queue; authorized staff may read a paid historical detail directly.

Sort by preserved promised instant then immutable internal order ID; missing
promises sort last and display a review warning. Each page contains 20 orders plus
a next-page flag. Optional filters are a valid Chicago service date and one active
status; page is a bounded nonnegative decimal integer. Default includes future and
past active promises so overdue work is not hidden by an implicit today-only filter.
Live pages are independent fresh reads, not a frozen multi-page snapshot.

Queue summaries return name, public reference, service/status, ready time, item
counts and operational warnings. No phone/email, totals, card details, ciphertext,
keys, staff credentials, session identity or admin analytics are included. Detail
adds purchased size/crust/topping/drink descriptions and one preferred contact
channel (phone, otherwise email), with name. Redacted contacts remain removed.
Public references are opaque identifiers for authorized staff lookup, not customer
tracking credentials; knowing one grants no access.

Warnings surface pending cancellation, open hours/inventory/late-payment reviews
and unconfirmed booking capacity. They expose no internal decision notes, customer
cancellation text or admin-only financial data. Ready-time-passed is a timing cue,
not an automatic cancellation/refund/no-show decision. BE-05/BE-09 still own state
changes and recovery; this UI provides no preparation/status buttons.

## Configuration and acceptance

Run with the previously reviewed direct-HTTPS authentication configuration and
operator-owned individual staff credentials. It creates no default password or
real enrollment material. The HTTP customer preview remains separate. Existing
staff SEO exception originally covered four auth pages. On October 22, 2026,
the user explicitly extended the SEO-only exception to this private queue and
order-detail page; both retain noindex. All other quality gates remain.

Reproduce server checks with `npm run test:unit`, browser checks with
`npx playwright test -c playwright.staff-orders.config.js`. Browser and Lighthouse
fixtures generate temporary self-signed certificates for isolated tests only;
ignore-certificate settings never apply to production. For the audit, start
`NODE_ENV=production node tests/fixtures/staff-orders-server.js`, then
`node tests/audit-staff-orders.js`; stop the fixture before Playwright starts it.
Do not use audit helpers against real accounts or publish their cookies.

BE-05 now adds separately authorized status controls; see
[the progress guide](order-progress-design.md) for write behavior and guards.
