# QA-03 concurrency, recovery and measurement plan

October 23, 2026. Card: https://trello.com/c/DMMb899F.
Status: In Progress. Local correctness evidence is distinct from required actual
hosted measurement. Hosting remains preparation-only/on hold.

## Human-approved targets

- Six simultaneous checkout attempts plus four authenticated staff viewers.
- On the approved host: 95% of reads under two seconds; 95% of order/payment writes
  under three seconds. Expected capacity/revision conflicts are valid outcomes;
  duplicate records, incorrect totals and oversold capacity are not.
- Operator restart within ten minutes when VM, disk and keys are intact. Availability
  is best effort on Spot. Lost disposable data is not promised recoverable; no
  application-managed backup is required.

The human approved these class-demo targets on October 23. They are not measured
kitchen throughput or an SLA. None is reported achieved on GCP; no resources,
alerts, fault injection or shutdowns were configured.

## Local results

Base `86d07c9`, macOS arm64, Node 24.14.1/npm 11.11.0. Four actual SQLite race/
recreation cases passed, zero failures/skips:

```sh
node --test tests/unit/cancellation-concurrency.test.js tests/unit/scheduling-concurrency.test.js tests/unit/demo-payment-concurrency.test.js tests/unit/disposable-recreation.test.js
```

The new cancellation test creates a genuine paid synthetic order and individual
employee session in its own temporary file-backed database. Two independent
workers wait at a shared barrier, then request cancellation and Preparing together.
Exactly one commits and one receives a conflict. The persisted result is either
Received with one pending cancellation and no preparation timestamp, or Preparing
with no pending cancellation. Revision increments once, one corresponding event
exists, and integrity/foreign-key checks pass. Either legitimate winner is accepted.

`tests/fixtures/cancellation-race-worker.js` is guarded and worker-only, never an
application route. It sends readiness/outcome messages, not bearer tokens or
records. Only its own workers, connections and temporary directory are cleaned up.
Companion cases verify one six-pizza reservation across competing connections,
one payment/event/encrypted identity across competing payment calls, and actual
migration/seed/reopen plus process interruption before commit. Recreation uses a
different database; it does not restore lost history or keys.

Ten additional readiness/worker/retention cases passed, zero failures/skips:

```sh
node --test tests/unit/operations.test.js tests/unit/notification-runtime.test.js tests/unit/retention-service.test.js
```

These cover fail-closed readiness, safe failure/recovery events, request correlation,
startup cleanup, expiry boundaries and rollback. They are not a real host/disk/
provider outage exercise. No unrelated broad suite, baseline collection, audit or
CI workflow was repeated/changed for this test-only increment. The new race has
not been verified on Windows/Linux here.

## Hosted procedure — prepared, not executed

### October 25 completion tooling

Brody approved the grouped completion pass, temporary hosted practice accounts/
orders and a brief restart if valid prior evidence is insufficient. The bounded
`scripts/verify-hosted-completion.js` private CLI reuses the authenticated INT-02
journey, then measures six checkouts with four distinct staff sessions. It performs
20 queue reads, six order writes and six demo-payment writes; reports complete-body
nearest-rank p95 with all HTTP failures retained. Offered slots are spread across
the actual menu/schedule; capacity is never bypassed. It is a small demonstration
observation, not a sustained-load guarantee.

It also checks hosted customer registration/profile prefill, associated order
history, guest/staff isolation, recovery/session revocation and deletion. Cleanup
cancels/refunds only newly captured practice receipts, deletes its customer and
disables its temporary staff; protected order history remains. Cleanup failure
prevents overall acceptance. No recordings, credentials, private links or codes
are emitted. Never rerun a failed hosted attempt before reviewing its stage and
any unresolved run-created records.

The disposable local rehearsal initially rejected valid `201 Created` payment
responses; the verifier was corrected, not the application. The corrected run and
its customer recovery/revocation extension passed with cleanup. This is still
local tooling evidence; actual hosted results must be recorded separately.

Run from a private interactive terminal using the declared Node runtime:

```sh
node scripts/verify-hosted-completion.js
```

Enter Owner credentials/current authenticator code only at the hidden local
prompts. Share only the sanitized summary. This does not rerun final TEST-04.

After separate activation, verify exact release/host, mounted disk, external keys,
HTTPS and four individual staff identities. Obtain authorization for the disposable
synthetic dataset and any fault injection. Never enable test routes publicly.

1. Record commit, VM/OS/Node, client/browser/network, data size, contention and
   readiness. Keep cookies, credentials, keys and tracking tokens out of reports.
2. Use six customer contexts and four independent staff sessions. Start the
   approved burst together: one-pizza orders at offered times, demo confirmation
   after accepted orders, and concurrent actual queue/detail reads.
3. Measure dispatch through complete response body, separately for reads, order
   writes and payment writes. Report counts, nearest-rank p95, statuses, conflicts
   and unexpected errors; never silently omit slow/failed responses or replace
   p95 with an average. Small samples remain limited demo observations.
4. Record burst duration/counts and use offered later times when capacity is full.
   Do not bypass capacity or reset working data. Reconcile accepted orders,
   payments, events, allocations and reserved units; replay interruptions using
   original request IDs, not just successful HTTP statuses.
5. Restart through the approved operator procedure with the same mounted data/
   keys. Measure restart initiation through readiness plus a protected successful
   read against the ten-minute target. Check retained state and safe replay.
   Review only compatible rollback releases; never edit applied SQL or erase
   history. Missing mounts/keys are failures, not permission to seed replacement data.
6. Inspect actual host redaction/monitoring and separately authorized database
   outage recovery. Reuse prior native/manual/visual/audit results only after
   impact review; measure real hosted performance and rerun invalidated checks.

Record actual passes/failures/unrun criteria before acceptance. Current local
payments have no asynchronous provider callback; future out-of-order/provider
reconciliation is PAY-01, not fake Stripe testing. Previews are not delivered
email/SMS. OPS-05 disposable recreation is not an unperformed backup restore.

## Remaining acceptance

The [pre-OPS checkpoint](preops-checkpoint.md) reuses these tests in one explicit
file-backed native union and adds current customer/shared-record browser evidence.
This resolves available pre-host verification without claiming that a CI fixture
is the approved GCP target. The host-load and operator procedures above remain
unperformed on that target and remain on QA-03.

Accepted TEST-02/03 and [INT-01](int-01-customer-journey.md)/
[INT-02](int-02-shared-records.md) retain connected retries/revisions, inventory,
refund and shared-record evidence with their limits. Purchased prices and
[settled analytics definitions](../sales-analytics-design.md) remain unchanged:
payment dates versus Central pickup cohorts, separate cancellation/refund outcomes
and Received-to-Ready elapsed time, not invented pure cooking time.

QA-03 stays open for actual approved-host load/restart/rollback, custody/telemetry,
current native/manual evidence and OPS/INT prerequisites. These 14 local passes
do not establish hosted success. No provisioning, spending, real transaction,
shared process termination or working-data deletion occurred.
