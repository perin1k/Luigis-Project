# SEC-02 / SEC-01 application acceptance

Accepted October 23, 2026 for the scoped application security/privacy cards.
Final hosted/integrated release and deferred public-policy gates remain separate.
Cards: [SEC-02](https://trello.com/c/ehrcmOun),
[SEC-01](https://trello.com/c/3fVC3XbV).

## Scope and provenance

Preserve the team's existing controls, migrations and October 22 privacy/security
increments. Source baseline `59ee2301fe78278d0aa51ea5f7cd965d92e6ed2c` includes
accepted TEST-01–03. Existing decisions: generated synthetic encrypted payment
identities, no raw card/CVV entry, no external sending, seven-day privacy cleanup
with unresolved-case extension, separate ciphertext expiry, direct HTTPS/no proxy,
Admin/Owner MFA and previously deferred public privacy policy/contact email.
Those decisions supersede conflicting historical card text; no new real provider,
data collection, legal promise, paid service or hosting is introduced.

The human approved the complete protected contact correction/limited-copy workflow
and one additive sanitized audit migration. [File/contract/operator guide](../privacy-request-workflow.md).
The human separately approved focused native SEC CI, in-memory credential use for
its Actions API and internal synthetic visual artifact review. No key, credential,
live database or personal contact is uploaded.

## Criteria and reusable verification

| Criterion | Evidence |
| --- | --- |
| Fields, purpose, storage/access/lifecycle | [Inventory](../privacy-data-inventory.md), [retention](../retention-enforcement.md), [operator review](../privacy-operator-review.md); optional rewards unimplemented and not collected |
| Correction/copy | `privacy-service.test.js`, `privacy-migration.test.js`, `security-privacy-http.test.js`, `privacy.spec.js`: real session permissions, review, validation, revisions, immutable financial/grant/deadline boundaries, append-only audit and failure rollback |
| Retention/isolation/history | Existing `retention-service.test.js`, `access-storage.test.js`, notification/runtime records and accepted TEST-03; exact cutoff, unresolved cases, read-time suppression, batch/retry/rollback and preserved ledger |
| Logs/audit access | `operations.test.js`: allowlisted redacted request/worker outcomes and spoofed-ID rejection; storage and HTTPS tests deny raw audit/debug/private-file access |
| Threat/protected operations | [Threat model](../security-threat-model.md), [route matrix](../security-review-evidence.md), additional configured HTTPS matrix below |
| Session/MFA/role/CSRF | `auth-router.test.js`, `staff-orders-http.test.js`, `menu-http.test.js`, new HTTPS privacy tests; retained accepted BE-08/FE-08 evidence |
| Validation/XSS/injection/replay | Parameter-bound SQL; exact schemas/body limits; escaped dynamic EJS; actual `<svg>` correction rendered as escaped text; forged role/ref/body rejection; repeat correction conflicts and interrupted-response reload; retained payment/refund retry evidence |
| Abuse/host/exposure | `anonymous-limits.test.js`, `http-hosting.test.js`, configured HTTPS matrix; socket-peer budgets ignore forwarded headers; exact TLS host, origin/fetch and CSRF boundaries; no proxy trust |
| Dependencies/source/history | Fresh runtime/full npm audit and bounded tracked/reachable credential-pattern scanner; limits below |

Configured HTTPS adversarial matrix exercises forged/no-CSRF or hostile-origin/
fetch-site writes to staff role, menu availability/prices/hours, progress, exception,
refund, tracking replacement, preview retry and privacy correction/copy routes.
All deny without order-event mutation. Guest token plus a different reference is
rejected, reference/SQL strings do not grant access, genuine token resolves only its
own minimal status, and it cannot become a staff cookie. Production app rejects
fixture controls, audit APIs, source, environment, Git and database/migration files.
Privacy writes reject malformed/oversized/compressed JSON, extra role claims, wrong
host and expired/revoked authority; fixed errors never return private payloads.

## Local outcomes and honest corrections

Windows x64, Node 24.22.1, pinned Playwright 1.64.1. The new behavior test first
failed because the privacy service did not exist. Implementation then passed after
two test-fixture corrections: the database already forbids Admin sessions without
MFA (assert that constraint instead of inserting invalid authority), and a verified
Admin copy intentionally includes both saved contact channels. No controls weakened.
Configured HTTPS initially used the wrong `/api/auth` path in one assertion; the
actual `/auth` path is now tested. The denied-page browser test caught JSON being
returned instead of an accessible error: the mounted error handler now checks the
original path and renders the existing error page. A theme test attempted to click
Bootstrap's visually hidden radio rather than its visible label; corrected to the
existing accessible label interaction. A mid-transition contrast capture failed;
waiting for actual control animations to settle passed at unchanged contrast rules.

`node scripts/verify-security.js`: 79 focused cases passed locally, no failures/skips.
This selects affected migration, privacy, configured auth/menu/order/payment HTTP,
retention, logging, limiter, source exposure and scanner behavior; it does not run
unrelated broad suites. The v14→v15 test preserves prior checksums/rows/history and
verifies integrity/foreign keys. Initial sandbox execution could not load OpenSSL;
the authorized native rerun used the existing Git OpenSSL dependency and passed.
Syntax and scoped diff checks passed. No working application database was touched.

Fresh npm 11.6.0 runtime-only and full advisory audits both returned zero known
advisories (77 production, 116 development; inventory is not a safety guarantee).
The read-only source/history scanner found zero matches among 1,135 selected text
versions, zero binary/oversized skips before this increment. Re-run after staging.
It checks only four patterns/selected text extensions and reachable fetched history,
not arbitrary passwords, ignored/local/unreachable files or external artifacts.
No dependency upgrade or new scanning package was introduced.

After staging the approved source/docs, the scanner passed again: 1,150 text
versions, zero findings/skips. Implementation was committed/pushed at
`07c671bd523e7485c2ee435b157ca4e32e726d5d`.
[Native collection](https://github.com/perin1k/Luigis-Project/actions/runs/40017397351)
tests that source. Initial native setup installs locked tools only; the workflow
has read-only repository permissions and short-lived synthetic-only visual uploads.
The temporary dev-only path-scoped push trigger registers the new workflow; remove
it after collection so ordinary pushes do not repeat verification.

Initial native results at `07c671b`: all 79 focused server/security cases passed
on each OS. Windows browser collection passed 20 cases and macOS passed 30. Linux
passed 29 and failed one Chromium mobile Light copy-state contrast check: a
disabled-to-enabled/hover intermediate color pair measured 3.86, below 4.5. The
earlier immediate zero-animation poll can run before next-frame style transitions
start. Retain that failure; the candidate set is not accepted on generation alone.

Test-only `12ff600082e6ba058a32110fa02692b449aaa89a` moves the pointer off controls,
allows two real render frames and awaits actual animation completion before axe.
It changes no application color, permission, validation, timeout, contrast threshold
or screenshot tolerance. [Follow-up collection](https://github.com/perin1k/Luigis-Project/actions/runs/40018269023)
verifies that correction; only new privacy-page images are collected. Existing
accepted feature references and application/manual/audit evidence remain intact.

Follow-up collection `40018269023` passed all three native jobs: 79 focused server
cases per OS and 20 Windows / 30 macOS / 30 Linux browser cases, no reported skips
or flakies. All 64 synthetic images were reviewed in complete native contact sheets
and representative full-size mobile views. Node 24.14.1 and locked Playwright
1.64.1 use Windows Server 2022 x64, macOS 15 arm64 and Ubuntu 24.04 x64. Windows
uses Chromium/Firefox desktop/mobile; macOS/Linux also use WebKit, with 320px reflow.
This does not claim real Safari or unsupported native Windows WebKit acceptance.

## Resumed team changes and final reference review

John Sevier's `174b043` payment uncertainty fix and `be24de4` optional integrated
fixture are preserved. Their [INT-01](int-01-customer-journey.md) and
[INT-02](int-02-shared-records.md) evidence is reused for the stated scenarios,
not authorship or full-card acceptance. Default privacy fixture behavior is unchanged.
The parser security patch from `618e177` remains. Before the final developer-tool
update below, the lockfile was verified byte-identical to that patched commit
(body-parser 2.4.0, qs 6.16.1 and original integrity hashes). Production dependency
entries remain unchanged by the later fast-uri-only patch.
Current patched [QA evidence](qa-01-integrated-review.md) and its
[privacy audit](qa-01-privacy-lighthouse.json) remain available and unmodified
apart from a historical handoff link, not new results claimed by this chat.

At the human's request, `4a5f5af58f20acfefb3e1854196687daedad7b18` reverses recent
Perin non-QA OPS/DOC preparation and overlapping SEC reference/test additions,
preserving QA and John Sevier work. Original SEC implementation remains. Brody
owns OPS/SEC/DOC; assignments belong to task/board context, not shared AGENTS rules.

Before that revert, native strict run
[40044005709](https://github.com/perin1k/Luigis-Project/actions/runs/40044005709)
passed Linux/macOS and failed one Windows Firefox mobile Light copy screenshot
(19 passed, one failed). The textarea retained a variable caret/scroll offset;
no permission or functional assertion failed. The final test explicitly positions
the readonly copy at its first line and asserts scrollTop zero. No visual mask,
contrast assertion or comparison tolerance was weakened.

Successful team collection
[40044353905](https://github.com/perin1k/Luigis-Project/actions/runs/40044353905)
at `f6ed6daa36f92bf2d704cd7fed7d9e22ce95dad8` validates that capture behavior on
the patched combined application: 79 server cases per OS and 20/30/30 browser
cases, no failures. Its synthetic artifacts remain valid evidence even though
the overlapping reference publication was reverted; this chat reviewed them again
before adding the accepted references. All 32 form images are byte-identical to
the earlier reviewed set. All 32 corrected copy images were inspected in complete
native contact sheets and full-size Windows Firefox mobile Light and macOS WebKit
desktop Dark views. Labels, focus, wrapping and copy containment remain clear with
no unexpected clipping/overlap. Only the opaque reference is normalized in the
test DOM; saved records/grants are not altered. Existing TEST references are untouched.

The final workflow is manual-only; ordinary pushes cannot trigger recollection.
Final strict comparison runs without image updates. Existing default Admin/refund
consent-row checks passed locally in Chromium/Firefox after adding privacy navigation.
The native comparison below verifies the final combined source and reviewed refs.

## Final strict result and late advisory resolution

[Final strict run 40051638544](https://github.com/perin1k/Luigis-Project/actions/runs/40051638544)
at `58373e4d3b168242c7262ef2d4f90897dbceb3e6` passed Windows 20, Linux 30 and
macOS 30 browser cases. Logs report no failures, retries, skips or flaky cases.
All reference comparisons ran with `--update-snapshots=none`; no tolerance changed.
This validates the corrected copy viewport as well as genuine correction/copy,
denied/expired access, late-response clearing, interrupted-response recovery,
keyboard, reflow and tagged axe checks on the final combined application.

The current advisory recheck then found one affected development package,
`fast-uri` 3.1.8 through Ajv's existing `^3.0.1` range, with four related URI
canonicalization advisories (highest moderate). Production-only audit remained
zero. The human explicitly approved a narrow patch. Only the existing package's
version/resolved/integrity fields change to 3.1.9; package.json, runtime packages,
frameworks and public application assets are unchanged. See the
[maintainer advisory and patched versions](https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg).
Other npm-linked findings: GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr and
GHSA-333x-w4r6-6crp. No new library, override or lifecycle script was introduced.

A clean locked installation with lifecycle scripts disabled verified installed
fast-uri 3.1.9/body-parser 2.4.0. Fresh runtime-only and full npm audits both returned
zero advisories afterward. The browser/server source and its native dependencies
are unchanged by this development audit-tool patch; native browser evidence above
is retained. The existing privacy Lighthouse helper is exercised with the patched
toolchain; final sanitized audit outcome is recorded below. No unrelated suite is
rerun or old audit relabeled as a new measurement.

That patched-toolchain audit passed Performance 100, Accessibility 100 and Best
Practices 100, retaining SEO 60 under the approved private noindex exception.
The current `sec-privacy-lighthouse.json` is this fresh sanitized result, with
unchanged Lighthouse 13.5.0/default-mobile configuration on Windows x64/Node
24.22.1 and the production disposable HTTPS fixture. The earlier measurement is
retained in commit history. No score threshold or page-indexing rule changed.

Both SEC cards satisfy their applicable approved application criteria, including
the implemented privacy request workflow. This does not accept any outstanding
OPS/DOC work, publish a deferred privacy/contact policy, clear final QA, or claim
legal/security certification. The original criteria, earlier failures and team
provenance remain visible rather than changing gates to close these cards.

The existing configured startup/worker integration test also passed locally after
the new production service wiring. It uses isolated synthetic data, not a deployed
server or a live developer database.

## Human accessibility and new-page audit

The human reports **passed** for the complete grouped Chrome/Windows Narrator
review: Admin MFA navigation, heading/labels/instructions, review-required alert
and checkbox focus, persisted name/phone correction after reload, reachable readonly
limited copy/no-sending explanation, hiding the field and restored focus, keyboard
operation and 200%/400% zoom in both themes without clipping/traps. No new browser/
Narrator version was reported; do not substitute CI versions for the human session.

`node tests/audit-privacy.js` passed Performance 100, Accessibility 100 and Best
Practices 100 on the new page using Lighthouse 13.5.0, Windows x64/Node 24.22.1,
default mobile simulated throttling and the production disposable HTTPS fixture.
SEO 60 is retained under the existing intentional private-page noindex exception,
not rounded to 100. [Sanitized configuration/scores](sec-privacy-lighthouse.json)
contain no credential/cookie or live record URL. New copy/error states are covered
by browser/axe/manual review rather than claiming Lighthouse navigation audited
every dynamic state. Final actual hosted HTTPS remains QA-01.

## Reused acceptance and deployment boundary

[TEST-01](test-01-menu-acceptance.md), [TEST-02](test-02-checkout-acceptance.md) and
[TEST-03](test-03-acceptance.md) retain valid native functional/visual/axe, human
Chrome/Narrator/zoom and audit evidence for unchanged features, including the earlier
Firefox throttled-payment recovery gap. Existing role/financial/retention logic is
not claimed as new authorship. Only an Admin navigation option was added to existing
order detail; default selection/layout and consent/server behavior remain unchanged.
New privacy-page acceptance is verified separately rather than replacing old images.

No public deployment, IAM/key custody, filesystem ACL, hosted log rotation, outside
copy erasure, live payments, native Wallet, outgoing notification, general legal
export or security/PCI/WCAG certification is claimed. Actual public-host configuration
remains OPS-01/02/03/04/06/07; final integrated/hosted/privacy/concurrency gates remain
INT and QA-01/02/03. Previously approved policy publication/contact-email deferral
remains explicit; accurate public information must be reviewed before release.
