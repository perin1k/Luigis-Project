# BE-05 — private tracking and administrator decisions

Story: https://trello.com/c/HwkXU6Mn. Completes the current demonstration's guest
progress access and normal administrative exceptions alongside the separately
committed staff status workflow. No new dependency, migration or real account.

## Files and integration

- `src/tracking/tracking-service.js` issues a cryptographically random 256-bit
  token after genuine successful demo payment. Only SHA-256 digests enter the
  existing tracking_grants table. Its issuance runs inside the payment transaction;
  failure rolls back payment, capacity confirmation and Received. Raw links are
  returned once, not reconstructed from stored data or replayed payments.
- `src/payments/demo-payment-service.js` calls that internal issuance seam only
  after successful confirmation. `src/server.js` wires tracking into payment and
  the app; `src/app.js` mounts tracking routes and compresses its browser module.
  `src/public/js/ordering/order-wizard.js` renders the validated relative private
  link in the confirmed receipt using safe DOM creation. Interrupted/replayed
  payment responses still recover the same payment; a missing/lost tracking link
  requires the approved administrator-reviewed replacement, not an automated
  order-number/contact lookup. No token is added to order browser storage.
- `src/tracking/tracking-router.js` serves a data-free `/track` shell. The secret
  stays in a URL fragment, never in the server request URL or referrer. POST
  `/api/tracking` accepts only `{strToken}` in bounded JSON, enforces actual HTTPS
  (or localhost development), exact same Origin and cross-site rejection. Missing,
  invalid, revoked and expired grants return the same 404. No-store/noindex and
  no-referrer headers apply. Errors never disclose records, tokens or stack traces.
- `src/views/pages/tracking.ejs` and `src/public/js/tracking.js` display only public
  reference, service, status, original promised time, a generic review warning and
  sequenced progress timestamps. No contact, item/payment totals, card information,
  admin identity/notes, cancellation reasons or token digest are returned. Explicit
  refresh has timeout/error/status states. Changing the link clears old content;
  response generations prevent an older request overwriting the new order. Native
  skip/back-to-top actions preserve the token fragment while moving focus. No
  automatic polling or local/session storage is used.
- `src/staff/order-exception-service.js` uses existing `cancellation.decide` admin
  permission and the same synchronous session/SQLite transaction for current
  revision validation, decisions, status timestamps, sequenced event, capacity
  release and sanitized audit. Existing MFA, disabled/revoked/expired/recovery-lock
  checks apply. Employees cannot decide, replace links or promote themselves.
- `src/staff/orders-router.js` adds authenticated CSRF-protected JSON POST paths
  `/api/staff/orders/:reference/exception` and `/tracking-replacement`. These reuse
  direct-TLS/pinned-origin transport. Exception body is `{intRevision,strAction}`;
  actions are `cancel`, `deny-cancellation`, `resolve-review`, `not-collected`.
  Replacement requires `{bReviewed:true}` plus real admin authorization; the body
  alone grants no permission. No browser-supplied role/identity is accepted.
- Authorized detail now includes `bCanAdminister`, derived from the session.
  `staff-orders.ejs` renders admin review controls only for admins; `staff-orders.js`
  requires an explicit review checkbox, handles conflict/uncertain-save recovery,
  and clears private results/links when a session is denied. Refresh resets review
  confirmation and enables a fresh decision only after authoritative data loads.
- Unit/HTTPS, staff and payment browser fixtures use isolated invented data and
  real application writes. `tests/audit-order-tracking.js` audits the HTTPS fixture
  after real synthetic admin MFA; retained reports omit cookies and token URLs.

## Policy and recovery boundaries

Cancellation approves the pending request, or records a restaurant-caused request,
marks Cancelled and releases active/confirmed capacity atomically. It does not
claim a refund, alter payment history or fabricate a provider transaction. The UI
explicitly requires separate refund review. Denial clears the pending request.
Admins may resolve hours/inventory reviews, but ordinary preparation still checks
availability/capacity. Late-payment booking recovery is not silently bypassed;
admins can cancel if fulfillment is impossible. Not collected requires a prepared
state, the stored service day's closing instant, and no pending cancellation. It
releases capacity, records its own outcome and never generates an automatic refund.
Current exception/issuance adapters operate on confirmed demonstration payments;
future provider processing remains separately scoped.

Tracking validity is enforced at every read: normally seven days after a final
outcome, extended while cancellation/refund cases remain unresolved and until at
least seven days after resolution. An approved cancellation without a successful
refund record remains unresolved. BE-09 now supplies actual persisted demonstration
refund handling; see [the refund guide](demo-refund-design.md). Confirmed demo
refunds resolve the case, while failed/pending attempts do not.
Final-state deadlines are derived from persisted outcome/decision/refund times,
not the visitor clock. Existing explicit grant expiry is a hard cap. Replacement
revokes the current grant, preserves any explicit cap and does not reset the
order-derived retention clock; its audit contains no raw link. Computed deadlines
are not frozen at replacement while a later pending-case extension may be needed.
The raw link appears only in its response/link and caller memory. No email/SMS is
sent, no contact recovery is automatic, and grant access enforcement is distinct
from background contact/preview deletion jobs and broader retention work.

Private tracking retains noindex. On October 22 the user explicitly approved its
SEO-only exception; other quality gates still apply. The public HTTP customer
preview may offer guest tracking locally but never staff/admin access. Production
requires the existing operator-owned HTTPS/account configuration. No deployment,
merchant setup or real credentials are created by this increment.

The BE-05 follow-up adds lossless cached public-asset Brotli encoding, a combined
tracking stylesheet, explicit natural-order refresh focus and a second
request-generation check after JSON parsing; see
[follow-up verification](verification/be-05-follow-up.md). Its automated keyboard
checks complement the outstanding manual accessibility acceptance.

## FE-10 connected scheduled-order messages

Protected tracking now also returns `strCancellationState` (`none`, `pending`,
`approved`, `denied`) from the latest persisted request and `bInventoryIssue` from
an open inventory review (or its retained history on a cancelled order). No reason,
ingredient identity, contact, amount, staff note or actor is exposed. These fields
are read inside the same transaction and private-grant/deadline checks as progress.
Resolved inventory reviews on active orders no longer show an active issue.

The browser renders safe text nodes: a generic ingredient apology and whole-order
review boundary, plus separate cancellation and demonstration-refund messages.
Cancellation approval does not assert refund success. Existing no-store, noindex,
fragment handling, revocation and retention remain intact. The read-only EJS status
partial remains available to server-rendered consumers; guest tracking uses its
existing browser renderer and genuine persisted records, not fixture examples.
