# SEC-01 dependency, credential-pattern and route review

Current October 27 role-policy follow-up: Admins and Owner may read sales analytics;
menu/prices/hours remain Owner-only. The dated evidence below retains its original
scope. See [the role policy](staff-role-policy.md) for current permissions and
[the proxy guide](nginx-proxy.md) for the later approved Nginx deployment.

Final October 23 review: see [accepted SEC evidence](verification/sec-acceptance.md).
The final scan found newly reported fast-uri advisories in the development-tool
tree after the earlier zero-advisory results below. The human approved updating
only that transitive package 3.1.8→3.1.9 within Ajv's existing range. Clean locked
installation verified fast-uri 3.1.9 and the retained production parser 2.4.0;
runtime-only and full npm audits then both returned zero advisories. Historical
zero results remain dated evidence, not a guarantee that advisories cannot change.
No new library, application API, policy, infrastructure or security exception.

October 23 maintenance follow-up (OPS-07): a fresh install subsequently reported
GHSA-27r3-jxmh-p828 in locked body-parser 2.3.0. The focused lockfile patch selects
2.4.0 within Express's existing range; no direct dependency, application route or
parser option changed. All project JSON parsers retain `inflate: false`, the
[publisher's documented workaround](https://github.com/advisories/GHSA-27r3-jxmh-p828).
After locked installation, full and production-only npm 11.11.0 advisory queries
both reported zero known advisories. Earlier zero-advisory results below are
historical observations, not continuous monitoring. Native/browser and hosted
acceptance remain separate gates; this patch does not close SEC or OPS cards.
Focused post-patch verification on macOS arm64 / Node 24.14.1:
`node scripts/verify-security.js` passed 79 cases and
`node --test tests/unit/pricing-http.test.js` passed three, with zero failures or
skips. These include malformed/oversized/compressed request rejection, protected
HTTPS writes, permissions, payment retries and private-file exposure. Existing
tests were reused; no assertions were weakened. Local logs:
`/private/tmp/luigis-parser-security.log`, `/private/tmp/luigis-parser-pricing.log`.
The dependency change still needs impact review at the native/browser final QA
checkpoint; no new cross-platform, visual, Lighthouse or hosted pass is claimed.

October 23 consolidation: [SEC acceptance](verification/sec-acceptance.md) records
the current configured-HTTPS matrix, fresh advisories/history scan and retained
TEST-01–03 evidence. The October 22 open-item statements below describe the earlier
increment. Current analytics is Owner-only; Admin and Owner require MFA. The
approved deployment uses direct TLS and **no trusted proxy**; do not enable proxy
trust from forwarded headers. Actual public host/IAM/TLS provisioning remains OPS.

The new restricted privacy read/correction/copy family uses server `privacy.manage`
permission, current MFA sessions, exact HTTPS host, strict cookies, CSRF for POST,
1 KiB uncompressed JSON, revisions, read-time retention and append-only sanitized
evidence. Full details: [privacy workflow](privacy-request-workflow.md).

Review date: October 22, 2026. Scope: local demonstration source and reachable Git
history; no deployed environment or provider account was scanned. This supplements
[the threat model](security-threat-model.md), not a security certification.

## Dependency advisories

Both `npm audit --omit=dev --json` and `npm audit --json` completed successfully:
**zero known advisories** at all reported severities. The lockfile inventory reports
77 production dependencies and 116 development dependencies (193 total). npm's
advisory result is time-dependent and does not prove every dependency safe. No
package upgrade or dependency change was needed. Re-run both commands before release.

## Credential-pattern check

Run `node scripts/check-secret-patterns.js` from the repository root. It reads
tracked text files in the working tree and unique reachable historical objects
listed by `git rev-list --objects --all`, across selected source/config/document
extensions. It checks private-key headers, GitHub tokens, AWS access-key identifiers
and Stripe secret/restricted keys. Output contains rule names and file/blob
locations only; matched values and surrounding source are never printed. A match
exits with status 1 for manual investigation; never paste a finding's content into
Trello or a public issue. Failure to read Git objects/files fails the command.

The initial run scanned **722 text versions, zero pattern findings, zero oversized
or binary skips**. The pre-commit rerun included newly staged files: **725 scanned, zero findings
and zero skips**. Counts
can change with concurrent history and are not an acceptance threshold.
`tests/unit/secret-patterns.test.js` verifies a clean fixture and a deliberately
synthetic token present only in history: the scanner fails and reports a blob
location without disclosing the token. Its fixture repository is isolated and
removed afterward; no synthetic token is committed to project history.

Limitations: this small scanner is a reproducible pattern review, not a general
secret detector. It does not inspect ignored/untracked files, unreachable/reflog
objects, remote refs that were not fetched, arbitrary passwords, encrypted values,
binary images or files over 2 MiB. File extension filtering can miss unusual
artifacts. No external scanning package was installed. Sensitive local key/data
files are deliberately outside the publication scan; operators must protect them.

## Enabled route families and access boundaries

| Family | Access / request protection | Existing verification and remaining scope |
| --- | --- | --- |
| Catalog, price preview | Public; strict bounded JSON for preview; server-owned totals; preview creates no order | Pricing unit/HTTP tests. Public pricing is intentionally readable |
| Scheduling options | Public read; exact pizza-count query validation; no contact lookup | Scheduling tests; no reservation mutation in this GET |
| Order submission | Same-origin JSON; loopback-only plaintext exception; 8 KiB body limit, no inflation; authoritative validation and idempotency | Order HTTP/service tests; anonymous abuse/load controls still need review |
| Demonstration payment | Same-origin JSON; 1 KiB; no submitted card number/outcome/total; committed records and replay checks | Payment HTTP/service tests; no live provider claim |
| Guest tracking/cancellation | Protected grant in JSON; same-origin request checks, 1 KiB; minimal response and deadline/revocation checks | Tracking service and progress HTTP tests; no name/contact lookup |
| Staff authentication/account lifecycle | Pinned direct HTTPS origin; CSRF and cookie checks; 4 KiB JSON; sessions and admin MFA where required | Auth-router tests include hostile origins, forged CSRF/cookies, role injection, expiry/revocation, MFA and recovery cases |
| Staff order reads/progress | Pinned HTTPS, protected cookies; service-authorized reads; mutations also require CSRF/origin and bounded JSON | Staff-order/progress HTTP tests and service permissions |
| Cancellation decision, grant replacement, refund, preview retry | Shared staff HTTPS/CSRF protections plus service admin permissions and revision/idempotency rules | Exception/refund/notification tests; not granted by employee role |
| Sales analytics | Staff HTTPS boundary plus service admin authorization | Analytics HTTP/service tests; no fabricated client totals |

The app does not enable Express proxy trust. Auth and staff transport checks use
actual socket TLS and pinned host, not forwarded-protocol claims. Public checkout
transport uses the actual socket scheme and request host; future host/proxy routing
must be explicitly reviewed before hosting. Same-origin checks are not general
bot protection. Anonymous API limits were subsequently added in the scoped
[request-limit increment](anonymous-request-limits.md); they do not cover all
application paths or distributed hosting.

## Acceptance status

This increment adds a read-only scanner, its isolated behavior test and review
documentation. It does not change application behavior, permissions, dependencies,
headers or infrastructure. Existing application browser/manual gates are unchanged;
no UI/Lighthouse rerun is applicable to these files.

`npm run test:unit`: **236 pass**, zero failures/skips on this increment, including
the scanner test and existing server authorization/CSRF/retention regression cases.
Syntax and staged whitespace/diff review also passed.

SEC-01 remains open for endpoint abuse/rate-limit assessment, deeper cross-object
and configured-host verification, resolution of any later findings and integrated
release acceptance. Existing tests are evidence for their specific scenarios,
not an exhaustive adversarial assessment. No security or legal compliance claim.
