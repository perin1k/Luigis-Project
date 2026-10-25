# BE-09 demonstration cancellation and refunds

Story: https://trello.com/c/ZbHyVm4H. This extends BE-03 payments and BE-05
exceptions; their existing implementation and the team's reviewed storage remain
intact. No real money moves and no Stripe outcome is represented.

## Behavior and integration points

- `src/tracking/tracking-service.js` accepts customer cancellation through a valid,
  unexpired protected grant while an order is Received. A synchronous transaction
  records a pending request, revision and event. Repeats return the same pending
  state; starting preparation and requesting cancellation serialize against each
  other. Pending requests hold preparation until an administrator approves or
  denies them, with no timeout decision. Existing restaurant exceptions and
  prepared no-show handling remain in `src/staff/order-exception-service.js`.
- `src/payments/demo-refund-service.js` requires an active admin session with MFA,
  a matching confirmed demonstration payment, approved cancellation and current
  order revision. It records pending then succeeded/failed local-adapter outcomes,
  audit/events, exact item/tax/tip reversals and pending internal notifications in
  one transaction. The adapter is deliberately synchronous and local: no remote
  transfer is held across a SQLite transaction. Any failed write rolls back all
  of this attempt. The default local adapter succeeds; isolated tests inject a
  failure. There is no asynchronous provider reconciliation worker.
- `src/payments/demo-payment-service.js` records original positive allocations
  when confirmation commits. Original payment status/history is preserved after
  refunds. Full refunds use the purchased quote, including tip and tax, without
  re-pricing or a fee deduction. Net recorded cents are the sum of append-only
  components, not an invented analytics figure.
- `src/staff/orders-service.js` exposes full refund amount/state/net only to admins
  on detail reads; employees and queue listings receive no financial fields.
  Final orders no longer show an obsolete unconfirmed-capacity warning after
  cancellation correctly releases their hold; active-order safeguards remain.
  `src/staff/orders-router.js` adds POST `/api/staff/orders/:reference/refund` under
  the existing direct HTTPS, pinned origin, session, CSRF and bounded JSON guards.
  Its body is exactly `{intRevision,strRequestId}`: a positive safe revision and
  UUID v4 request key. No caller-supplied amount, role or outcome is accepted.
- `src/tracking/tracking-router.js` adds POST `/api/tracking/cancellation`, exactly
  `{strToken}`, with the existing same-origin, bounded JSON and TLS/loopback rules.
  Public order numbers cannot authorize cancellation. Tracking reveals only the
  resulting state, not contacts, amounts, staff identities or adapter evidence.
- `src/views/pages/staff-orders.ejs` and `src/public/js/staff-orders.js` implement
  explicit admin review, distinct cancellation/refund states, failed attempts,
  authoritative refresh and safe retry. A lost response retains the request UUID
  in page memory: “Check refund result” replays it. Refresh can clear this key
  because persisted pending/success guards prevent a second successful refund.
  A failed attempt needs a fresh review and new key. No grant or request key goes
  into browser storage.
- `src/views/pages/tracking.ejs` and `src/public/js/tracking.js` implement customer
  review and cancellation requests. Generation checks prevent superseded links'
  responses from repainting either progress or cancellation status. `staff.css`
  reserves loading space and sizes the new checkbox controls. `src/server.js`
  wires refunds only into the configured staff runtime; the public HTTP preview
  does not expose staff routes or credentials.

Same-key retries return the persisted result, including failure; cross-order key
reuse conflicts. A different key after success still returns the one successful
refund. A persisted pending attempt blocks a new attempt and requires review;
the current atomic local adapter normally leaves no pending attempt at rest.
Future remote adapters need a separately designed durable reconciliation flow.

## Migration, retention and recovery

`src/data/migrations/012-demo-refunds.sql`, registered in `migrations.js`, adds
separate demo attempts and allocations. Guards require matching confirmed full
payments, approved cancellations and active admins; partial unique indexes allow
only one pending and one successful refund per payment. Request identity and final
outcomes cannot be rewritten; allocations cannot be updated/deleted and must
match quote components and original confirmation times. It backfills components
of existing successful demo payments without changing those payment records.
Versions 001–011 remain immutable. The migration runs transactionally through the
existing checksum registry; tests verify a real v11-to-v12 upgrade and rerun.

Recovery is forward-only: diagnose and add a reviewed corrective migration if
needed. Do not delete financial history or apply a destructive down migration.
Do not run an old writer against upgraded demo operations: it would omit the new
allocation writes. This does not change the approved disposable-data/no-backup
policy or promise operational recovery guarantees.

Confirmed demo refunds now resolve the cancellation case for tracking access.
Failed/pending refunds remain unresolved; access continues until seven days after
actual final resolution, subject to an existing explicit grant cap. This is read
authorization, not background deletion of contacts/previews. Cancellation and
refund notifications are genuine event-linked **pending outbox records** only;
BE-11 now renders restricted internal previews and enforces their expiry; see
[the notification guide](notification-preview-design.md). Broader contact cleanup
remains separately scoped.
No external message is sent or marked delivered.

See [verification](verification/be-09-refunds.md) for coverage and remaining gates.
