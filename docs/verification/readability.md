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

The broader application/readability card remains In Progress. The separately
approved Nginx architecture/configuration change must use its own commits and
verification rather than be hidden inside a formatting diff.
