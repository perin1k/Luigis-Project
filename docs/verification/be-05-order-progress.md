# BE-05 staff progress verification — October 22, 2026

Story: https://trello.com/c/HwkXU6Mn. Approved increment: normal staff status
workflow, not the full guest-tracking/admin-exception card. See
`../order-progress-design.md` for file guide, transaction and request contracts.

## Verified passes

- `npm run test:unit`: 197 tests pass, zero failures/skips. Four new progress tests
  cover the complete sequence/timestamps/events, stale employee/admin requests,
  invalid/skipped/terminal input, unpaid/unknown order exclusion, cancellation and
  operational review holds, ingredient/capacity guards and event-failure rollback.
- Expanded HTTPS tests verify exact Origin, authenticated CSRF issuance, invalid
  CSRF denial, successful write and stale retry conflict. Final scoped parser-error
  handler adjustment rechecked with both HTTP tests passing. TLS/host, escaping,
  private headers and HTTP-isolation regressions remain covered.
- Chromium/WebKit desktop/mobile: 32 tests pass. Run
  `npx playwright test -c playwright.staff-orders.config.js --project=chromium-desktop --project=chromium-mobile --project=webkit-desktop --project=webkit-mobile`.
  Covers the full Received-to-Completed workflow, held controls, stale conflict
  caused by another authorized request, explicit refresh recovery, expired-session
  private-data clearing during writes, plus prior queue/detail/filter/network paths.
- Eight changed light/dark detail captures were reviewed before creating new
  `detail-progress-*` references. Final run compares these and the eight existing
  queue references without updates. Reference masks cover random public order IDs
  only. Original BE-04 detail references remain historical, not current assertions.
  First capture run had four expected missing-reference failures and 24 passes;
  final comparison run has no failures.
- Automated axe checks for WCAG A/AA tags and 320px reflow pass on both pages in
  both themes. No runtime/browser error is suppressed by application code.
- Lighthouse 13.5.0 default mobile simulated throttling; production NODE_ENV;
  isolated HTTPS auth/order fixture: both queue/detail score Performance 100,
  Accessibility 100, Best Practices 100, SEO 60. Sanitized configuration/results:
  `be-05-progress-lighthouse.json`. User-approved SEO-only exception for these two
  private pages applies; noindex is retained. Fixture certificate exceptions never
  apply to production runtime.
- Syntax checks and focused code/documentation review; `git diff --check` clean.
  No new dependency, migration, shared account, real payment or deployment.

## Pending acceptance / broader story work

Firefox remains blocked by the previously reproduced profile-folder launch error
before navigation; these new Firefox paths have not been verified. Manual
keyboard/focus, zoom/contrast and representative screen-reader review is pending.
No full WCAG conformance or all-browser pass is claimed.

Guest private-link grant issuance/read/replacement/expiry, admin cancellation and
recovery exceptions, closing-time Not collected, notification/retention integration
are not delivered by this normal-status increment. Payment/refund states are
unchanged. No ordinary staff endpoint can bypass a hold. Keep BE-05 incomplete.

The existing direct-HTTPS operator configuration and individual accounts are still
required for actual staff access. Public HTTP customer preview never exposes the
queue or writes. Synthetic fixture credentials are not real staff provisioning.
