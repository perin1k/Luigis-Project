# BE-05 — staff fulfillment progress increment

Story: https://trello.com/c/HwkXU6Mn. This increment adds staff progress writes to
BE-04's queue/detail. Guest private-link tracking, administrator decisions and Not collected are now
implemented in the companion [tracking/exception guide](tracking-and-exceptions.md).
Refund processing, booking recovery and background retention remain separate work. It does not implement the entire card or alter payment/refund
states. No migration, dependency, real account creation or deployment is required.

## Integration and file guide

- `src/staff/order-progress-service.js` authorizes `orders.prepare` through the
  existing individual-session service. Authorization, current revision/payment,
  hold/recipe checks, status/timestamp/revision write and append-only order event
  share one synchronous SQLite transaction. A failed event insert rolls back the
  status write. Employee/admin identity comes from the persisted session.
- `src/staff/orders-router.js` adds GET `/api/staff/orders/csrf` and POST
  `/api/staff/orders/:reference/progress`. The existing direct-TLS, pinned-host,
  same-origin, no-store/noindex boundary applies. The CSRF token is HMAC-bound to
  existing auth cookies with a separate ephemeral router key; authenticated GET
  sets a secure HttpOnly Strict cookie if missing. POST additionally requires exact
  Origin, JSON, a valid CSRF header and a body limited to 1 KiB. JSON parsing errors
  return safe 400/413; invalid media type 415; missing session 401; guards/stale
  revision 409; unknown/unpaid order 404; unexpected write failure sanitized 503.
- `src/staff/orders-service.js` adds the persisted `intRevision` to authorized
  detail output; queue data stays unchanged. `src/app.js`/`src/server.js` wire the
  progress service only with the existing configured direct-HTTPS auth runtime.
- `src/views/pages/staff-orders.ejs` adds a progressively enabled next-step button
  and JavaScript-required instruction. Read-only native forms/links remain usable.
  `src/public/js/staff-orders.js` enables only the next status, disables held-order
  actions and requires explicit refresh after every save attempt. This prevents a
  double click or an uncertain network result from blindly moving another step.
  Refresh obtains the authoritative revision/status. Expired sessions clear private
  detail and hide writes; status/error messages announce outcomes. No PII/token is
  saved in browser storage. Existing stylesheet tokens/buttons are reused.
- `tests/unit/order-progress.test.js`, expanded HTTP and staff browser tests verify
  these behaviors with disposable real auth/payment/order fixtures. The shared
  fixture now mounts progress; production never imports fixtures. New
  `detail-progress-*` browser baselines document the intentionally changed page;
  original BE-04 references remain historical and are not blindly overwritten.

## State and consistency rules

Only Received → Preparing → Baking → Ready → Completed is supported here. The
request contains exactly `intRevision` (positive safe integer) and `strStatus`.
The server rejects skips, backwards moves, terminal changes and stale retries.
A successful response returns the new revision/status and server UTC timestamp.
It appends a sequenced event with the actual actor and preserves prior timestamps.
No administrator can bypass holds through this ordinary staff endpoint.

Every transition requires a successful payment matching the accepted quote and
no pending cancellation or open fulfillment review. Starting Preparing also
requires confirmed booking capacity and rechecks availability of purchased
pizza base/crust/topping/drink ingredients against their original catalog mappings.
It never reprices purchased items or silently substitutes unavailable ingredients.
The synchronous transaction serializes checks against concurrent record changes.
Later administrator review decisions must use the same transaction discipline.

A revision conflict reports that the order changed; the user refreshes and reviews
its current state. A repeated successful request returns conflict rather than
creating a second event. Any uncertain failure also requires refresh. There is no
automatic advancement/retry, notification sending, refund or capacity release.
Completed records leave the active queue while authorized history remains readable.
