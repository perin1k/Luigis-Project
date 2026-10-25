# Final completion work — October 25, 2026

Brody approved finishing customer-account acceptance, QA-03, QA-01, DOC-01 and
OPS-06, then TEST-04 after those prerequisites are accepted. Existing Perin QA
assignment and John implementation are preserved. Evidence from unchanged work
is reused after impact review; no missing test is silently called a pass.

## Exact scope

Deployed application: `0e931d6e4f866beecbe6094e3a561fc20a176dc8`, Node 24.22.1,
existing GCP Ubuntu/Nginx/DuckDNS target. Later source commits contain verification
tooling/documentation, not changed application code, package dependencies or SQL.
Public home/menu/order Lighthouse 13.5.0 standard mobile and desktop profiles all
scored 100 Performance/Accessibility/Best Practices/SEO. See
[deployment evidence](cleanup-deployment.md) for individual scope and native
HTTP/2/CSS checks. These six audits are reusable while the deployed source and
configuration remain unchanged; they do not audit every protected screen.

## Human review

Brody reported the grouped customer registration/sign-in/profile/recovery/deletion
screens passed Chrome/Windows Narrator keyboard, light/dark and 200%/400% zoom
review. He reported live home/menu/order/account touch checks in portrait and
landscape passed; model/browser were not provided. This is human-reported device
coverage, not a named Safari/physical-device certification. Prior accepted
staff/menu/refund/privacy/ordering manual checks remain valid for unchanged flows.

Brody also reported the receiving guide tasks passed and clarified that delivery
is the zipped repository plus presentation to the class. No business account
transfer, public source license or ongoing production-support promise is added.
Technical setup remains separate from end-user instructions. Six selected user/
handoff/submission guides passed code-fence and 57 local-link checks before the
latest corrections; changed links require final review before packaging.

## Hosted restart observation

A fresh disposable customer account was registered and kept signed in. The
authorized restart used only `systemctl restart luigis` on the verified current
release and retained mount. The private operator check confirmed a new process,
trusted ready response and active services; database device/inode, retained
account/MFA/schema digests and private settings hashes matched before/after.
Protected `/account` still opened as signed in. Restart initiation through the
protected read took **10,208.4314 ms**, below the agreed ten-minute target,
including CLI/network overhead. The temporary account was then deleted. Sanitized
local result: `reports/cleanup/hosted-restart.json`; no credentials/records printed.

Compatible-release/schema gates passed before the recent deployment; earlier
actual compatible operator recovery, same-release proxy/direct recovery, startup
failure and retained-data checks remain documented in OPS-01/02/08. A disposable
recreation check is not a promise of backups. No live data-loss/database-outage
drill or unapproved rollback is fabricated here.

## Completion checker

Tooling commit `af757c22609b00945f15ede5789865bffd1372e4` introduced the bounded
checker. Five focused policy tests and the local full rehearsal passed. The first
rehearsal incorrectly required HTTP 200 for new payments; the test was corrected
to accept existing 201 Created. Initial failure is retained as a verifier failure.
Native Windows/macOS/Linux rehearsal
[40176248275](https://github.com/perin1k/Luigis-Project/actions/runs/40176248275)
passed all jobs with recovery/revocation and temporary-record cleanup checks.

Brody ran the private hosted checker and supplied its sanitized result, run
`0e6401dc60fb`, finished `2026-10-25T08:26:23.241Z`. The shared-role INT-02 journey
passed all eight stages, including temporary-access cleanup and resolved order.
Customer registration/profile prefill, one owned order among six checkouts,
guest/staff isolation, recovery/session revocation and account deletion passed.
The six practice receipts were resolved; the three run-created staff accounts
were disabled and temporary customer removed. The checker reported overall
`bPassed: true` and `bCleanupPassed: true`.

| Response group | Count | Nearest-rank p95 | Unexpected HTTP responses |
| --- | --- | --- | --- |
| Four staff sessions reading queues | 20 | 113.6161 ms | 0 |
| Six concurrent customer order writes | 6 | 113.9162 ms | 0 |
| Six demonstration payment writes | 6 | 123.3499 ms | 0 |

The burst lasted 1,128.0141 ms. Measurements include complete response bodies and
all collected statuses; no failure/slow sample was discarded. These pass the
approved read<2s/write<3s p95 targets for this bounded demo observation, not a
sustained-load/SLA guarantee. Purchased/refunded history remains in the system.

## Still open

- Customer palette regression is resolved: old run 40176498305 is retained as a
  failure; test-only correction `47a3392` and native run 40176777086 passed all
  required customer jobs. Shared visual references and accessibility gates were
  not weakened.
- Protected hosted page audits remain: `verify-hosted-audits.js` uses one private
  Owner sign-in, reuses the resolved shared-role journey's exact synthetic order,
  and audits 14 guest/customer/Owner/staff/tracking page types in mobile/desktop.
  The browser debug endpoint binds loopback only; authentication stays in memory.
  Standard device/throttling/scoring remain unchanged; storage reset is disabled
  only to preserve authenticated sessions. Raw LHR/URLs/cookies are not saved;
  only fixed labels/scores/outcomes leave the checker. Existing noindex SEO-only
  exception is used only after verifying actual noindex; other scores require
  100. This is additional acceptance evidence, not permission to waive a failure.
- Final guide/package-content review and QA acceptance/card updates.
- TEST-04 entry requires all other current-delivery source cards Done. It has not
  started and no whole-application readiness verdict is issued by this record.

Current demonstration boundaries remain: no real payment/native Wallet, internal
notification previews, disposable data without app-managed backups, Spot/bounded
hosting availability and limited support. A demo pass will not certify commercial
readiness, exhaustive security or every possible edge case.
