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

### First protected-audit run and approved follow-up

Brody supplied run `8a70389261b2`, finished `2026-10-25T08:38:10.934Z`. The shared
journey/order and temporary staff/customer cleanup passed. Twelve guest-account/
staff entry audits completed: all required categories were 100 except mobile
customer recovery Performance **99**. SEO was 63 on intentional noindex pages
under the already approved exception. The run stopped at customer-account before
recording its audit; remaining protected pages were not tested. Overall result
was false and remains recorded as such.

A subsequent disposable-customer investigation reached the actual signed-in page
with both Cookie headers and native browser cookies; it did not reproduce the
earlier full-sequence stop. Both isolated mobile measurements scored 100/100/100
with noindex SEO63, and the account was deleted. This is authentication/tooling
diagnostic evidence, not a replacement pass for the failed full run. The checker
now uses native default-context cookies and fixed failure-phase/status diagnostics
without raw URLs/cookies. Future failures must not be labeled app-authentication
defects without evidence.

Brody explicitly approved a narrow private stylesheet consolidation and controlled
deployment. Staff/customer templates now reference the existing Bootstrap+staff
bundle in one response. The new request-count test failed first (2 versus 1);
six focused HTTP/auth/audit tests then passed, including exact CSS bytes/cascade.
No dependency, schema, permission, visual design or audit-scoring change occurred.
The approved release `da2a2bdbe3ef0beb06f0e96dd0e07d64ef60140a` is now live.
Candidate/fallback had zero pending migrations; retained database identity,
account/MFA/schema digests and private settings matched. Prior `0e931d6` remains
the compatible release fallback. All three strict native staff visual jobs in
run40177926406 and all required staff jobs in40177854653 passed. The approved
optional Windows WebKit diagnostic failed and is not counted as a pass.

The first post-deployment recovery audit measured mobile97 (Speed Index4.6s),
desktop100, with Accessibility/Best Practices100 and noindex SEO63. Its cause is
not proven and it remains a failed observation. A predefined isolated three-run
standard mobile investigation then produced 100/100/100, SEO63 on every run,
FCP/LCP/Speed Index1056–1067ms, zero blocking time/layout shift. All samples are
retained in reports/cleanup/recovery-variance.json, not selected until green.
The complete protected audit retry is still required; no score is waived.

The corrected auditor explicitly clears the default audit context's HTTP cache
before every profile while retaining native authentication cookies. It preserves
the private tracking fragment in memory and requires a successful actual tracking
API response, rather than auditing an empty shell. The disposable localhost
tracking rehearsal passed both profiles and deleted its temporary account; its
self-signed certificate allowance exists only in that fixture, never the hosted
CLI. Partial diagnostic scopes cannot produce overall whole-audit acceptance.

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
