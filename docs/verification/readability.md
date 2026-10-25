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

The broader application/readability card remains In Progress. The separately
approved Nginx architecture/configuration change must use its own commits and
verification rather than be hidden inside a formatting diff.
