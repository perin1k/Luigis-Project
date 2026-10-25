# SEC-02 disposable-demo retention enforcement

Story: https://trello.com/c/ehrcmOun. This implements the already approved
seven-day contact/grant/preview policy and the separate synthetic ciphertext
expiry policy. It is a scoped retention increment, not a claim that all privacy,
legal, operator or public-policy work is accepted. No real customer data or card
collection is enabled and no live database is cleaned by verification.

## Implementation and integration points

- `src/data/retention-service.js` uses the existing shared final-outcome/resolution
  deadline in `src/data/order-retention.js`. Completed, Cancelled and Not collected
  orders become eligible exactly seven days after the last applicable final
  outcome or case resolution. Pending cancellation or unresolved approved refund
  cases remain protected; a failed refund is not resolution. This uses elapsed
  UTC instants rather than seven local calendar midnights, matching existing
  protected tracking/preview reads.
- A synchronous transaction redacts name/phone/email, records `redacted_at`,
  deletes the order's tracking grants and outbox records, and relies on the
  reviewed cascade to remove preview text. It appends only the existing sanitized
  `retention_cleanup` audit action, null system actor, opaque order ID, fixed
  reason/summary and correlation ID. There is no raw contact, token, message body
  or card content in the audit. An audit failure rolls back the entire batch.
- Order, purchased line/quote, booking, event, payment/refund and allocation history
  stays intact. Staff accounts/sessions and optional profile policies are not
  repurposed as disposable order contacts. Analytics still uses preserved facts.
- Each invocation changes at most 50 eligible orders and independently removes
  at most 50 expired `demo_payment_secrets` rows. Ciphertext's approved lifetime is
  seven days after the attempt, independent of an unresolved order case; masked
  payment/evidence history is retained. External encryption keys are not deleted
  or rotated by this worker. No full synthetic number is decrypted for cleanup.
- Explicit grant caps on active/unresolved orders are preserved, even after an
  individual grant expires. Erasing that cap early could let manual replacement
  forget it. All grant rows are removed only at the order-derived final deadline,
  when replacement is independently prohibited by the same deadline. No new
  grant or retention extension is created by cleanup.
- `src/server.js` runs cleanup on configured database startup and every minute,
  before initial preview generation. Its unref'ed timer is cleared before the
  database closes. Failure logs only a fixed message. There is no public/manual
  HTTP cleanup endpoint and no browser-provided clock or cutoff. The demo scans
  final orders with remaining private records to select eligible work; the
  mutation cap does not claim a bounded history scan or production-scale worker.
- `src/staff/orders-service.js` now checks the shared deadline before returning
  final-order contact names/phone/email, as tracking and notification reads
  already do. Expired details remain hidden if deletion is delayed or rolls back.
  Active and unresolved-case contacts retain their existing permitted staff
  access. No page, style, browser script, permission, dependency or schema change.

Repeated successful runs are no-ops for already cleaned records, preserving the
original redaction time and avoiding duplicate audit events. If a batch fails,
records remain transactionally consistent and the next timer invocation retries.
Do not restore old contact/grant snapshots or treat record deletion as guaranteed
secure physical erasure of SQLite pages, filesystem snapshots or external copies.
No application-managed backup or hosted recovery guarantee is introduced.

## Approved unpaid-checkout refinement (October 22, 2026)

Saved unpaid orders with no fulfillment status now use seven days after accepted
checkout expiry or the latest confirmed payment failure, whichever is later.
Capacity-hold expiry and resolved case timestamps can extend that baseline; a
confirmed hold, pending/successful payment, open fulfillment review or unresolved
cancellation/refund case prevents abandoned-checkout cleanup. Missing accepted
quotes fail conservatively without deletion. Paid active orders keep their
existing lifecycle. The same transaction, audit and 50-order mutation cap apply;
no migration, financial-history deletion or public route is introduced.

The two additional retention tests verify the exact abandoned-checkout boundary,
preservation of quote/payment history, pending-payment protection and delayed
failure restarting the clock. See [the internal inventory](privacy-data-inventory.md)
for field purposes, access boundaries and unresolved privacy work.

## Verification and remaining work

`tests/unit/retention-service.test.js` exercises actual isolated demo orders,
payments, progress, cancellation and refunds. Four cases verify the millisecond
before/exact expiry boundary, read-time contact suppression before cleanup,
redaction/deletion/cascade results, financial-record preservation, repeat safety,
pending customer cancellation and failed refunds followed by successful resolution,
transaction rollback on audit failure, explicit-cap preservation and 55-order
processing across 50/5/0 batches. Integrity and foreign-key checks pass.

`tests/unit/notification-runtime.test.js` starts the actual configured server with
an isolated synthetic database containing deliberately expired ciphertext. Startup
removes it while retaining active contact/notification behavior; staff APIs remain
unavailable over public HTTP. The expiry fixture changes only the disposable
secret's lifecycle marker, never applied SQL or confirmed financial history.

`npm run test:unit`: **232 pass**, zero failures/skips. Syntax, documentation,
naming, scoped diff and whitespace review also pass. Run the same command to
reproduce the server regression suite. There is no new
HTML/component/interaction to screenshot or audit with Lighthouse in this worker
increment. Existing application browser/manual acceptance is still open, including
the known local Firefox startup blocker; this does not waive those gates.

Full SEC-02 still needs acceptance review of the internal field/purpose/access inventory,
applicable correction/export workflows, public privacy/contact/policy information
and broader operational/log/audit access checks. No legal compliance claim follows
from these tests. Keep the full card open. Any future real customers, provider
delivery, hosted copies or durable operations require separately reviewed policies.
