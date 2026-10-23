# TEST-02 scheduling, ordering and demonstration checkout

Status: in progress; no feature acceptance claimed until the pending results below are recorded.

## Scope and reusable files

[TEST-02](https://trello.com/c/DlgHEJjl) verifies BE-02, BE-03 and FE-03 plus the scheduling/checkout portion of BE-10/FE-10. The latter retain scheduled inventory/refund integration acceptance on [TEST-03](https://trello.com/c/WOZ38Ufw).

- `playwright.test02-scheduling.config.js` reuses the Central-time, required-time, contention, expiry, recovery, component status, keyboard, axe and light/dark visual cases on port 3007.
- `playwright.test02-payments.config.js` reuses genuine SQLite-backed confirmation, private tracking, cutoff, decline, interrupted-response replay, throttling, receipt/recovery visuals and axe cases on port 3008.
- `playwright.test02-pricing.config.js` selects edited contact/items/authoritative recap, stale-total withdrawal and light/dark recap/review visuals on port 3004. Existing pricing implementation and teammate evidence remain attributed to their contributors.
- `.github/workflows/test02-verification.yml` uses the same bounded platform matrix for reviewed-reference comparisons and the teammate keyboard regression. The original collection phase additionally ran all scheduling/payment cases, selected pricing cases, existing order-submission journeys and focused service/security cases; those passing results remain valid on identical application/fixture source and are reused instead of rerunning them. Windows Server 2022 uses Chromium/Firefox; macOS 15 and Ubuntu 24.04 use Chromium/Firefox/WebKit, all desktop (1440×1000) and mobile (390×844), with selected 320px reflow checks. Locked Node 24.14.1, npm lockfile and Playwright 1.64.1 are used: Chromium 156.0.8078.4 (revision 1248), Firefox 157.0 (1555), WebKit 27.2 (2370). Browser-engine coverage does not certify native Safari or Windows WebKit.
- `test02-ci/` references are native-runner-specific, separate from existing contributors' local references. Synthetic-only collection is temporary; review precedes committed references and strict no-update comparison.

No migration, dependency, payment-provider configuration or application behavior change is introduced by the checkpoint configuration. The scheduling status gallery is component coverage, not proof of persisted refund integration.

## Reproduction and change impact

The committed workflow is the strict comparison phase, not a claim to rerun every service/journey. Full connected verification is reproducible with the existing suites (use the approved platform's project selection):

```sh
node --test tests/unit/order-submission.test.js tests/unit/demo-payment.test.js tests/unit/demo-payment-http.test.js tests/unit/demo-payment-concurrency.test.js tests/unit/payment-config.test.js tests/unit/payment-retry.test.js tests/unit/scheduling-service.test.js tests/unit/scheduling-concurrency.test.js
npx playwright test -c playwright.test02-scheduling.config.js --update-snapshots=none
npx playwright test -c playwright.test02-payments.config.js --update-snapshots=none
npx playwright test -c playwright.test02-pricing.config.js --update-snapshots=none
npx playwright test -c playwright.orders.config.js
```

Windows adds `--project=chromium-desktop --project=chromium-mobile --project=firefox-desktop --project=firefox-mobile` to browser commands. Apply the cross-platform guide for prerequisites and OpenSSL. The actual comparison-only commands are in the workflow. Later application/fixture changes require impact review and rerunning invalidated connected/service checks; the workflow's static link to this checkpoint is not fresh evidence for altered behavior. Reference updates still require review. Do not recreate candidates as part of ordinary verification.

## Source and evidence reuse

Initial reviewed source was `a107275`; application/test bytes were unchanged since `78f81cf`. Concurrent teammate commits through `9d8a7fe` were preserved: pricing keyboard focus restoration (`f3caecd`) and employee final-order filters (`9d8a7fe`). New checkpoint verification includes that combined source. Unrelated employee-queue acceptance remains the teammate's scope.

Focused submission, payment/encryption/configuration, cutoff/concurrency/retry and contact/recap checks are recorded in [BE-02](be-02-persistence.md), [BE-03](be-03-payments.md), [FE-03](customer-checkout-checkpoint.md) and [BE-10/FE-10](be-10-fe-10-increment.md). TEST-01 menu/availability/error coverage is retained via [its accepted record](test-01-menu-acceptance.md); it is not rerun or claimed anew here. A changed checkout focus path is covered by the current checkpoint and teammate keyboard cases, rather than treating all earlier interactive results as automatically current.

## Native collection and strict comparison

Collection source: `084bcca92cf93bf13821b455b0c4312f50061622`.
[Collection run](https://github.com/perin1k/Luigis-Project/actions/runs/39966524807).
Collection generates candidate references; it does not establish visual acceptance.

All three native collection jobs passed focused services/security, connected journeys, axe scans and candidate image generation. All 192 synthetic native references were reviewed internally in complete contact sheets, supplemented by full-size Windows mobile receipt, Linux WebKit mobile payment recap and macOS Firefox desktop recovery receipt. No unexpected clipping, overlap or layout inconsistency was found. Only reviewed new test02-ci references are committed; existing contributor references and comparison tolerances were not changed. Collection logs confirm 25 focused service/integration cases per OS and 88 Windows / 132 macOS / 132 Linux browser cases passed, with no reported failed, flaky or skipped cases. POSIX private-permission and symlink rejection branches execute only on macOS/Linux; Windows ACL custody is not established by the Windows pass. Strict run [39969105807](https://github.com/perin1k/Luigis-Project/actions/runs/39969105807) at `49edaea1516aafb25d39ccec1faed41c9c17596e` passed Windows/Linux and all macOS visual/axe comparisons. Four new macOS WebKit keyboard journeys failed (both service types, desktop/mobile): plain Tab did not reach native buttons/radios, including before any pricing action. No snapshot mismatch occurred. Acceptance remains pending focused keyboard diagnosis/reverification.

### macOS keyboard prerequisite follow-up

[Apple documents](https://support.apple.com/en-lamr/guide/safari/cpsh003/mac) that Tab reaches buttons/controls when macOS Keyboard Navigation is enabled. The matching [Playwright issue](https://github.com/microsoft/playwright/issues/41808) records the app-scoped `defaults write org.webkit.Playwright AppleKeyboardUIMode -int 2` prerequisite. The checkpoint now enables and reads back that preference only for the disposable macOS WebKit app, before launch. No website tabindex, browser security setting, test assertion or baseline is altered. `.github/workflows/test02-macos-keyboard.yml` reruns only the four failed cases; the full strict workflow retains the prerequisite for future manual dispatch. Its automatic push trigger is removed after this bounded checkpoint to avoid repeating already valid native comparisons when only evidence changes. The focused workflow is not a replacement for the broader retained results.

## Human accessibility review

On October 23, 2026, after confirming the latest teammate changes were incorporated, the reviewer explicitly answered **All passed** for the grouped Chrome/Windows Narrator review on the disposable HTTP loopback fixture: keyboard access, labels/announcements, visible focus, carry-out and dine-in contact/ready-time recap, item editing, no-charge disclosure/no card fields, decline with preserved selections, committed receipt/private tracking, and light/dark review/payment/receipt at 200%/400% zoom. Exact browser/Narrator versions were not supplied. Automated axe and these human observations are scoped evidence, not a blanket WCAG certificate.

Manual source/visual review also checked the semantic theme mappings and sampled WCAG relative-luminance contrast for ink/muted/accent text against paper/surface/panel/selected backgrounds, error text/background, primary/hover button text, and focus/control borders against adjacent surfaces. Minimum sampled text ratios were 4.82:1 light and 5.97:1 dark; required non-text control/focus samples were 3.26:1 and 3.78:1. Native images and the human review support readable spacing, visible labels and non-color status descriptions. These samples complement axe; they do not claim every rendered pixel or WCAG criterion was machine-proven. The checkpoint introduces no audiovisual media, dragging, CAPTCHA or customer authentication; those criteria are not activated by this change. Staff authentication remains under its accepted checkpoint and final integrated QA.

## Lighthouse and final release boundary

Reuse the accepted TEST-01 production-mode public `/order` audit: Lighthouse 13.5.0, Windows x64/Node 24.19.0, default mobile simulated throttling, 100 in Performance, Accessibility, Best Practices and SEO. The current checkpoint adds configurations only; the teammate change restores focus after an existing asynchronous price check and does not change initial navigation markup/assets or loading architecture. The concurrently pulled teammate record [BE-01 pricing verification](be-01-pricing.md) and [Windows audit metadata](be-01-lighthouse-win32.json) additionally record a fresh production-fixture all-four-100 audit after reconciliation of the pricing focus and FE-03 changes. This is explicitly reused teammate evidence, not an audit performed in this checkpoint. Dynamic states are covered separately by browser/axe/manual checks. The scheduling-enabled audit retained in [BE-10](be-10-keyboard-lighthouse.json) also records all four 100s on its documented macOS profile; it is reused historical evidence, not a new Windows measurement.

The additional self-signed HTTPS fixture's Performance 99 remains documented in TEST-01. The human explicitly accepted feature checkpoint verification while reserving the required real hosted HTTPS Performance 100 for QA-01. Intentional private tracking noindex remains under its existing exception. No audit category is rounded up or silently waived. Hosted HTTPS, operator key custody, integrated payment/privacy/retention, and concurrency/recovery acceptance remain QA-01/02/03 and OPS; no Stripe, native Wallet, external notification delivery, durable business recovery or public release is certified.

## Outcome

Pending. Source cards remain open until their applicable checkpoint criteria pass. BE-10/FE-10 must remain open for TEST-03 cross-feature inventory/refund criteria even if this checkpoint passes.
