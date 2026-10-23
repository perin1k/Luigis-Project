# BE-03 generated-identity payment increment — 2026-10-21

## TEST-02 feature acceptance — October 23, 2026

The applicable feature checkpoint passed. See [TEST-02 acceptance](test-02-checkout-acceptance.md) for exact source/run links, native platform/browser visuals, connected journeys, human keyboard/Narrator/zoom review, contrast sampling and reused audit evidence. The initial macOS WebKit keyboard failure was resolved by enabling the documented native runner preference; assertions and application code were unchanged. BE-02/BE-03/FE-03 are accepted for their demonstration application scope. Existing final hosted, integrated privacy/security and operator gates remain separate. Historical pending notes below retain their original increment context and are superseded only by the explicit current evidence.

## Focused reconciliation — October 23, 2026

Reviewed existing contributor implementation at `b6ce91b` on native Windows,
Node 24.19.0 and locked Playwright browsers. No application or test change was
necessary. The approved input safeguard remains server-generated synthetic
identifiers; no customer card number, expiry, CVV or claimed outcome is accepted.

These focused checks passed:

```sh
node --test tests/unit/payment-config.test.js tests/unit/demo-payment.test.js tests/unit/demo-payment-http.test.js tests/unit/demo-payment-concurrency.test.js tests/unit/payment-retry.test.js
node node_modules/@playwright/test/cli.js test -c playwright.payments.config.js --project=chromium-desktop --project=firefox-desktop --grep 'both methods show committed|throttled recovery'
```

The service/HTTP checks cover authenticated encryption, integrity/identity binding,
fresh nonces, versioned-key readability, explicit configuration/no-key failure,
masked output, rejection of supplied numbers/outcomes, bounded same-site JSON,
atomic payment/order association, rollback, exact totals, normal/special cutoffs,
idempotency/competing connections and expired-ciphertext removal while preserving
masked history. POSIX permission/symlink cases are conditional and did not run on
Windows; this is not Windows ACL or hosted key-custody acceptance.

Chromium/Firefox desktop cases verify both service types and demonstration method
presentations, server-committed confirmation/private tracking, no browser card
fields, and rate-limited recovery using the original payment identity without a
duplicate. Existing axe checks in the selected cases passed. These are functional
demo presentations, not live processing or native Wallet verification.

BE-03 is implementation-ready, not Done. [TEST-02](https://trello.com/c/DlgHEJjl)
retains broader connected/browser/mobile/native visual/manual accessibility/audit
acceptance. [QA-02](https://trello.com/c/51DKth51) retains consolidated payment and
privacy verification, with actual hosted secrets/TLS on the existing OPS work.
No new broad visual, manual, hosted or Lighthouse pass is claimed. Earlier
missing-service notes below describe the original increment, not current absence
of tracking, refunds, preview notifications or scheduled retention cleanup.

## Original generated-identity increment

Historical increment. See the [current customer integration checkpoint](customer-checkout-checkpoint.md)
for subsequently implemented lifecycle services and refreshed receipt evidence.

Implemented: encrypted server-generated test identities, persisted local demo
outcomes, atomic payment/hold/order confirmation, safe browser recovery and a
receipt from committed snapshots. This is not a live payment integration or final
card acceptance; remaining gates/integrations below are not waived.

## Verified passes

- Full `npm run test:unit`: 187/187 tests after updating the existing migration
  count expectations from ten to eleven. No applied migration was modified.
- New tests cover authenticated encryption/decryption, tampering and identity
  binding, versioned keys, fresh nonces, private key-file permissions/symlinks,
  exact totals, declines, expiry, changed prices/inventory, immutable history,
  seven-day ciphertext deletion, rollback on encryption/event failures, malformed
  and oversized/cross-site requests, rejected number/outcome/total fields and
  no-key failure. Fourteen focused payment/scheduling cases passed after the
  final receipt-description changes.
- Real file-database competing worker connections both receive the original
  success while only one payment, encrypted identity and order event persist.
  Reopening/migration checks and foreign-key integrity pass.
- Chromium/WebKit desktop/mobile: 16/16 browser cases passed. They cover card and
  demonstration Apple Pay for carry-out/dine-in, committed receipts, safe retry
  after an actual server commit followed by lost response, no repricing on that
  retry, decline recovery and expired checkout. No browser card/CVV fields exist.
  Confirmation receives focus; page-error checks pass on successful journeys.
- Eight light/dark actual receipt captures were inspected before creating new
  baselines. Four baseline-generation cases passed; a separate no-update run
  passed all four comparisons. Only variable order references and masked last
  four digits are masked. These tests also check 320px horizontal reflow.
- Automated axe checks passed on successful receipt states for both methods.
  A focused four-profile run additionally checks both payment-choice states and
  receipts: all four focused cases passed.
- Lighthouse 13.5.0, default mobile simulated throttling, production-mode isolated
  database `/order`: Performance 100, Accessibility 100, Best Practices 100,
  SEO 100. [Configuration/advisories](be-03-lighthouse.json). This navigation
  audit covers initial `/order`; dynamic states use separate browser/axe tests.
- Actual configured loopback application and existing demo database: a clearly
  synthetic runtime-check order returned 201; demo payment returned succeeded,
  confirmed hold and 201; identical retry returned 200 and the same reference.
  One synthetic Received order was intentionally retained in disposable demo data.
  The reviewed additive migration and a dedicated private external local-demo key
  were used. No key data or full number was printed, posted or committed.
- Syntax/diff review; no new dependency. Node 24.14.1, macOS 27.0.1 arm64.
  Existing team commits for password bytes and FE-10 recovery/status work retained.

## Failures resolved and checks pending

- First browser visual-capture cases used a button locator for appearance radio
  labels and timed out. The test locator was corrected to the existing labelled
  Appearance group; all local cases/captures/comparisons then passed.
- Eight Firefox cases failed before navigation with the existing local profile
  folder launch error. Firefox UI behavior remains unverified on this machine.
- Representative screen-reader review, full manual keyboard/zoom/contrast and
  remaining three-engine release acceptance are pending. Axe/Lighthouse alone
  do not establish WCAG conformance.
- Hosted key custody/HTTPS, scheduled retention work, staff refund/accounting
  integrations, protected tracking and notification previews remain separate.
  Stripe/native Apple Wallet activation is future PAY-01, not claimed here.
- Generated-number ciphertext expires after seven days and is purged by successful
  payment work or the internal cleanup method; no scheduled retention worker is
  installed. Local preview key custody is temporary and outside Git/database;
  losing that key prevents decryption, while masked financial history remains.

Reproduce: `npx playwright test -c playwright.payments.config.js`.
For Lighthouse, start `NODE_ENV=production node tests/fixtures/payments-server.js`
then `node tests/audit-payments.js`; stop it before Playwright starts its fixture.
[Design/API/file/key/recovery guide](../demo-payment-design.md).
