# BE-01 pricing verification

## Follow-up verification — 2026-10-22

Status: implementation verified with the correction below; **card acceptance is
still open** for Firefox UI and the remaining manual accessibility review. No
completion badge, commit, push or deployment is established by this record.

### Change and regression evidence

- Reproduced a keyboard failure in both service types: after changing the tip,
  the price request disabled the focused Continue button. Focus fell to the body,
  so pressing Enter again did not proceed to payment.
- `src/public/js/ordering/order-wizard.js` now restores the previously focused
  navigation button after a price check only when the same step is active and
  focus is still on the body. It preserves focus moved elsewhere by the visitor.
- Added keyboard-only carry-out and dine-in journeys in
  `tests/pricing-e2e/pricing.spec.js`. They check step-heading focus, server totals,
  the explicit updated-tip review, restored button focus and Back navigation.
- Corrected `tests/audit-pricing.js` to report the actual operating system and
  architecture instead of always identifying the audit as macOS arm64.

### Verified passes

- Windows `10.0.26200` x64, Node `24.19.0`, locked Playwright `1.64.1`,
  Lighthouse `13.5.0`. Restored dependencies using `npm ci --ignore-scripts` via
  bundled pnpm's npm runner; no manifest or lockfile changes.
- Focused catalog, pricing HTTP and browser-model unit tests: **14/14 passed**.
- Full unit/integration suite: **232/232 passed**, run serially with the existing
  Git installation's OpenSSL on the test process PATH.
- Final Chromium/WebKit desktop/mobile pricing suite: **32/32 passed**. Includes
  the two new keyboard journeys per project, existing price/availability/error
  paths, automated axe checks for WCAG 2.2 AA tags and 320px reflow checks.
- Added eight Windows light/dark visual baselines after inspecting the rendered
  desktop/mobile review layouts. Existing macOS baselines are preserved. A
  separate run with snapshot updates disabled passed **4/4 visual tests**.
- Manual in-app-browser observations: the skip link reaches the main content,
  Tab reaches the service control, Continue moves focus to the pizza heading,
  and the next Tab displays a visible, unobscured size-control focus outline.
  This is a focused spot check, not complete manual WCAG acceptance.
- Production-mode disposable fixture at `http://127.0.0.1:3004/order`:
  Lighthouse **Performance 100, Accessibility 100, Best Practices 100, SEO 100**.
  The audit uses default mobile simulated throttling and an isolated in-memory
  database. See [Windows audit summary](be-01-lighthouse-win32.json).
  Unused CSS, cache and render-path advisories remain visible in that summary.

### Failed attempts and remaining gates

- The initial full unit run lacked `openssl` on PATH and had a notification
  runtime startup timeout under concurrent load. The subsequent serial run with
  OpenSSL passed all 232 tests; no unrelated authentication changes were made.
- Sandboxed browser runs hung during process teardown. The final successful
  browser and visual-comparison runs used approved execution outside the sandbox.
- Firefox `157.0`, Playwright build `1555`, starts a headless process but never
  establishes the automation connection. Both the suite outside the sandbox and
  isolated 15-second launch probes failed before page navigation. An explicit
  fresh workspace profile also timed out. Root cause is unconfirmed. This is an
  environment limitation, **not a Firefox functional or visual pass**.
- Representative screen-reader review has not been completed, as confirmed by
  the requesting reviewer. Manual browser zoom and full manual contrast/focus
  acceptance also remain open. Automated axe/reflow and Lighthouse results do not
  replace these checks or establish WCAG conformance.
- Keep BE-01 incomplete until these gates pass or the human explicitly revises
  the acceptance requirements. The current approval authorizes the fix and checks;
  it does not waive the outstanding gates.

### Reproduction

```powershell
$env:PATH = 'C:\Program Files\Git\usr\bin;' + $env:PATH
node --test --test-concurrency=1 tests/unit/*.test.js
node node_modules/@playwright/test/cli.js test -c playwright.pricing.config.js --project=chromium-desktop --project=chromium-mobile --project=webkit-desktop --project=webkit-mobile
node node_modules/@playwright/test/cli.js test -c playwright.pricing.config.js --project=chromium-desktop --project=chromium-mobile --project=webkit-desktop --project=webkit-mobile --grep visual
```

For the audit, start `$env:NODE_ENV='production'; node
tests/fixtures/pricing-server.js` in a separate terminal, then run `node
tests/audit-pricing.js`. Stop the fixture before Playwright, which starts its own
server. Generated logs and reports are local ignored verification artifacts.

## Original implementation verification — 2026-10-21

Implementation is ready for team review; the card remains incomplete pending the
mandatory Firefox UI and manual accessibility acceptance checks.

## Verified

- Node 24.14.1, macOS 27.0.1 arm64; existing pinned project dependencies.
- `npm run test:unit`: 165/165 unit/integration tests passed. After the final
  naming-only cleanup, the eight catalog/pricing tests also passed.
- Pricing Playwright suite: 24/24 tests passed across Chromium and WebKit,
  desktop and mobile. Covers authoritative prices, tax/tips, explicit review
  after menu changes, unavailable ingredients, recoverable network/payment
  failures, forged prices, quantity limits and retained selections.
- Eight new light/dark screenshot baselines were inspected before creation.
  A separate comparison run without baseline updates passed all four visual
  cases. Automated axe checks and 320px reflow checks passed in those cases.
- Lighthouse 13.5.0, default mobile simulated throttling, production-mode
  isolated database fixture, `/order`: Performance 100, Accessibility 100,
  Best Practices 100, SEO 100. Configuration and advisories are retained in
  [the sanitized report](be-01-lighthouse.json). This navigation audit does not
  establish every dynamic state or WCAG conformance.
- Actual application runtime using the existing demo database on loopback port
  3005: `/order` and `/api/pricing/catalog` returned 200; `/auth/session` returned
  404, confirming public database mode does not enable staff authentication.
- Focused source/diff review; no new dependencies or schema changes.

Reproduce browser coverage with `npx playwright test -c playwright.pricing.config.js`.
Run `NODE_ENV=production node tests/fixtures/pricing-server.js` and then
`node tests/audit-pricing.js` for the isolated Lighthouse audit. Stop the fixture
before running Playwright, which starts its own isolated server.

## Failed or pending

- Firefox UI launch failed before page navigation with `Could not find profile
  folder`, matching the previously recorded local environment limitation.
  Firefox request-only tests passed but do not verify Firefox UI behavior.
- Representative screen-reader, manual keyboard/zoom/contrast review and final
  three-engine acceptance remain pending. Automated checks are not substitutes.
- BE-02 order persistence/capacity reservations and BE-03 payment confirmation
  remain separate work. This endpoint previews prices only: it creates no order,
  reservation, persisted quote or payment. The current payment handoff reports a
  recoverable unavailable state and preserves the cart.

See [pricing design and file guide](../pricing-design.md) for integration boundaries,
approved demonstration tax assumptions and API contracts.
