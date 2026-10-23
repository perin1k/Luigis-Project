# BE-02 — order submission and persistence

The submission service saves reviewed order details without confirming a restaurant
order. The configured runtime now connects [scheduling](scheduling-design.md),
[demonstration payment](demo-payment-design.md),
[private tracking](tracking-and-exceptions.md) and
[retention cleanup](retention-enforcement.md). These are existing contributor
implementations, not new work supplied by this documentation update.
See [current focused verification](verification/be-02-persistence.md).
Full BE-02 acceptance remains on TEST-02; local implementation readiness is not Done.

## File guide and integration

- `src/ordering/order-service.js` validates the approved contact requirements,
  obtains the database write lock, rechecks the authoritative catalog/pricing,
  inserts complete nested line/contact snapshots and accepts the matching quote.
  Any failure rolls back the whole transaction. Existing immutable-snapshot
  triggers remain unchanged. No new migration or dependency is needed.
- `src/ordering/catalog-service.js` can participate in the caller's synchronous
  transaction using its server-only `bWithinTransaction` option. The order
  service must own that transaction; it never trusts this flag from HTTP input.
  Standalone public pricing still owns its read transaction.
- `src/ordering/order-router.js` exposes only `POST /api/orders`, requiring
  same-origin JSON (8 KiB, no compression). It rejects cross-site requests and
  unencrypted non-loopback hosts, returns safe errors and no-store responses,
  and never exposes contact details or a public order lookup.
- `src/app.js` mounts submission only when supplied an order service;
  `src/server.js` supplies it with a configured database. Authentication keeps
  its existing HTTPS requirements. Public deployment still needs its own review.
- `src/public/js/ordering/order-wizard.js` sends the reviewed cart/contact data,
  retains a request UUID through retries, and announces saved-but-unpaid status.
  A failed/lost response preserves input. When demonstration payment is configured,
  it proceeds through the real server adapter and shows confirmation only after
  committed payment/order state; an isolated submission-only fixture remains
  explicitly unconfirmed. The details/payment partials show the dine-in email
  alternative and the unpaid status before payment. Demonstration data disclosures
  remain part of the configured checkout.

## Request contract

The exact root keys are `strRequestId` (random UUID v4), `strService`
(`carry-out`/`dine-in`), `objContact` and `objPricing`. Contact has exactly
`strName`, `strPhone`, `strEmail`; pricing uses the BE-01 preview contract.
Name is trimmed, 1–100 characters; control/format characters are rejected.
Provided phone/email fields are syntax/length checked, not verified deliverable.
Carry-out needs a phone; dine-in needs a phone or email. Both need a name.
No submitted monetary total or payment success is accepted. With scheduling
configured, an additional `objPickup` root field is required and validated against
the server schedule/capacity; see the scheduling contract.

A new order returns 201; the identical request retried returns 200 and the same
opaque public reference. Reusing the request UUID with different content returns
409. A digest of the request UUID and normalized request is the internal quote
identifier, so no raw request/contact copy is stored for idempotency. The UUID is
an unguessable retry capability: keep it private. It is not a tracking grant or
authentication token. Retries are checked before the current catalog, preserving
an already accepted price even after menu changes. The current contract compares
serialized pricing content, so clients must preserve their request on retry.

The browser keeps only the current pending request in memory, not local storage;
refreshing loses the cart/retry capability. Editing creates a new request; this
can leave previous unpaid records, not a second confirmed order or charge.
The configured retention lifecycle handles abandoned checkout contacts under the
approved policy, preserving sanitized financial/order history. The 30-minute quote
expiry does not extend when retried. The isolated BE-02 service alone creates no
capacity hold; configured BE-10 creates one atomically. Before payment, fulfillment
status remains NULL with no Received timestamp or confirmation. The demonstration
payment service independently enforces expiry, cutoff, capacity, prices and
availability; a submission replay is never proof of payment. Committed payment
confirms the hold and Received state, records its event/notification intent and
issues protected tracking access through the configured services. Internal preview
notifications do not prove external delivery, and no real money moves.

The simple explicit persistence service reuses existing schema invariants rather
than introducing another draft store or framework. It intentionally leaves
checkout orchestration to the separate scheduling/payment services. This keeps
submission independently testable while the configured runtime joins the services.
Remaining connected browser/platform/accessibility and release gates stay explicit
on TEST-02 and final QA rather than being inferred from storage primitives.
