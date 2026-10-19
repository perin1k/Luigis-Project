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
