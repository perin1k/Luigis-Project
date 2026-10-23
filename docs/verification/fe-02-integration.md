# FE-02 persisted availability checkpoint

## Accepted checkpoint — October 23, 2026

FE-02 completed feature acceptance through
[TEST-01](test-01-menu-acceptance.md): shared staff/customer state, strict native
browser/visual/accessibility checks and the scoped human review. Earlier
implementation-ready/open-card notes below are historical. Final hosted QA,
including the explicitly retained deployed HTTPS performance gate, remains.

## Current focused verification — October 23, 2026

Reviewed existing contributor implementation at `e4d7907` on native Windows with
Node 24.19.0 and the locked Playwright browsers. No application, dependency,
schema, test or visual-reference change was needed. The following checks passed:

```sh
node --test tests/unit/pricing-http.test.js tests/unit/catalog-pricing.test.js tests/unit/order-pricing.test.js
node --test tests/unit/http-hosting.test.js
node node_modules/@playwright/test/cli.js test --config=playwright.pricing.config.js --project=chromium-desktop --project=firefox-desktop --grep 'unavailable selected topping|changed database prices|network failures retain|withdraws stale prices'
```

The service/HTTP checks cover persisted ingredient changes, stale fingerprints,
blocked recipes, unaffected choices, restored availability and safe branded
404/500 responses with no-store/noindex. The browser checks verify unavailable
selection recovery, preserved remaining choices, stale-price withdrawal and
network retry against actual isolated SQLite data. Local server checks required
authorized loopback access; application protections were unchanged.

FE-02 is implementation-ready under the [staged policy](../../AGENTS.md#staged-verification-cadence),
not fully accepted. [TEST-01](https://trello.com/c/5lLwJGB8) retains the connected
staff-edit-to-customer journey with BE-07/FE-07, affected platform/mobile/browser
and native visual review, manual keyboard/zoom/contrast/screen-reader checks and
applicable Lighthouse acceptance. No new visual, axe, manual, WebKit, mobile or
Lighthouse result is claimed by this focused run. Existing final QA remains
required. Preserve the historical evidence below without treating its environment
limitations as current Windows failures or its passes as new runs.

## Original persisted-availability checkpoint

October 22, 2026. Card: https://trello.com/c/5gk80esm. Existing presentation and
catalog integration are contributor work already present in dev. This increment
adds a regression test, not a replacement availability source or UI feature.

`tests/unit/pricing-http.test.js` now exercises the mounted application with a
real isolated SQLite catalog. After an ingredient change it verifies:

- `/order` renders the current unavailable-topping contract with no-store.
- A previously read fingerprint receives 409 and the updated catalog.
- Reviewing that catalog does not authorize the now-unavailable recipe (422).
- An unaffected onion recipe remains purchasable through authoritative pricing.
- A missing required cheese ingredient reaches the rendered base warning and
  blocks pricing; restoring ingredients permits the original recipe again.

Reproduce:

```sh
node --test tests/unit/pricing-http.test.js tests/unit/catalog-pricing.test.js
```

Result: **11 passed**, zero failures/skips, macOS arm64, Node 24.14.1/npm 11.11.0.
The initial restricted run passed eight catalog tests but could not bind loopback
for three HTTP tests (`EPERM`). Rerunning with loopback permission passed all 11;
no application or security control was weakened. Fixtures use in-memory synthetic
data and an ephemeral local port, not the working application database.

This covers server-rendered integration and authoritative revalidation. It does
not prove browser draft/focus behavior, live updates on an already-open page or
manual screen-reader acceptance. Existing visual/browser coverage is separate;
Firefox, Windows/Linux and retained manual quality gates remain unverified here.
FE-02 stays open for those acceptance checks. No new UI or runtime behavior changed,
so this test-only checkpoint does not claim a fresh Lighthouse audit.

## Browser integration follow-up

At commit `d8611eb`, the existing database-backed pricing fixture was exercised
without changing tests, runtime or visual baselines:

```sh
npx playwright test --config=playwright.pricing.config.js --project=chromium-desktop --project=chromium-mobile --project=webkit-desktop --project=webkit-mobile --grep 'unavailable selected topping|changed database prices|network failures retain|withdraws stale prices'
```

**16 passed (34.7 seconds)**, zero failures. These four scenarios ran in desktop
and mobile Chromium/WebKit on macOS: stale payment totals are withdrawn after
failed/changed checks; unavailable recipes cannot proceed; network failure retains
the basket and retry recovers; removing an unavailable selected topping preserves
the remaining pizza/drink choices and produces the authoritative total.
The fixture changes actual isolated SQLite ingredient rows, not a presentation-only
availability stub. No working dataset or authentication rollout was touched.

This is functional integration evidence, not new visual, axe, manual accessibility,
Firefox or Windows/Linux evidence. The known Firefox launch blocker was not
repeated. FE-02 remains open for retained acceptance checks; no new acceptance
scope or indexing exception is inferred from these passes.
