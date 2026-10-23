# Luigi's Pizza

The internal staff sign-in orchestration lives in `src/auth/login-service.js`;
migration 008 persists throttles, short-lived MFA challenges and identity epochs.
See `docs/authentication-design.md` for contracts and limits. The configured HTTPS
runtime connects it to the staff screens described below; it creates no default accounts.

`src/auth/auth-router.js` and `src/auth/auth-transport.js` provide isolated JSON
authentication routes and cookie/CSRF helpers. `src/app.js` mounts them only with
the configured authentication runtime. Direct TLS and an explicitly configured HTTPS
origin are required; proxy/public deployment remains separately reviewed.

`src/auth/staff-account-service.js` implements revision-protected staff account
changes. The Owner manages Employee/Admin roles and admin accounts; Admins manage
employees only. Deactivation revokes access; reactivation requires fresh sign-in.
The synchronous session boundary commits authorization, revocation and audit
history together. The HTTPS account screen uses POST `/auth/staff/update`;
the legacy deactivation route also requires a current account revision.

Initial Owner setup is available with `npm run admin:setup` after database migration
and private provisioning of `MFA_ENCRYPTION_KEY_HEX`. The interactive command asks
for hidden password input and verifies authenticator enrollment before atomically
creating the first Owner. It has no default password or public route. See
`docs/staff-role-policy.md` for existing-installation owner designation, permissions
and first administrator MFA setup, and `docs/authentication-design.md` for secret
handling, one-time setup, offline password-policy files and recovery procedures.
The implementation tests created only disposable synthetic accounts.

Staff enrollment is implemented in `src/auth/staff-enrollment-service.js` and
migration 009. The isolated auth router can issue/revoke admin-authorized 24-hour
invitations and accept them with a recipient-chosen password. Only the Owner may
invite Admins, who must complete first MFA setup before signing in. Only token digests
are stored. Tokens require private manual handoff; no notifications are sent.
The HTTPS staff screens connect invitation creation/revocation and recipient enrollment.

Account maintenance provides Owner/Admin-authorized paginated account/invitation lists
and self-service password changes through the isolated router. Staff must verify
their current password; Owners/Admins additionally verify a fresh MFA code. Successful
changes revoke sessions and require sign-in again. These services expose no hash
or saved invitation token; see the authentication guide for contracts and limits.

Account recovery provides ten single-use privileged-account recovery codes, password-plus-code
authenticator replacement, and `npm run account:recover` for the approved in-person
procedure overseen by Brody. Recovery revokes access and keeps a persistent lock
until enrollment completes; interrupted recovery never restores the lost factor.
Read `docs/authentication-design.md` before using either private terminal command.
All implementation verification used disposable synthetic accounts and keys.

Online ordering system for Luigi's Pizzeria, developed for the DS 4330 case
project. The frontend includes a responsive homepage and a six-step ordering
wizard at `/order`: service, pizza, drinks, contact details, review, and payment.
Express serves the EJS presentation layer and configured application services.
The group's incremental work includes SQLite persistence, public ordering and
demonstration payments, protected tracking and staff authentication/operations.
The three-tier account policy now governs Owner, Admin and Employee access.
Implementation and acceptance are distinct; consult current design records and
Trello for remaining verification and hosted/operator work.

The approved delivery is a publicly hosted GCP/DuckDNS application with realistic
customer, employee and admin screens. Data entry, validation, persistence and
permissions must work; external services may use documented demonstration
adapters. Live Stripe setup and actual charges are not required. Read
[the integration boundary](docs/integrations.md) and
[DECISION-07](https://trello.com/c/NKGL91hy) for current requirements, including
encrypted full synthetic-number storage, which is not implemented yet.

This is a three-person group project. Shared documentation describes the project,
architecture, and contributor standards. Individual assignments and personal
collaboration preferences are managed in each member's task or chat.

The presentation stack is EJS-generated HTML, locally served Bootstrap 5.3,
custom CSS, and vanilla browser JavaScript. Bootstrap supplies the grid, buttons,
tables, form controls, and hidden-text utility; project CSS defines the Luigi's
parchment/aubergine/copper identity and ordering-specific layouts. The unused
Bootstrap JavaScript bundle is not loaded.

The customer menu retains a semantic price table. Toppings use a named HTML
list, and drink sizes/prices use a description list (`dl`, `dt`, `dd`) inside
named sections. These are informational elements rather than selection controls;
customization stays in the ordering wizard. `global.css` styles the menu/hours
cards, while `ordering.css` styles the current-step emphasis, customization
separators, choice cards, and summary. Both reuse the semantic theme colors.
The empty order summary gives a direct instruction to add a pizza; pricing and
wizard state remain the responsibility of the existing browser modules.

## Run locally

Windows, macOS and supported Linux distributions are compatibility targets.
See [cross-platform setup and verification](docs/cross-platform.md) for prerequisites,
shell examples, key/certificate differences and the current evidence limits.
Targeting an OS does not mean its full acceptance matrix has already passed.

Install Node.js 22.19 or newer with npm, then run:

```sh
npm ci
npm start
```

Visit http://127.0.0.1:3000. For automatic server restarts during development,
use `npm run dev`. `PORT` and `HOST` environment variables override the local
defaults. No database, secret, or payment credentials are needed for this page.
These commands alone start the unconfigured presentation server, not the complete
database-backed demonstration. Use the reviewed authentication/payment guides for
integrated features; do not bypass their configuration to make a platform run.
Public GCP/DuckDNS hosting is required; exact resources, HTTPS, costs and deployment
are still implementation work. Staff/admin functions stay authenticated even
though customer pages are public. No site-wide preview password gate is required.
The approved hosting direction now uses a Compute Engine Spot VM funded through
the sponsor's GCP credits. See [the hosting decision record](docs/hosting-design.md)
for confirmed choices, interruption/restart limits and outstanding configuration.
No deployment or continuous availability is established by that decision.

## File guide

`AGENTS.md` defines shared contributor practices, including preserving other
members' incremental work and synchronizing authorized Trello/GitHub updates.
`docs/integrations.md` describes actual/demo services and future Stripe replacement.
`docs/cross-platform.md` describes portable setup, platform-specific security
prerequisites and the evidence required for Windows/macOS/Linux support.
`docs/hosting-design.md` records TECH-01 ownership/funding/Spot decisions and the
remaining storage, HTTPS, cost and recovery choices before deployment.
`docs/staff-role-policy.md` records the Owner/Admin/Employee permission matrix,
owner designation for existing installations, role changes, reactivation and
first administrator MFA setup. New `admin:setup` runs create the Owner;
`npm run owner:designate` privately designates an existing admin only when no
Owner exists. No existing admin is promoted automatically by migration 014.
A card or design approval is not proof of implemented behavior.

`docs/staff-acceptance.md` describes the reusable `test:staff:unit` and
`test:staff:functional` commands, the staff CI matrix, cross-site cookie
enforcement checks, completed staff human accessibility review and separate
operator installation responsibilities.
Functional CI does not replace strict native visual acceptance.

### Session validation (BE-08, first increment)

`src/auth/session-service.js` provides server-only `createSessionService`, with
`validateSession`, `authorizeSession` and `revokeSession` methods. Pass the open
server database connection; callers own its lifecycle. This module creates no
accounts or sessions and adds no route, cookie, login, provider or MFA challenge.
Session issuance must follow actual verified sign-in/MFA in a later increment.

The future issuer must generate a random 32-byte token, encode it as 64 lowercase
hexadecimal characters, and store its SHA-256 digest. The validator hashes the
supplied bearer value and looks up the persisted session, returning only the
session ID, staff ID and current role. Never log/store the raw bearer value or
accept roles, clock values, MFA markers or session rows from a browser.

Validation acquires an immediate transaction before reading the trusted server
clock. It enforces active staff, revocation, canonical stored timestamps,
30-minute idle expiry, fixed eight-hour absolute expiry and admin MFA markers.
Expiry is enforced at the boundary, not one request later. A valid request
advances activity without extending absolute expiry; denied permissions do not
refresh it. Expired sessions are revoked with an allowlisted audit record in the
same transaction. Explicit revocation is repeatable and also audited atomically.
Invalid/backward clocks fail closed. Database/clock errors propagate: handlers
must deny access on errors, never treat them as an authenticated identity.

`src/auth/permissions.js` defines allowed employee/admin actions. Employees can
read/prepare orders and update availability; admins additionally manage employees,
menu, hours, cancellation decisions, refunds and analytics. Unknown roles/actions
are denied, including admin creation. Use `authorizeSession` for protected work;
the standalone role helper assumes its role came from trusted session validation.
This is a capability check, not order-level authorization or a fulfillment state
machine. Returned identity is not a reusable authorization grant: future handlers
must integrate fresh checks with their transactional mutations. These methods
own their transactions and are not called inside another `runTransaction`.

Tests in `tests/unit/auth-session.test.js` exercise persisted synthetic identities,
timeout boundaries, current roles, missing MFA, invalid bearer values, revocation,
backward clocks and audit rollback. The trusted clock dependency is injectable for
tests only. MFA markers record a later verifier's result; this module does not
prove a second factor, implement login rate limits or configure secure cookies.
It is not wired into Express until the sign-in and protected-route increments.

### Password foundation (BE-08)

The approved local authentication approach and remaining MFA/bootstrap/recovery
work are documented in [the authentication design](docs/authentication-design.md).
`src/auth/password-service.js` provides asynchronous salted scrypt hashing and
constant-time derived-key comparison. It bounds inputs and accepts only its
versioned hash format; strength/blocklist policy and login throttling are later
work. No dependency, account or sign-in route is added.

Migration `006-auth-credentials.sql`, registered in `src/data/migrations.js`, adds
server-only staff usernames, hashes, UTC change timestamps and revisions. Password
or username changes revoke existing sessions atomically; credential management
and its audit trail must be integrated by a later authorized service. Run
`npm run db:migrate` to upgrade. No credential is seeded by migration or menu seed.
`tests/unit/password-service.test.js` covers actual hash verification, malformed
inputs/costs, salts, Unicode byte limits, relationships and migration rollback.

### MFA foundation (BE-08)

`src/auth/mfa-service.js` supplies internal TOTP enrollment confirmation and
verification using pinned OTPAuth 9.5.2. Migration `007-mfa-secrets.sql` stores
AES-256-GCM encrypted factor material and consumed counters; it creates no actual
factor or encryption key. Tests in `tests/unit/mfa-service.test.js` use isolated
synthetic keys and check replay, encryption binding, expiry and rollback.
Run `npm ci` for the updated lockfile and `npm run db:migrate` for the schema.

The factory requires the environment-provided `MFA_ENCRYPTION_KEY_HEX` (32 random
bytes encoded as 64 lowercase hex characters). No real key is provisioned yet;
the existing website does not instantiate this service. Keep the key outside Git
and the database. Enrollment returns a sensitive provisioning URI only for a
future authorized setup page; do not log it or send it to another service.
See [the authentication design](docs/authentication-design.md) for configuration,
ten-minute pending enrollment expiry, one-step TOTP window, revocation and limits.

There is no public enrollment/login route, QR service, automatic session issuance,
recovery bypass or brute-force protection here. A later login service must bind
verified passwords and MFA results to one attempt and add throttling before
exposing them. This module's boolean result is not a client-provided proof.

### Local database foundation (DATA-02)

Run `npm run db:migrate` to create the ignored local file
`data/luigis-demo.sqlite`. Set `DATABASE_PATH` to another local file path if needed;
its parent directory is created by the command. Keep it outside `src/public/`.
Use one Express server with local storage; do not share SQLite files over network
drives. There is no hosted database or application startup integration yet.

The migrations create catalog, order, financial, scheduling, access and audit
tables. They create no accounts, credentials, customer records or sample rows.
The explicit menu seed command below adds only the approved baseline catalog.
Final DATA-02 acceptance remains separate review work.
The existing browser menu and server routes are unchanged.

| File | Responsibility |
| --- | --- |
| `src/data/database.js` | Server-only SQLite connections, foreign-key enforcement, recursive triggers (including replacement-write deletion guards), five-second lock wait and synchronous immediate transactions. Callers close connections. |
| `src/data/migrations.js` | Applies ordered migrations atomically; records names and SHA-256 checksums and rejects changed/unknown applied migrations. |
| `src/data/migrations/001-catalog.sql` | Strict catalog/availability tables, safe integer-cent checks, unique versioned codes and version-consistent ingredient references. Staff actor fields are text until a later identity migration adds relationships. |
| `src/data/migrations/002-orders.sql` | Orders, isolated contacts, pizza/drink details and quotes. Constraints/triggers enforce six-pizza/ten-drink aggregate limits, matching catalog versions, quote reconciliation and immutable accepted snapshots. |
| `src/data/migrations/003-payments.sql` | Test-mode payment attempts/events, cancellation decisions, full refunds and append-only allocations. Enforces quote/order references, retry uniqueness, confirmation markers and one pending/succeeded full-refund reservation per payment. |
| `src/data/migrations/004-scheduling.sql` | America/Chicago service dates, UTC hour boundaries, original booking promises, 20-minute capacity windows, 30-minute hold histories, append-only events and explicit fulfillment reviews. |
| `src/data/migrations/005-access-and-audit.sql` | Staff/session/MFA references, tracking digests, preview-only notification outbox and actor-linked append-only audit records with allowlisted summaries. |
| `scripts/migrate.js` | Explicit local initialization/upgrade command; no automatic migration during web requests. |
| `src/data/seed-menu.js` | Server-only approved menu initialization in one immediate transaction. Stable identities, exact approved prices/portions, manual ingredient dependencies and structural verification on reruns. Independent of browser preview data. |
| `scripts/seed-menu.js` | Explicit `db:seed` command against an already migrated local file; creates no accounts or customer fixtures. |
| `tests/unit/database.test.js` | Isolated temporary-file persistence and in-memory constraint, repeatability, tamper and rollback checks. |
| `tests/unit/order-storage.test.js` | Upgrade from the actual catalog migration, persistent order snapshots, invalid/mismatched rows, aggregate limits, contact presence, replacement writes and atomic rollback. All records are synthetic. |
| `tests/unit/payment-storage.test.js` | Actual order-schema upgrades, persistence, duplicate references, cancellation holds, refund bounds, append-only accounting, competing connections and rollback. All provider evidence and identities are synthetic. |
| `tests/unit/scheduling-storage.test.js` | Actual financial-schema upgrade, retained promises, date/hold constraints, half-open window relationships, explicit review decisions, immutable histories and rollback using synthetic records. |
| `tests/unit/access-storage.test.js` | Actual scheduling-schema upgrade, digest/session constraints, disable/revoke behavior, tracking deadlines, preview deduplication, audit protection, persistence and rollback. No real credentials or tokens. |
| `tests/unit/menu-seed.test.js` | Approved menu values, ingredient dependencies, non-destructive repeat runs, conflicting/incomplete structure, rollback and isolated CLI persistence. |

Initialize menu data explicitly after migrating:

```sh
npm run db:migrate
npm run db:seed
```

Both commands use `DATABASE_PATH` or the same default local file. Seeding does not
run migrations or create a missing file; migrate first. The reserved baseline
catalog ID is `luigis:menu:v1`, revision 1. Its `published_at` remains null until
a later approved catalog service defines publishing/selection; this command does
not activate a customer-facing menu. Deterministic IDs are reserved for the seed.
It adds three pizza sizes, two crusts, nine toppings, six approved drinks, three
drink sizes and 19 manual ingredient flags with 23 requirement relationships.
New ingredients start available for the synthetic demo. Existing ingredients
with matching reserved ID/code keep their names, flags and revisions.

The first seed inserts everything atomically. A rerun verifies required IDs,
version/code relationships and ingredient requirements without updating values.
Later price, label and availability edits are preserved; extra records are left
alone. Conflicting revision 1/identities or missing required seeded structure stop
the command without saved changes. Review conflicts explicitly; never delete a
catalog version with purchased history or use the seed as an automatic repair.
Future menu revisions require their own approved catalog workflow. The browser's
older drink labels remain unchanged until the real-data integration story.

No order/customer fixtures, user accounts, hours, tax settings, secrets, payment
records or discount policies are inserted. Tests create their synthetic records
only in isolated temporary/in-memory databases. Database files stay ignored by
Git. Restoring a preserved database should use its matching migrations and data;
do not reseed over a restore as a substitute for verifying it.

Order-storage integration: a future server service writes a draft order, contact,
lines and matching detail rows inside `runTransaction`. Draft `fulfillment_status`
and fulfillment timestamps remain null. It then calculates prices/taxes on the
server, inserts a draft quote and updates its `accepted_at` only after customer
review. Acceptance validates required contact presence, complete detail rows,
pizza-price arithmetic and the item subtotal, then links `accepted_quote_id` on
the order automatically. Full phone/email validation, current catalog price and
availability checks, quote expiration and verified payment/fulfillment transitions
remain backend responsibilities. The database does not calculate Tennessee tax
or authorize a payment. Zero-tax fixture values are not a customer pricing rule.

Accepted quotes and their order lines are immutable, even when current catalog
prices/names change. Use a new draft order for changes after acceptance in this
storage increment; do not clear acceptance or rewrite history. A later checkout
retry/edit service must explicitly manage abandoned checkout and replacement
drafts. Unaccepted quotes cannot authorize fulfillment. Customer contacts remain
separate and can be redacted without erasing purchased snapshots; this increment
does not schedule retention jobs. Use canonical UTC timestamps at write boundaries.
No public order API or customer flow is enabled by these tables.

Financial storage was implemented for Stripe test-event references, not the
newly approved provider-free demonstration processor. Its existing event/mode
constraints and confirmation markers remain enforced; `verified_at` is a service
record, not signature verification by SQLite. An additive schema/service design
must accommodate genuine server demo outcomes without forging Stripe evidence.
No SDK, webhook, public checkout, encrypted card store or real charge/refund is
implemented by these tables. Keep real cards, security codes, plaintext synthetic
numbers, unfiltered payloads and contact data out of these financial tables.
Required full synthetic numbers need a separately reviewed encrypted record.
Server authorization remains mandatory before approvals or refunds.

Payment attempts must match an accepted quote. Their state is separate from
fulfillment and never advances order preparation automatically. The existing
schema can record multiple successful test-provider references for reconciliation;
the future demo service must prevent duplicate submissions and flag unexpected
extra successes rather than pretending money was collected. Provider
IDs and scoped retry keys are unique and cannot be replaced after assignment.
Confirmed financial records, processed events and allocation rows retain history.
Deleting an entire disposable demo database at teardown is separate from deleting
individual financial records, which is blocked.

Cancellation requests start pending. Customer requests after preparation are
rejected, and a pending request blocks preparation/status advancement until an
explicit decision. Restaurant-caused requests remain possible after preparation.
Refunds require an approved request on the same paid order. Demo refunds must
equal the full payment, including tax/tip, with no retained-fee recovery.
Pending refunds reserve that amount, succeeded refunds consume it, and confirmed
failures release it for retry. Only record failure after confirming the actual
adapter outcome. An unexpected late success conflicting with a newer reservation
needs reconciliation; never discard it or invent Stripe confirmation evidence.

Positive item/tax/tip allocations represent captured consideration; negative
reversals reference their own original component exactly once after refund
confirmation. Item allocations reference the same order's line. Negative
processor costs remain a separate expense, never a customer surcharge. The
database bounds each captured component and makes allocations append-only;
the future service must write all allocations, verify their complete sums against
the payment/refund, and mark the provider event processed in one transaction.
Partial ledger writes cannot be identified as complete merely because a payment
or refund has a succeeded marker. Confirmed adapter event dates drive payment/refund
accounting; record canonical UTC instants and preserve the original payment date.

Scheduling integration: service dates identify America/Chicago calendar days;
all timestamp fields in migration 004 use canonical UTC text with milliseconds
(`YYYY-MM-DDTHH:mm:ss.sssZ`). The future scheduling service must resolve local
hours with DST and verify that instants belong to the intended local day. The
database validates date/timestamp formats, ordered hours, cutoff at closing minus
30 minutes and latest pickup at closing minus ten minutes. It does not generate
normal hours, holiday exceptions, scheduled slots or next-open-day options.

Bookings preserve one original promise per order, including off-grid ASAP times.
This storage increment blocks changing/deleting the promise; a later explicit
rescheduling design must retain original history and review affected paid orders.
Hours changes do not rewrite bookings. The service must open deduplicated reviews
for affected orders and obtain a recorded decision; the database does not create
reviews or notify anyone automatically. Staff actor fields remain opaque text
until identity relationships are implemented.

Capacity windows describe half-open 20-minute spans with six demo pizza units.
Holds must match the booking's service day/window, reserve one to six units and
start active with exactly 30 minutes to expiry. One active/confirmed hold per
booking is allowed; drink-only bookings need no pizza hold. Confirmation must
precede expiry; release preserves prior confirmation; expired/released holds
cannot reopen. Early checkout expiry/failure uses released, not expired. History
is retained, and no automatic expiry worker runs in this increment.

These row checks do **not** enforce either per-window aggregate capacity or the
six-pizza rolling limit. Before accepting bookings, a later service must serialize
competing writes, expire/release stale holds explicitly, count all active and
confirmed reservations across every affected rolling span and verify held units
against actual pizza quantities. Fixed clock buckets are insufficient. It must
also enforce lead/cutoff rules, current availability, verified payment and
cancellation holds before preparation. Late payments require review; a confirmed
hold alone is not payment evidence. Order events are append-only records with
unique positive sequences, not an automatic fulfillment state machine. Write the
event and its authorized state mutation in the same transaction.

Access integration: migration 005 stores staff identities and references only.
There is no login endpoint, password store, authenticator secret, MFA challenge,
provider setup or admin bootstrap. `identity_subject`/`provider_reference` are
opaque identity-system references, not credentials. Session/tracking digest
columns require 64 lowercase hexadecimal characters; this validates format,
not that a value was securely generated or hashed. A later service must generate
strong random bearer tokens, persist only their cryptographic digests, transport
them safely, and validate them on every protected request.

Sessions use canonical UTC timestamps and a fixed eight-hour absolute expiry.
Stored activity must advance monotonically without bridging a 30-minute idle
gap. The application must also compare the current trusted server time to the
last activity and expiry before accepting a request; an unchanged row does not
prove a session is still valid. Admin sessions require an MFA-verification marker,
which records a future service check rather than performing MFA. Disabling staff
revokes their unrevoked sessions; revoking an MFA reference revokes all of that
user's MFA-marked sessions. Roles cannot change until sessions are explicitly
revoked. These constraints do not grant anyone account-management permission.

Tracking grants permit one unrevoked grant per order. A retention deadline may
remain null while the final outcome and pending cancellation/refund resolution
are unknown; the future service must establish the approved seven-day deadline
after resolution and reject links at that deadline. Null expiry is not permission
for permanent access. Replacement requires revocation and cannot extend any
established deadline. Retention jobs and manual admin recovery are not implemented.
Grant rows may be deleted during approved cleanup, so the service must also check
the order's retention state before issuing a new grant after cleanup.

The notification outbox stores only source-event/template/channel/state metadata,
with no recipient address, message body, bearer link or provider-delivery fields.
Its outcomes are pending, previewed or failed; it cannot claim sent/delivered.
Later preview rendering resolves restricted contact data at the point of use;
no worker or email/SMS sender runs here. Delete preview metadata with contacts
under the approved retention job. Audit summaries/reasons use explicit allowlists;
actor references link to staff (null for system actions). Other identifiers must
still be validated as opaque IDs by the service, never filled with customer data
or secrets. Audits retain history until project teardown.

Existing catalog, financial and scheduling actor fields remain opaque text;
migration 005 does not rewrite historical rows or retrofit those fields with
foreign keys. New session, MFA and audit relationships have foreign keys. Future
authorized services must validate active actors and admin permissions for the
older records as well, with a separately reviewed migration for historical actor
mapping if needed. Storage existence is not authentication or authorization.

Requires the repository's Node 22.19+ runtime; built-in `node:sqlite` is experimental
and may emit a warning. No dependency was added. Database operations are synchronous
and serialize writers; suitable for the small disposable demo, not a multi-server
deployment assumption.

Recovery: failed migration batches roll back, including their version records.
Applied migration files must never be edited; add a new numbered migration instead.
There is no destructive down-migration command. For a disposable test database,
stop all users, move the database aside and rerun migrations to create an empty
one. To preserve data before a future upgrade, close all database connections
before copying the file, retain matching application/migration versions, and
verify reopening and integrity before use. Automated backups are not configured.

The [DATA-01 storage schema proposal](docs/data-schema-proposal.md) documents
proposed server-side persistence relationships, financial snapshots, scheduling,
access controls, and acceptance scenarios. The proposal is approved, not a database
implementation; database selection and migrations remain separate approvals.

```text
src/
├── app.js
├── server.js
├── views/
│   ├── pages/
│   │   ├── home.ejs
│   │   ├── order.ejs
│   │   └── confirmation.ejs
│   └── partials/
│       ├── head.ejs
│       ├── header.ejs
│       ├── footer.ejs
│       └── ordering/
│           ├── service-type.ejs
│           ├── pizza-builder.ejs
│           ├── drinks.ejs
│           ├── customer-details.ejs
│           ├── order-review.ejs
│           └── payment.ejs
└── public/
    ├── favicon.svg
    ├── css/
    │   ├── tokens.css
    │   ├── global.css
    │   └── ordering.css
    └── js/
        ├── theme.js
        ├── ordering/
        │   ├── order-model.js
        │   └── order-wizard.js
        └── checkout/payment.js
tests/
├── unit/order-pricing.test.js
└── e2e/
    ├── home.spec.js
    ├── confirmation.spec.js
    ├── ordering.spec.js
    ├── theme.spec.js
    ├── home.spec.js-snapshots/
    ├── confirmation.spec.js-snapshots/
    ├── theme.spec.js-snapshots/
    └── ordering.spec.js-snapshots/
playwright.config.js
```

| File | Responsibility |
| --- | --- |
| `AGENTS.md` | Human approval workflow, selected stack, naming, business rules, and quality gates. |
| `package.json` | Application metadata, runtime requirements, dependencies, and scripts. |
| `package-lock.json` | Exact dependency tree for reproducible `npm ci` installs. |
| `.gitignore` | Excludes dependencies, local secrets, caches, and generated test/audit reports. |
| `src/app.js` | Configures Express, EJS, security headers, public assets, view data, and error responses. Negotiates gzip/identity for rendered pages and explicitly listed public CSS/JavaScript, including only the intended Bootstrap stylesheet at `/vendor/bootstrap.min.css`. Runs on the server. |
| `src/server.js` | Validates the port and starts the HTTP listener. Runs on the server. |
| `src/views/pages/home.ejs` | Assembles the homepage: introduction, menu, toppings, drinks, hours, and service information. Rendered on the server. |
| `src/views/pages/order.ejs` | Assembles the six ordering sections, progress indicator, navigation buttons, and live cart summary. Includes the browser module and order stylesheet. |
| `src/views/pages/confirmation.ejs` | Finished-product confirmation layout with escaped display data. Currently reachable only through a clearly labeled sample design preview. |
| `src/views/partials/ordering/service-type.ejs` | Dine-in/carry-out choice with descriptive native radio controls. |
| `src/views/partials/ordering/pizza-builder.ejs` | Size, crust, toppings, quantity, and editable pizza list. |
| `src/views/partials/ordering/drinks.ejs` | Separate quantities for each listed beverage and size; drinks are optional. |
| `src/views/partials/ordering/customer-details.ejs` | Name and carry-out phone controls with browser autocomplete hints. |
| `src/views/partials/ordering/order-review.ejs` | Container for the editable order review, populated using safe DOM text insertion. |
| `src/views/partials/ordering/payment.ejs` | Card/Apple Pay presentation, subtotal and public test-data/no-charge disclosure associated with the method group. Currently collects no card information or native Wallet payment. |
| `src/views/partials/head.ejs` | Shared HTML metadata, title, viewport settings, and stylesheet links. |
| `src/views/partials/header.ejs` | Brand, section navigation, and keyboard skip link. |
| `src/views/partials/footer.ejs` | Shared footer and back-to-top link. |
| `src/public/css/tokens.css` | Semantic light/dark colors, font stacks, shared layout values, and matching Bootstrap CSS-variable overrides. Downloaded by the browser. |
| `src/public/css/global.css` | Responsive layout, typography, focus indicators, menu table, and decorative CSS pizza illustration. Downloaded by the browser. |
| `src/public/css/ordering.css` | Ordering cards, form fields, progress indicator, responsive cart, validation, and checkout styling. |
| `src/public/js/ordering/order-model.js` | Approved menu display data and pure integer-cent pricing preview functions. The view route reuses display data; future backend pricing must be independently authoritative. |
| `src/public/js/ordering/order-wizard.js` | Browser-only in-memory state, step navigation, focus, cart edits, validation, price previews, review, and payment status. |
| `src/public/js/checkout/payment.js` | Unwired boundary that rejects recoverably and sends no requests. A reviewed server demo processor must replace it before persistent orders/payments and success are enabled. |
| `src/public/js/theme.js` | Applies the initial theme before painting and manages the shared System/Light/Dark radio group, system changes, and saved appearance preference. Runs in the browser. |
| `src/public/favicon.svg` | Small local brand icon shown in the browser tab. |
| `playwright.config.js` | Starts an isolated server and configures desktop/mobile viewport tests for Chromium, Firefox, and WebKit. |
| `tests/e2e/home.spec.js` | Checks content, navigation, keyboard skip behavior, automated accessibility, overflow, no-JavaScript rendering, private-file protection, and visual snapshots. |
| `tests/e2e/ordering.spec.js` | Exercises carry-out and dine-in journeys, price previews, edits/removal, contact requirements, checkout recovery, per-step accessibility, and visual states. |
| `tests/e2e/confirmation.spec.js` | Checks the isolated confirmation preview's accessibility, sample disclaimer, navigation, indexing exclusion, and browser screenshots. |
| `tests/e2e/theme.spec.js` | Checks theme preference persistence, system changes, storage failure recovery, dark-mode ordering accessibility, and dark visual references. |
| `tests/unit/order-pricing.test.js` | Verifies size/topping pricing, combined subtotals, and invalid inputs for browser previews. |
| `tests/unit/http-hosting.test.js` | Starts an ephemeral local HTTP server to verify raw compressed/uncompressed content, encoding negotiation, caching, HEAD/range handling, and private-file protection. Uses Node's test runner. |
| `tests/e2e/*-snapshots/` | Reviewed OS/browser/viewport reference images for visual comparisons; references in other suites may target different operating systems. |
| `README.md` | Setup, file explanations, and verification instructions. |

Request flow: browser requests `/` or `/order` → Express renders the relevant EJS
page and partials → browser receives HTML and CSS. EJS stays on the server. On
`/order`, `order-wizard.js` manages interactions and calls pure preview functions
from `order-model.js`. All pages use the small shared theme script; the homepage
content and navigation work without browser JavaScript.

### Reading EJS and Bootstrap together

EJS templates remain ordinary HTML with a few server-side tags:

- `<%= strTitle %>` outputs escaped text from supplied data.
- `<% ... %>` runs a loop or condition while rendering the HTML.
- `<%- include('../partials/header') %>` inserts a trusted shared template.
  Do not use unescaped output for customer-entered text.

Bootstrap classes are attached to the resulting HTML normally:

```html
<a class="btn btn-primary" href="/order">Start your order</a>
```

Here, `btn` supplies the button foundation, `btn-primary` selects the primary
variant, and the project theme supplies its colors. On the homepage, `row`,
`col-lg-6`, and `g-5` define a responsive two-column layout and spacing. EJS has
no effect on how those classes work in the browser.

### Appearance

The header's native radio group offers System, Light, and Dark. System follows the
visitor's OS preference, including changes while the page is open. An explicit
choice is stored as `luigis-appearance` in local storage and synchronized across
pages and tabs. Only the appearance choice is stored; no customer/order data is
persisted. Theme changes still work for the current page if storage is blocked.

Bootstrap and custom styles share `data-bs-theme` on the HTML element. All brand
and control colors are maintained in `tokens.css`; avoid adding fixed light-only
colors to components. Bootstrap is installed through the lockfile, so `npm ci`
provides the required asset without a CDN or manual file copy.

### Text response hosting

Express sends rendered EJS pages and the explicitly listed public CSS/JavaScript
as gzip when the visitor accepts it, or identity when preferred. The response
varies by `Accept-Encoding`; requests rejecting both supported encodings receive
406. The HTML, styles, and browser code are unchanged after decoding.

Public text assets are read and compressed once at server startup, cached for one
hour by clients, and retain representation-specific ETag validation. Restart the
server after editing an asset in this list; add new CSS/JavaScript paths to
`mapTextAssets` to enable the same handling. Rendered HTML is compressed per
request and does not receive the public asset cache policy. Other public files
and byte-range requests for project assets retain Express static handling.
Only the Bootstrap stylesheet is exposed from `node_modules`. No compression
dependency, order-processing endpoint, or payment integration is introduced.

### Current implementation boundaries and integration handoff

- All ordering state lives in browser memory. Back/Continue and review edits
  preserve selections; reloading or leaving the page clears the draft. Contact
  information is not stored in local storage or sent anywhere.
- Add or save a pizza explicitly before continuing. Multiple pizzas can have
  different sizes, crusts, toppings, and quantities. Prices are browser previews.
- The checkout screen currently shows a subtotal. Approved tax/rounding,
  six-pizza capacity, retention and tracking refinements are recorded in the dated
  schema document; implementation remains separate. Do not invent pickup times
  or claim authoritative totals before the relevant server service exists.
- `payment.js` is deliberately unwired. Both payment choices preserve the cart
  and display a recoverable checkout error. There are no raw card inputs, fake
  order numbers, charges, success confirmations, or order/payment endpoints.
- Checkout now discloses test data/no charge before either method can be used.
  Apple Pay wording does not promise a Wallet charge. This increment adds no
  capture form, encryption, endpoint, successful payment or order record.
- A future approved backend increment must provide validated server demonstration
  processing, encrypted synthetic-number storage, authoritative totals/availability
  and actual order/payment persistence. Real Stripe/Apple Pay setup is deferred.
- The intended screen may say “Payment successful” after a committed server demo
  result, not a browser-only redirect or forged Stripe event.
  Review its visual design separately at `/preview/confirmation`: this is a
  clearly labeled sample with no order number or charge, excluded from indexing.
  Its `confirmation.ejs` template accepts display data for the future integration.
  The design-preview disclaimer must remain visible on the sample route.
- Optional rewards are deferred until their
  fields and consent rules are agreed; a guest can use the entire current flow.
- Keep all development status and integration notes here, rather than adding
  temporary "coming soon" messages to customer-facing screens.
- Without JavaScript, the homepage/menu remain available and `/order` offers an
  accessible explanation and menu link; customization requires JavaScript.

## Verification

The test source is reusable project code: each team member can rerun it after a
change to catch regressions. Generated reports are disposable outputs, not the
tests themselves. Keep the test source and reviewed reference images in version
control; generated reports, traces, and failure captures are ignored by Git.

| Reusable test | What it protects |
| --- | --- |
| `tests/unit/order-pricing.test.js` | Browser price previews: size/topping arithmetic, quantities, combined pizza/drink subtotals, formatting, and rejection of unsupported inputs. Uses Node's built-in test runner without opening a browser. |
| `tests/unit/http-hosting.test.js` | HTTP integration coverage run by the same Node test script: gzip content integrity, identity fallback/refusals, cache validation, HEAD/ranges, and private-file protection. Uses an ephemeral loopback port without a browser. |
| `tests/e2e/home.spec.js` | Homepage menu content, navigation to ordering, keyboard skip navigation, automated accessibility, no-JavaScript fallback, private-file protection, and layout appearance. |
| `tests/e2e/ordering.spec.js` | Carry-out and dine-in journeys, edits/removal, required contact fields, keyboard behavior, invalid quantities, safe text rendering, payment-error recovery, per-step accessibility, and narrow-screen layouts. |
| `tests/e2e/confirmation.spec.js` | Confirmation design preview: clear sample labeling, accessibility, navigation, indexing exclusion, and appearance. It does not verify a real submitted order. |
| `tests/e2e/theme.spec.js` | Appearance preferences, system color-scheme changes, blocked storage, and accessible dark-mode screens. |
| `tests/e2e/*.spec.js-snapshots/` | Reference images used by visual tests to detect unintended layout changes. They are test inputs, not reports or deliverable screenshots. |
| `playwright.config.js` | Runs the browser tests in Chromium, Firefox, and WebKit at desktop and mobile viewport sizes and manages the local test server. |

Run unit tests with `npm run test:unit`. After `npm ci`, install the locked browser
binaries and run browser tests. In Windows PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'node_modules/.cache/ms-playwright'
npx playwright install chromium firefox webkit
npm test
npm run test:unit
```

In macOS/Linux Bash or Zsh:

```sh
export PLAYWRIGHT_BROWSERS_PATH="$PWD/node_modules/.cache/ms-playwright"
npx playwright install chromium firefox webkit
npm test
npm run test:unit
```

HTTPS fixtures also need OpenSSL on PATH. Linux browser system dependencies may
need separate, reviewed OS package installation. See the
[platform prerequisites](docs/cross-platform.md#prerequisites) before testing.

The configuration looks for browsers inside
`node_modules/.cache/ms-playwright`. Set `PLAYWRIGHT_BROWSERS_PATH` to that
absolute directory before the install command (as above), or supply the absolute location
of an existing installation when running tests.

Visual tests require screenshots captured in the same OS/browser environment.
Ordering captures start at the top of the page to keep sticky summaries in a
consistent position:

```sh
npm run test:visual -- --update-snapshots
npm run test:visual
```

Review generated baseline images before accepting them. Screenshot creation
alone is not visual approval. Review changes before updating baselines; never
replace them merely to silence a failed comparison. Baselines depend on the
operating system and browser version. The repository contains Windows (`win32`)
and macOS (`darwin`) references with different coverage and freshness. Linux
references and cross-platform release acceptance remain outstanding; missing
baselines are not passes. Follow the [visual verification policy](docs/cross-platform.md#visual-references).
Browser-specific baselines belong beside the test
in the matching `*.spec.js-snapshots/` directory; reports and failure artifacts are ignored.

Automated axe checks supplement manual keyboard, zoom, and screen-reader reviews;
they do not establish full WCAG 2.2 AA conformance. WebKit tests do not substitute
for all real Safari/device checks.

For Lighthouse, start the server in production mode using the shell-specific
examples in [the cross-platform guide](docs/cross-platform.md#shell-configuration), then run:

```sh
npx lighthouse http://127.0.0.1:3000 --output=json --output=html --output-path=./reports/lighthouse --chrome-flags="--headless" --view=false
```

Create `reports/` first and set `CHROME_PATH` if Chrome is not discoverable.
Record Lighthouse version and configuration with the report. All four categories
must reach 100 under the project gate; report actual scores and outstanding
manual checks before accepting application work. Keep run-specific evidence out
of this README; share it at the agreed team review or release milestone. Tests
for demo processing, encrypted synthetic storage, persisted order confirmation
and backend behavior must accompany those implementations. Actual provider/Apple
Pay tests belong to future integration. Browser previews and automated checks
do not establish full WCAG conformance or readiness to process real payments.

Staff authentication integration: `src/auth/auth-runtime.js` composes server-side
services, `src/app.js` mounts private staff views only when supplied that runtime,
and `src/server.js` enables it only with complete direct-HTTPS configuration.
`src/views/pages/staff.ejs` and `src/views/partials/staff/field.ejs` render staff
forms; `src/public/js/staff.js` handles browser requests/focus/private displays;
`src/public/css/staff.css` supplies responsive brand styling. Browser code never
establishes permissions. See [authentication design](docs/authentication-design.md#mounted-staff-experience-be-08--fe-08)
for settings, private operator setup, limitations and the isolated three-browser
suite (`npx playwright test -c playwright.staff.config.js`).

Database-backed menu/pricing (BE-01): `src/ordering/catalog-service.js` validates
current catalog/ingredient availability and computes integer-cent totals;
`src/ordering/pricing-router.js` provides no-store catalog/preview endpoints.
`src/app.js` supplies menu data to ordering EJS; the browser model/wizard show
previews and require current server totals plus explicit review before payment.
`DATABASE_PATH` alone enables public catalog/pricing and the BE-02 unpaid order
submission below, without mounting staff authentication. Payment remains separate.
See [pricing design](docs/pricing-design.md) for the request contract, tax policy,
configuration and verification commands.

BE-02 unpaid persistence: [service/API and browser integration guide](docs/order-submission-design.md).
Order saving is enabled with a configured database. Scheduling, payment confirmation
and final acceptance remain separate; use invented contacts only.

Pickup scheduling (BE-10): [rules, API, transaction and file guide](docs/scheduling-design.md).
Configured order submission now requires an available ready-time selection and
saves a 30-minute capacity hold atomically; payment confirmation remains separate.

Demonstration payments (BE-03): [payment, encryption and operator key guide](docs/demo-payment-design.md).
The configured database runtime supports generated test identities and committed
payment/order confirmation. Set `DEMO_PAYMENT_KEYS_PATH` to an operator-owned,
private external key-ring file; checkout fails safely when it is not configured.
No real card entry, charge or native Apple Wallet operation occurs.

Authorized staff queue (BE-04): [queue/API/privacy and file guide](docs/staff-orders-design.md).
Available through the configured direct-HTTPS staff runtime and individual staff
login; the public HTTP ordering preview does not expose employee order records.

Staff fulfillment progress and its integration boundaries: [BE-05 progress guide](docs/order-progress-design.md).

Private guest tracking and administrator decisions: [BE-05 integration guide](docs/tracking-and-exceptions.md).

Customer cancellation and full demonstration refunds (BE-09):
[refund, allocation, retry and file guide](docs/demo-refund-design.md).
Administrators review cancellations and refunds separately; no real money moves.

Internal confirmation, Ready, cancellation and refund previews (BE-11):
[notification processor, private UI, retention and file guide](docs/notification-preview-design.md).
These are internal previews only; no email or SMS is sent.

Admin-only sales reporting API (BE-06 increment):
[metric definitions, integration points and verification](docs/sales-analytics-design.md).
The private owner dashboard uses native date filters and purchased item snapshots;
full-story acceptance remains open.

Disposable-demo contact, tracking, preview and ciphertext cleanup (SEC-02 increment):
[retention rules, worker integration and verification](docs/retention-enforcement.md).

Admin/Owner customer contact correction and limited private data review:
[privacy workflow, API, migration and file guide](docs/privacy-request-workflow.md).
The page uses current staff MFA/CSRF protections; it adds no public data lookup.
Focused security/privacy verification: `node scripts/verify-security.js` and
`node node_modules/@playwright/test/cli.js test -c playwright.security.config.js`.

Deployment preparation (OPS-01–07): [GCP/DuckDNS runbook](docs/deployment-runbook.md).
This follows the approved Spot/direct-HTTPS design; it does not authorize or claim
resource provisioning, publication, spending or completed hosted verification.

Local health probes and safe operational events (OPS-04):
[contracts, incident procedures and remaining hosted gates](docs/operations-monitoring.md).
These do not configure alert delivery, log rotation or a hosted monitor.

Disposable-data recreation (OPS-05):
[isolated rehearsal, safe operator sequence and recovery limits](docs/disposable-data-recreation.md).
A fresh seeded database is not restoration of order history or lost keys.

Authentication decision record (TECH-04):
[approved identity, hierarchy, MFA and recovery choices](docs/authentication-decisions.md).
Decision completion does not establish acceptance of the coordinated BE-08/FE-08 rollout.

Payment security and accounting decisions (TECH-06):
[approved safeguards, key lifecycle, retention and refund choices](docs/payment-security-decisions.md).
Decision completion does not replace payment, refund, security or release acceptance.

Scheduling, tracking and notification decisions (TECH-05):
[policy, concurrency, private-access and worker contract map](docs/scheduling-tracking-decisions.md).
Feature and release acceptance remain on their implementation and QA cards.

Retention and disposable-data decisions (TECH-02):
[cleanup, sanitized history, key and copy lifecycle map](docs/retention-decisions.md).
Broader privacy and hosted-operation acceptance remain separate.

Review preparation (TECH-03):
[approved team-led review, flexible timing and evidence checklist](docs/review-access-plan.md).
Hosting is not activated and uninterrupted availability is not promised.

DATA-02: [current storage verification and remaining platform evidence](docs/verification/data-02-storage.md).

FE-02: [persisted availability and stale-draft server integration evidence](docs/verification/fe-02-integration.md).

BE-10: [inventory review, cancellation and full-refund lifecycle evidence](docs/verification/be-10-lifecycle.md).

FE-10: [connected private inventory, cancellation and refund status evidence](docs/verification/fe-10-connected-status.md).

Customer checkout: [current BE-02/BE-03 integration and reconciled FE-03 receipt evidence](docs/verification/customer-checkout-checkpoint.md).

QA-02: [consolidated payment/privacy evidence and remaining operator gates](docs/verification/qa-02-payment-privacy.md).

QA-03: [approved targets, race/recovery evidence and hosted measurement procedure](docs/verification/qa-03-concurrency-recovery.md).

OPS-01 preparation: [review-only systemd/environment templates and rollback checks](deploy/README.md).

TEST-02: [scheduling, persisted checkout and demonstration payment checkpoint](docs/verification/test-02-checkout-acceptance.md).
