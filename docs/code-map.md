# Developer code map

This guide is for developers maintaining the application. Customers and restaurant
staff should use [Using your website](handoff.md). Source comments explain intent
and important boundaries; the current implementation and approved requirements
remain authoritative. A comment is not evidence that an unrun test passed.

## Follow a customer order

1. `src/app.js` composes shared security, public assets, page rendering and optional
   integrated routers. `src/server.js` loads runtime configuration, starts the
   listener and supervises background work. Rendering a page alone does not set up
   accounts, persistent ordering or keys.
2. `src/views/pages/order.ejs` includes the ordering fragments in
   `src/views/partials/ordering/`. EJS executes on the server; the customer receives
   HTML. Escaped output handles dynamic text; trusted includes use unescaped EJS.
   The welcome-only home links to `pages/menu.ejs`; its shared menu fragment reads
   `ordering/public-menu.js`, using the current catalog instead of copied prices.
   Project stylesheets use a public-content fingerprint in their URL to load new
   styles after a release; this is separate from private session or key versioning.
3. `src/public/js/ordering/order-wizard.js` manages selections, accessible
   navigation, editing, server price/slot refresh and payment reconciliation.
   `order-model.js` supplies display helpers. Browser prices are previews.
4. `src/ordering/catalog-service.js` validates choices and computes authoritative
   integer-cent totals. `scheduling-service.js` uses Chicago service dates and ISO
   UTC instants for cutoffs, ready times and rolling capacity. `order-service.js`
   saves the accepted unpaid snapshot and hold in one synchronous transaction.
5. `src/payments/demo-payment-service.js` confirms the no-charge demonstration
   outcome and records real application state. Request identities make retries
   safe. An interrupted response must reconcile the same request. The synthetic
   vault encrypts generated test identities; it is not a real card processor.
6. Tracking uses a private random grant, not contact matching. Its service stores
   a digest; the browser passes the fragment token in request bodies. Notifications
   are internal previews tied to genuine events, not externally delivered messages.

## Identity and staff work

| Location | Responsibility and boundary |
| --- | --- |
| `src/customer/` | Separate customer identity, profile, recovery, account deletion and session-associated order history; guest ordering remains available |
| `src/auth/` | Staff password/session/MFA/recovery, invitations and role changes; Owner is an explicit persisted privilege |
| `src/staff/orders-service.js` and `orders-router.js` | Authorized queue/detail projections and HTTP wiring; warnings do not resolve themselves |
| `src/staff/order-progress-service.js` | Revision-checked kitchen transitions and preparation safeguards |
| `src/staff/order-exception-service.js` | Administrative cancellation/review/no-show decisions; refund approval remains separate |
| `src/staff/menu-service.js` | Role-checked availability/menu/hours writes with review for affected bookings |
| `src/staff/analytics-service.js` | Owner reporting; event-period financials, order cohorts and pickup workloads have different meanings |
| `src/staff/privacy-service.js` | Verified contact correction and limited information copy without changing purchased prices or privacy deadlines |
| `src/public/js/staff*.js` | Browser controls, announcements, request generations and private-content cleanup; permissions stay server-side |

Password derivation runs asynchronously outside SQLite write transactions. Services
recheck live credential/account versions afterward. Do not remove those checks as
redundant. MFA counters, invitation digests and one-use recovery records protect
different kinds of replay; a browser role or hidden button grants no permission.

## Data, security and operations

- `src/data/database.js` owns synchronous transactions. `migrations.js` applies
  checksum-verified additions; existing SQL migrations remain immutable.
  `seed-menu.js` is explicit setup, never a repair that overwrites a live menu.
- `order-retention.js` calculates shared privacy deadlines. `retention-service.js`
  redacts/removes limited private records in bounded batches while preserving
  sanitized history. Unresolved cases can postpone expiry. Account deletion,
  order cancellation and a refund are separate actions.
- `src/security/proxy-boundary.js` authenticates the approved loopback TLS proxy
  before accepting a forwarded client address. Direct recovery mode uses the real
  socket peer. Do not replace this with blanket Express proxy trust.
- `src/operations/` supplies minimal health responses, sanitized request outcomes
  and worker failure/recovery state. Health, authorization and a successful order
  are separate checks.
- `scripts/` contains explicit setup, migration, release, credential, configuration
  and verification tools. Reading their source is safe; running a provisioning,
  recovery or maintenance CLI can change real state and needs its applicable scope.
  `deploy/` holds the reviewed Ubuntu/systemd lifecycle procedures. Follow the
  [proxy](nginx-proxy.md), [maintenance](maintenance-continuity.md) and
  [custody](secret-custody.md) guides rather than guessing execution order.
- `scripts/remove-disposable-order.js` is the separately approved fixed-target
  exception, documented in its [execution record](verification/disposable-order-cleanup.md).
  It does not create a general order-deletion policy or web feature.

## Presentation and reusable tests

Shared EJS fragments provide metadata, navigation, footer and repeated form fields.
Ordering fragments correspond to wizard sections; staff page templates provide
the DOM contracts consumed by staff browser modules. Template annotations use EJS
comments so they do not add response text or whitespace. Keep IDs, data attributes,
labels and focus targets aligned when making a functional change.

`src/public/css/tokens.css` defines semantic light/dark values. `global.css` handles
shared layout and interaction; `ordering.css` and `staff.css` handle those workflows.
Rules and rendered whitespace were preserved during this annotation pass. Vendor
assets, generated files, the lockfile, applied SQL and pinned blocklists were not
reformatted. Formatting alone does not prove accessibility or performance.

`tests/unit/` covers domain, persistence, permissions, transport and maintenance
behavior. `tests/fixtures/` creates disposable application state; its synthetic
accounts and private helper endpoints must not be enabled on the public host.
The `*-e2e/` and `tests/e2e/` suites exercise browser journeys. Playwright configs
choose fixtures, viewports and supported engines. Reuse those helpers and real
assertions rather than copying implementation logic into a new test. Visual
references are specific to their browser/platform and need actual review.

`playwright.cleanup-regression.config.js` groups affected existing screen tests by
fixture using `CLEANUP_SUITE`. The matching workflow collects synthetic candidates
or performs strict comparisons. Ordinary public/staff configurations and their
TEST/SEC derivatives share the redesign's `cleanup-regression` reference paths;
historical references remain available for their original revisions. The focused
cleanup configurations keep their separately reviewed `cleanup-ci` references.
See [cleanup verification](verification/end-user-cleanup.md) for source runs,
reviewed image manifests and the distinction between collection and acceptance.

See [readability verification](verification/readability.md) for the exact
behavior-preservation checks. Final hosted/browser/accessibility/Lighthouse release
acceptance remains on its existing QA cards and TEST-04.
