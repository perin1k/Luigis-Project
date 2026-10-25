# Code readability review

Approved October 24, 2026. Scope: explanatory comments and formatting, without
changing behavior, names, interfaces, security policy or persisted contracts.
Source implementation authorship remains with the original contributors.

## Customer-account batch

Files: `src/customer/customer-service.js`, `customer-router.js`,
`customer-transport.js` and `src/public/js/customer.js`.

Expanded dense statements and explained module responsibilities, independent
customer/staff identity, transaction boundaries, asynchronous credential rechecks,
one-use recovery, expiry and browser privacy cleanup. Comments explain intent and
invariants rather than claim new functionality. SQL strings, constants and API
contracts are preserved; applied migrations and pinned blocklists are untouched.

Verification uses the Acorn parser bundled with the pinned local Node runtime
only as an ignored review helper, not a new dependency. Compare original/current
parsed structures after excluding source-position metadata; literal values remain
part of the comparison. All four files compare equal. Syntax and diff review
also apply; this does not claim a new browser/platform/host acceptance run.

## Ordering and payment batch

Reviewed all six ordering modules and five payment modules. Added explanations
of server-authoritative cents, Chicago date/instant boundaries, request replay,
session-based order ownership, atomic holds, committed hold release on rejection,
synthetic encryption context and signed refund allocations. Expanded dense payment
and refund statements; readable modules retain their established formatting.

All 11 before/after normalized parsed structures match, including literal values;
syntax checks pass. The 28 focused existing pricing, scheduling, payment and refund
tests pass. No browser/UI change or hosted redeployment is claimed by this batch.

## Staff, tracking and internal-preview batch

Reviewed nine staff modules, two tracking modules and two notification modules.
Explained queue projections versus state changes, revision checks, cancellation
versus refund approval, reporting cohorts, privacy verification, bearer-link
digests/replacement and bounded internal-preview processing. Dense operational
statements are expanded. All 13 normalized parsed structures and syntax checks
pass; 34 focused analytics/progress/privacy/tracking/notification tests pass.

## Composition, data, security and staff-authentication batch

Reviewed the application/server composition, five data modules, three operations
modules, two security modules and all 16 staff-authentication modules. Added
purpose and trust-boundary explanations while preserving existing detailed
comments. Explained synchronous SQLite work versus asynchronous hashing, live
identity rechecks, explicit Owner permissions, proof/counter replay protection,
private key loading, redaction versus history and process/worker health.

All 28 parsed structures and syntax checks pass. The 38 selected existing
session/MFA/enrollment/retention/proxy checks pass; this is focused regression
evidence, not a new all-platform browser or hosted release acceptance.

## Browser, tooling and presentation review

Reviewed the ten remaining browser modules and 29 operator/verification scripts.
The earlier customer batch and the already extensively documented one-time cleanup
complete project-owned JavaScript coverage. Purpose comments explain uncertain
payment reconciliation, private response generations, text-only DOM rendering,
theme-only storage, explicit operator effects and private provisioning/rotation.
The wizard also has focused navigation/validation/payment/catalog explanations.

All 39 before/after parsed structures and syntax checks pass. Three focused
Chromium desktop ordering/editing/storage-disabled-theme scenarios pass. The
selected release/GCP/monitoring checks passed; operations/TLS initially lacked
local listener permission/OpenSSL PATH, then passed with the existing tool path
and approved disposable listener access. No new library was installed. There were
14 distinct tooling/operations tests, all passing in the final applicable runs.

All 22 EJS templates now have server-only purpose comments. Comparing compiled
client-function parsed structures with compileDebug disabled proves that these
annotations do not add response text/whitespace or change template instructions.
All four CSS files have scope notes prepended; the original rule bytes remain
unchanged after that exact comment prefix. Neither templates nor styles were
redesigned/reformatted. No snapshot replacement or hosted redeployment is claimed.

[The developer code map](../code-map.md) explains integration points, trust and
transaction boundaries, private tools, template/browser contracts and reusable
tests. Existing tests/configuration, deployment shell procedures and already
readable helpers retain their useful organization; this pass does not churn
vendor/generated code, applied SQL, blocklists or lockfiles. Original contributors
retain implementation authorship. Functional fixes and the approved visual/UX
cleanup remain separate work.

Final acceptance of this readability task uses parsed-code equivalence, syntax,
compiled-template equivalence, unchanged CSS rules, diff/link review and focused
checks. This does not claim a new native-platform/visual/Lighthouse release pass;
the existing final QA/TEST-04 requirements remain intact.

Final combined comparison against `16317b3` passed for **96 JavaScript files**,
**22 EJS templates** and **four stylesheets**, with 20 local guide links checked.
The EJS comparison first restores the pre-comment checkout text, accommodating
Git LF versus existing checkout CRLF without rewriting any file, and then compares
compiled structure at that same encoding. The original per-template before/after
checks also pass. No applied migration, blocklist, dependency manifest/lockfile or
deployment configuration changed in this readability increment.
