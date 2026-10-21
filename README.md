# Luigi's Pizza

Online ordering system for Luigi's Pizzeria, developed for the DS 4330 case
project. The frontend includes a responsive homepage and a six-step ordering
wizard at `/order`: service, pizza, drinks, contact details, review, and payment.
The repository currently implements the presentation layer. Express serves views
and static assets; order submission, storage, payment processing, and backend
business rules remain integration work for the team.

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

Install Node.js 22.19 or newer with npm, then run:

```sh
npm ci
npm start
```

Visit http://127.0.0.1:3000. For automatic server restarts during development,
use `npm run dev`. `PORT` and `HOST` environment variables override the local
defaults. No database, secret, or payment credentials are needed for this page.
Production hosting and HTTPS configuration remain future decisions.

## File guide

### Local database foundation (DATA-02, catalog, orders, payments and scheduling)

Run `npm run db:migrate` to create the ignored local file
`data/luigis-demo.sqlite`. Set `DATABASE_PATH` to another local file path if needed;
its parent directory is created by the command. Keep it outside `src/public/`.
Use one Express server with local storage; do not share SQLite files over network
drives. There is no hosted database or application startup integration yet.

The migrations create empty catalog/ingredient, order/quote, financial and scheduling tables,
not user accounts or sample records. No admin credentials or customer data are seeded.
Future approved migrations will add the remaining DATA-01 entities and menu seed
strategy. The existing browser menu and server routes are unchanged.

| File | Responsibility |
| --- | --- |
| `src/data/database.js` | Server-only SQLite connections, foreign-key enforcement, recursive triggers (including replacement-write deletion guards), five-second lock wait and synchronous immediate transactions. Callers close connections. |
| `src/data/migrations.js` | Applies ordered migrations atomically; records names and SHA-256 checksums and rejects changed/unknown applied migrations. |
| `src/data/migrations/001-catalog.sql` | Strict catalog/availability tables, safe integer-cent checks, unique versioned codes and version-consistent ingredient references. Staff actor fields are text until a later identity migration adds relationships. |
| `src/data/migrations/002-orders.sql` | Orders, isolated contacts, pizza/drink details and quotes. Constraints/triggers enforce six-pizza/ten-drink aggregate limits, matching catalog versions, quote reconciliation and immutable accepted snapshots. |
| `src/data/migrations/003-payments.sql` | Test-mode payment attempts/events, cancellation decisions, full refunds and append-only allocations. Enforces quote/order references, retry uniqueness, confirmation markers and one pending/succeeded full-refund reservation per payment. |
| `src/data/migrations/004-scheduling.sql` | America/Chicago service dates, UTC hour boundaries, original booking promises, 20-minute capacity windows, 30-minute hold histories, append-only events and explicit fulfillment reviews. |
| `scripts/migrate.js` | Explicit local initialization/upgrade command; no automatic migration during web requests. |
| `tests/unit/database.test.js` | Isolated temporary-file persistence and in-memory constraint, repeatability, tamper and rollback checks. |
| `tests/unit/order-storage.test.js` | Upgrade from the actual catalog migration, persistent order snapshots, invalid/mismatched rows, aggregate limits, contact presence, replacement writes and atomic rollback. All records are synthetic. |
| `tests/unit/payment-storage.test.js` | Actual order-schema upgrades, persistence, duplicate references, cancellation holds, refund bounds, append-only accounting, competing connections and rollback. All provider evidence and identities are synthetic. |
| `tests/unit/scheduling-storage.test.js` | Actual financial-schema upgrade, retained promises, date/hold constraints, half-open window relationships, explicit review decisions, immutable histories and rollback using synthetic records. |

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

Financial integration: future server handlers must verify provider signatures,
test environment, event semantics, amount/currency and the owning order before
writing confirmation markers. An event row's `verified_at` is a record of that
service check, not signature verification performed by SQLite. No Stripe SDK,
credentials, webhook endpoint, hosted checkout or real charge/refund is added.
Keep raw card data, unfiltered provider payloads and contact data out of these
tables. Admin actor references are opaque text until the identity migration;
server authorization remains mandatory before approvals or refunds.

Payment attempts must match an accepted quote. Their state is separate from
fulfillment and never advances order preparation automatically. Multiple genuine
successful provider payments can be recorded for reconciliation; a future service
must prevent duplicate collection and flag unexpected extra successes. Provider
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
failures release it for retry. Only record failure after verifying the provider
outcome. An unexpected late success conflicting with a newer reservation needs
provider-event reconciliation; never discard it or manufacture a successful row.

Positive item/tax/tip allocations represent captured consideration; negative
reversals reference their own original component exactly once after refund
confirmation. Item allocations reference the same order's line. Negative
processor costs remain a separate expense, never a customer surcharge. The
database bounds each captured component and makes allocations append-only;
the future service must write all allocations, verify their complete sums against
the payment/refund, and mark the provider event processed in one transaction.
Partial ledger writes cannot be identified as complete merely because a payment
or refund has a succeeded marker. Provider event dates drive payment/refund
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
| `src/views/partials/ordering/payment.ejs` | Provider-independent card/Apple Pay choices, subtotal, final-total guidance, and payment status presentation. Collects no card information. |
| `src/views/partials/head.ejs` | Shared HTML metadata, title, viewport settings, and stylesheet links. |
| `src/views/partials/header.ejs` | Brand, section navigation, and keyboard skip link. |
| `src/views/partials/footer.ejs` | Shared footer and back-to-top link. |
| `src/public/css/tokens.css` | Semantic light/dark colors, font stacks, shared layout values, and matching Bootstrap CSS-variable overrides. Downloaded by the browser. |
| `src/public/css/global.css` | Responsive layout, typography, focus indicators, menu table, and decorative CSS pizza illustration. Downloaded by the browser. |
| `src/public/css/ordering.css` | Ordering cards, form fields, progress indicator, responsive cart, validation, and checkout styling. |
| `src/public/js/ordering/order-model.js` | Approved menu display data and pure integer-cent pricing preview functions. The view route reuses display data; future backend pricing must be independently authoritative. |
| `src/public/js/ordering/order-wizard.js` | Browser-only in-memory state, step navigation, focus, cart edits, validation, price previews, review, and payment status. |
| `src/public/js/checkout/payment.js` | Explicit frontend integration boundary. Currently rejects checkout attempts with a recoverable error; sends no requests and never manufactures success. |
| `src/public/js/theme.js` | Applies the initial theme before painting and manages the shared System/Light/Dark radio group, system changes, and saved appearance preference. Runs in the browser. |
| `src/public/favicon.svg` | Small local brand icon shown in the browser tab. |
| `playwright.config.js` | Starts an isolated server and configures desktop/mobile viewport tests for Chromium, Firefox, and WebKit. |
| `tests/e2e/home.spec.js` | Checks content, navigation, keyboard skip behavior, automated accessibility, overflow, no-JavaScript rendering, private-file protection, and visual snapshots. |
| `tests/e2e/ordering.spec.js` | Exercises carry-out and dine-in journeys, price previews, edits/removal, contact requirements, checkout recovery, per-step accessibility, and visual states. |
| `tests/e2e/confirmation.spec.js` | Checks the isolated confirmation preview's accessibility, sample disclaimer, navigation, indexing exclusion, and browser screenshots. |
| `tests/e2e/theme.spec.js` | Checks theme preference persistence, system changes, storage failure recovery, dark-mode ordering accessibility, and dark visual references. |
| `tests/unit/order-pricing.test.js` | Verifies size/topping pricing, combined subtotals, and invalid inputs for browser previews. |
| `tests/unit/http-hosting.test.js` | Starts an ephemeral local HTTP server to verify raw compressed/uncompressed content, encoding negotiation, caching, HEAD/range handling, and private-file protection. Uses Node's test runner. |
| `tests/e2e/*-snapshots/` | Reviewed Windows browser/viewport reference images for visual comparisons. |
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
- The checkout screen shows a subtotal, not an invented tax-inclusive total.
  Taxes, discounts, rewards requirements, cutoff/queue policy, and final totals
  remain product/backend decisions. No pickup estimates are invented.
- `payment.js` is deliberately unwired. Both payment choices preserve the cart
  and display a recoverable checkout error. There are no raw card inputs, fake
  order numbers, charges, success confirmations, or order/payment endpoints.
- A future approved backend increment must replace that boundary with secure
  provider checkout, server price validation, final totals, availability checks,
  order persistence, verified payment results, and eligible Apple Pay behavior.
- The customer checkout never displays confirmation without a verified result.
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

Run unit tests with `npm run test:unit`. Set up browsers and run browser tests:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'node_modules/.cache/ms-playwright'
npx playwright install chromium firefox webkit
npm test
npm run test:unit
```

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
operating system and browser version; the existing references are for Windows.
Browser-specific baselines belong beside the test
in the matching `*.spec.js-snapshots/` directory; reports and failure artifacts are ignored.

Automated axe checks supplement manual keyboard, zoom, and screen-reader reviews;
they do not establish full WCAG 2.2 AA conformance. WebKit tests do not substitute
for all real Safari/device checks.

For Lighthouse, start the server with `NODE_ENV=production`, then run:

```sh
npx lighthouse http://127.0.0.1:3000 --output=json --output=html --output-path=./reports/lighthouse --chrome-flags="--headless" --view=false
```

Create `reports/` first and set `CHROME_PATH` if Chrome is not discoverable.
Record Lighthouse version and configuration with the report. All four categories
must reach 100 under the project gate; report actual scores and outstanding
manual checks before accepting application work. Keep run-specific evidence out
of this README; share it at the agreed team review or release milestone. Tests
for provider checkout, verified order confirmation, and backend behavior must be
added alongside those integrations. Browser previews and automated accessibility
checks do not establish payment readiness or full WCAG conformance.
