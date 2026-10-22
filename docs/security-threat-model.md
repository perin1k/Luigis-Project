# SEC-01 focused threat model and HTTP boundary verification

October 22, 2026. Story: https://trello.com/c/3fVC3XbV.
Scope is the current disposable demonstration, not certification or a hosted
security assessment. No new application behavior, dependency or infrastructure
configuration is introduced by this increment.

## Assets, actors and trust boundaries

Protect synthetic contacts, guest tracking capabilities, staff credentials/MFA,
session tokens, encryption keys, stored synthetic payment ciphertext, purchased
prices, capacity reservations and immutable order/payment/audit history. Threats
include anonymous abuse, a guest attempting another order, a staff member attempting
admin operations, forged/replayed requests and accidental operator disclosure.

Browser input crosses into Express as untrusted data. Server domain services own
pricing and validation; SQLite transactions and constraints protect persisted
invariants. Guest tracking grants authorize only their limited order operations.
Individual staff sessions and admin MFA protect staff operations. Raw database/key
access is a stronger operator privilege than an application role. Future proxies
and external services introduce additional boundaries that have not been deployed
or verified here.

| Threat / protected operation | Existing controls and evidence | Remaining work |
| --- | --- | --- |
| Client changes prices, quantities or recipes | Server catalog/order validation and snapshot constraints; pricing/order tests | Integrated adversarial release review |
| Guessed order ID, stolen/replaced grant | Digest-backed protected tracking links and revocation/deadline checks; tracking tests | Review full object-access matrix against configured runtime |
| Staff escalates privileges or bypasses MFA | Server session/role enforcement, admin MFA, recovery/revision checks; auth/staff tests | Consolidate bypass/recovery acceptance evidence |
| Cross-site state change | Reviewed origin, fetch-metadata and CSRF checks on applicable routes, restrictive cookies; router tests | Review every enabled mutation and final hosting topology |
| Duplicate checkout/refund, delayed result | Request identifiers, synchronous transactions, immutable financial evidence and review paths; payment/refund tests | Concurrency and failure-recovery release assessment |
| Script injection or framing | Escaped EJS text, self-only CSP, no objects/framing, same-origin form actions | Consolidate dynamic-field XSS tests; browser/manual acceptance |
| Source, secrets or database exposed as assets | Intended static directory and explicit vendor asset; HTTP probes below | Artifact/commit secret scan and hosted routing verification |
| Forged proxy headers | No proxy trust enabled in current app; staff runtime requires configured HTTPS | Explicit reviewed proxy topology before public hosting |
| Resource exhaustion / error disclosure | Route-specific strict JSON size limits without inflation; fixed error responses; password work limits | Endpoint abuse/rate-limit inventory and load/failure checks |

## New reproducible evidence

`tests/unit/http-hosting.test.js` now adds three adversarial checks to the existing
five HTTP tests:

- Public pages, assets and missing-page responses retain CSP, nosniff and referrer
  headers and omit the Express identification header.
- Repository metadata, server source, templates, database/migration paths and
  encoded traversal requests return non-cacheable 404 responses, not private files.
- Spoofed forwarded host/protocol/address, origin and a forged cookie cannot enable
  staff routes in the unconfigured public HTTP application.

`node --test tests/unit/http-hosting.test.js`: **8 pass**, no failures/skips.
Tests use an ephemeral localhost listener and synthetic headers, with no live
customer data. The proxy test proves only the unconfigured HTTP boundary; it does
not replace configured HTTPS authentication/authorization tests or validate a
future reverse proxy. Private-file probes are representative, not an exhaustive
filesystem or deployment scan.

No rendered UI changed, so browser screenshots and Lighthouse were not repeated
for this test/documentation increment. Existing application gates remain open.
Run the existing auth, payment, tracking, staff and retention suites for their
separate behavior evidence; those implementations are not claimed as newly
completed work here.

## Open SEC-01 release checks

Complete dependency vulnerability and source/commit secret scanning without
printing secrets; investigate or explicitly accept actual findings. Complete the
cross-route authorization/CSRF/abuse matrix, configured-host/proxy review and
integrated acceptance. Keep this card open. See also
[privacy operator boundaries](privacy-operator-review.md). Do not claim security
compliance from a passing scan or these HTTP probes.
