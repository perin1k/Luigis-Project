# Concurrency follow-up — October 28, 2026

Story: [Concurrency follow-up](https://trello.com/c/Adkrey8j).
Brody authorized measured concurrency improvements and deployment on the existing
GCP/DuckDNS host through November 1. No additional VM, paid service or database
replacement was introduced. This follows the October 27 presentation update and
does not rewrite the original October 25 TEST-04/submission evidence.

Application candidate: `40abaeae23f32fee8fcc0846e45c0a0145571e38`.
Migration-compatible fallback: `bfe4749e80548857f2ffbf5bbb36a65a85a382a9`.
The fallback retains the presentation features and adds only migration 017's
selective indexes; it is not the older, incompatible migration-16 application.

## Runtime changes

- File-backed connections require WAL, FULL synchronization, a 5,000ms busy timeout
  and automatic checkpoints at 1,000 pages. Memory fixtures remain memory-backed.
  Node 24.22.1/SQLite 3.53.4 and the local ext4 mount were observed on the VM.
- Migration 017 adds booking/state, review/order/state and full payment-allocation
  indexes, replacing demonstrated state-only searches/scans with selective searches.
  No applied migration 001–016, business constraint, purchased price or record is edited.
- A bounded public-catalog cache uses both local write count and external data version.
  It returns clones and bypasses transactional reads/authoritative pricing. Tests
  cover external ingredient changes, caller mutation and rolled-back availability.
- Repeated identical session activity timestamps no longer cause redundant writes.
  Every actual timestamp change persists; permission checks, revocation, MFA,
  30-minute idle expiry and eight-hour absolute expiry remain exact and uncached.

No worker-thread RPC architecture or reporting-connection pool was introduced:
the requested 20-customer workload passed, and larger observations did not justify
that larger refactor for this increment. Synchronous DatabaseSync work still runs
on the main thread and SQLite still has one writer; the measured improvement is
not a claim of unlimited parallel database operations.

## Repeatable workload and measurements

`tests/operations/concurrency-benchmark.js` creates only a disposable directory/database,
real application services, ephemeral synthetic keys and loopback HTTPS. It accepts
only fixed journal/client-count/round choices, never a production origin or data path.
Guest clients bind distinct actual loopback addresses; arbitrary forwarded headers
remain untrusted. Each customer submits and retries the same order and payment;
four staff sessions read the queue concurrently. Additional public catalog reads
run alongside writes. A separate five-place hold makes two customers compete for
one remaining place; exactly one succeeds and the other gets a recoverable 409.

The first all-retry, single-address draft hit the existing 60/minute checkout budget,
not SQLITE_BUSY. This remains a documented shared-network protection, not a waived
database error. Distinct peers test database/server throughput without disabling
rate limiting. Existing prepared checkout/day capacity is not bypassed.

Three before/after pairs were prespecified, retained and passed on the actual
two-vCPU/about-2GB VM. Each member uses three rounds of 20 guest customers with
four staff sessions, including 60 initial order requests, 60 order retries,
60 payments, 60 payment retries, 181 catalog reads and 60 staff reads.

| Pair | Rollback/original workload time | Optimized WAL/FULL workload time |
| --- | ---: | ---: |
| 1 | 2,937.60ms | 2,017.32ms |
| 2 | 3,270.33ms | 2,079.32ms |
| 3 | 3,007.88ms | 2,063.78ms |

Median total time fell from 3,007.88ms to 2,063.78ms (about 31%). Median per-pair
order p95 fell from 725.67ms to 544.02ms; payment p95 from 357.91ms to 241.74ms.
Every pair had zero unexpected responses, correct idempotent record counts,
safe last-slot competition and passing integrity/foreign-key checks.

Earlier single observations are retained rather than substituted for these pairs:
rollback 4,951.93ms; WAL-only 2,076.67ms; combined optimizations 2,230.92ms.
WAL was the dominant observed improvement. The combined single run was slower
than the WAL-only single run, so no separate additional-throughput claim is made
for every index/cache change. Their lookup/invalidation behavior is independently tested.

Additional optimized observations: 50 concurrent guests/4 staff sessions completed
one round in 2,011.64ms; 100 guests/4 staff sessions in 3,754.49ms. Both retained
correct idempotency/capacity/integrity with zero unexpected responses. The 100-guest
order p95 was 2,866.47ms. These are bounded, same-VM loopback HTTP observations,
not public Internet measurements, a maximum-user guarantee, a login/hash stress
test, browser-tab count or proof that a shared Wi-Fi address avoids rate limiting.

## Verification and rollout status

- Full Windows Node 24.22.1 unit run: 343/344 passed initially. The only failure was
  an old migration-count assertion expecting 16 instead of 17. It was corrected;
  the complete affected eight-case order-storage suite then passed. The other 343
  tests' unchanged results are retained, not presented as a new all-suite rerun.
- Focused 47-case database/pricing/scheduling/retry/session/queue/report run passed.
  New tests prove simultaneous WAL read/write isolation, bounded writer waiting,
  rollback, file permissions and selective query plans. Native storage verification
  includes the new tests.
- Native scoped flow/reference run:
  [40659521118](https://github.com/perin1k/Luigis-Project/actions/runs/40659521118),
  passed on Windows Chromium/Firefox and macOS/Linux Chromium/Firefox/WebKit,
  desktop/mobile.
- Native storage run:
  [40659464066](https://github.com/perin1k/Luigis-Project/actions/runs/40659464066).
- Customer-account run:
  [40659464086](https://github.com/perin1k/Luigis-Project/actions/runs/40659464086).
- Maintenance clean-checkout/runtime run:
  [40659464142](https://github.com/perin1k/Luigis-Project/actions/runs/40659464142).
- Staff run:
  [40659464098](https://github.com/perin1k/Luigis-Project/actions/runs/40659464098).
  All three required Windows/macOS/Linux jobs passed, including strict native visuals.
  The existing unsupported native Windows WebKit diagnostic remains separately
  visible and is not counted as a required platform pass.
- Current full dependency advisory check: zero known advisories; lockfile unchanged.

No HTML, CSS, browser module, indexing policy or visual reference was changed by
the concurrency runtime work. Accepted rendering, manual accessibility and Lighthouse
evidence is reused after impact review, not represented as newly rerun Lighthouse
scores. Focused native flow/reference checks cover menu invalidation, checkout
retries/tracking and role/session behavior.

Forward staging was verified without changing the live schema. Archives:
fallback `ea258b5e03ebe31aba8ad6046fe36b19874ded0456c0fe21d1d5f98245063d4d`;
optimized `b9505142048abb041c48ffc2418606d21f574f529dac68d65490585e6226a0aa`.
Final hosted migration, custody, readiness and human acceptance outcomes are recorded
below after execution; preparation is not claimed as deployment.

The first live cutover command was rejected by automatic approval review before
execution because it requested more explicit production downtime/schema/release
authorization. The live release remains `c8f657c` with migration 16 at this checkpoint.
The user was asked to approve the exact service stop, index-only migration, baseline
and optimized release switches, data/private-setting verification and compatible
recovery policy. No workaround or retry was attempted while approval was pending.
