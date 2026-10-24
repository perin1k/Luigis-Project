# SEC-02 / SEC-01 application acceptance

October 23, 2026. Native candidate review completed; strict comparison pending.
The original pending manual/audit statements are superseded by the evidence below.
Cards: [SEC-02](https://trello.com/c/ehrcmOun),
[SEC-01](https://trello.com/c/3fVC3XbV).

## Native candidate review and existing human acceptance

The team's successful [native collection run 40018269023](https://github.com/perin1k/Luigis-Project/actions/runs/40018269023)
at `12ff600082e6ba058a32110fa02692b449aaa89a` produced 64 synthetic privacy
images: 24 macOS, 24 Linux and 16 Windows. All three jobs succeeded. Windows
uses its approved Chromium/Firefox desktop/mobile matrix; macOS/Linux include
WebKit as well. This collection is not a strict comparison pass.

Downloaded archives matched their displayed SHA-256 digests:

- macOS: `dea1644a84ac38db1ced265530d28fc21ce8b46de2deceee9661dd703b0c7c7f`
- Linux: `86b9dd15915b16d574abf6f4178f54ae841fd6cbd85b636daad8e815ef80c865`
- Windows: `e8b05b55482632cc10bd54f5656f675e0bd6b874efa761f8428f647ea0b6154f`

Reviewed all 64 in platform contact sheets plus full-size representative desktop
and mobile images. Light/dark form and limited-copy states retain readable labels,
wrapped instructions, visible focus/controls, contained copy fields and responsive
footers without observed overlap or horizontal clipping. Native font differences
are retained. References are added to the existing `security-ci` path with their
OS/browser/viewport names; no existing image, tolerance or assertion is overwritten.
Candidates contain fixture-only synthetic data, not real contacts or credentials.

Brody's October 23 SEC-02 card update records the completed human grouped
Chrome/Narrator/keyboard/200–400% light/dark review and new-page audit; this is
reused human/team evidence, not a new screen-reader review performed in this chat.
The current [privacy Lighthouse report](qa-01-privacy-lighthouse.json) independently
records Performance/Accessibility/Best Practices 100. The human explicitly approved
privacy-page SEO-only noindex applicability. [Current QA evidence](qa-01-integrated-review.md)
also records 12 passing current local privacy behavior checks, the parser patch's
82 focused checks and fresh zero-advisory runtime/full audits in the linked
security review. Strict current native comparison is still required before closure.

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
