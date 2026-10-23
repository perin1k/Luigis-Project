# BE-04 verification — October 22, 2026

## Focused implementation reconciliation — October 23, 2026

Reviewed the existing teammate implementation at `c64e6acbfc2ffcb4d79d3fac8c26dd89e13f6403`
on Windows x64, Node 24.22.1, Playwright 1.64.1 and locked browser revisions.
Preserved Perin's original `b656003` implementation and the current FE-04 final-status
filters/review notices. No application, fixture, test, dependency or migration
change was needed; this is a documentation-only handoff after focused execution.

Passed existing focused service/HTTPS checks for paid-order inclusion, active/final
status and service-date filters, pagination, minimal contact and no employee
financial fields, unknown/revoked/disabled/expired sessions, admin MFA, contact
redaction, safe output, cookie/origin/host enforcement and rejection of plaintext
or forwarded-protocol claims. Passed existing Chromium/Firefox desktop journeys
for authenticated queue/detail/filter/refresh, expired-session private-data
clearing, and recoverable network failure with explicitly stale prior results.
These are fresh focused results, not new broad visual, axe, manual or audit runs.

Reproduction (use the cross-platform guide for OpenSSL/runtime prerequisites):

```sh
node --test tests/unit/staff-orders.test.js tests/unit/staff-orders-http.test.js
node node_modules/@playwright/test/cli.js test -c playwright.staff-orders.config.js orders.spec.js --project=chromium-desktop --project=firefox-desktop --grep 'authorized queue/detail|unauthenticated and expired|network recovery retains'
```

Integration/file responsibilities remain as described in
[the staff-order guide](../staff-orders-design.md):
`src/staff/orders-service.js` authorizes and reads persisted operational data;
`src/staff/orders-router.js` enforces private HTTPS transport and serves HTML/JSON;
`src/views/pages/staff-orders.ejs` renders escaped queue/detail content;
`src/public/js/staff-orders.js` adds refresh and session/network recovery.
Server permissions and persisted payment associations remain authoritative.

BE-04 is **Ready for Testing, not Done**. Full native desktop/mobile visual/axe,
keyboard/Narrator/zoom/contrast, applicable queue/detail Lighthouse, and connected
fulfillment/exception acceptance remain grouped under
[TEST-03](https://trello.com/c/WOZ38Ufw). Preserve the existing approved private-page
noindex SEO exception, all other quality gates and final QA/INT/OPS boundaries.
Current FE-04 changes require reviewed native references; old images are not
silently regenerated or treated as current acceptance. Earlier Firefox launch
limitations below are historical; this focused Windows Firefox run passed.

## Original increment evidence

Story: https://trello.com/c/nu8icTT7. Scope: read-only authorized employee queue
and preparation details. Implementation/file guide: `../staff-orders-design.md`.
No deployment, real staff enrollment, status change, dependency or migration.

## Verified

- Server regression: `npm run test:unit` — 193 tests pass. The six new service/HTTP
  tests cover real persisted successful payments, minimal employee output,
  admin/employee authorization, revoked/disabled/expired identities, invalid
  filters, stable pagination, unpaid exclusion, missing/redacted/deleted contact,
  cancellation warnings, escaping, TLS/origin/host enforcement and safe headers.
- Chromium and WebKit, desktop 1440×1000 and mobile 390×844: 20 checks pass using
  `npx playwright test -c playwright.staff-orders.config.js` with the four supported
  local projects selected. Includes queue/detail/filter/refresh, expired-session
  private-data clearing, network retry and native navigation in dark mode.
- Both pages/themes receive axe WCAG 2/2.1/2.2 A/AA-tagged checks and 320px reflow
  checks. All 16 full-page captures were visually reviewed. Browser-specific
  baselines mask only random public references; an explicit service-date filter
  stabilizes the native date field. A separate run compares baselines without
  updating them. Snapshot creation is not itself comparison evidence.
- Lighthouse 13.5.0 default mobile simulated throttling, production NODE_ENV,
  isolated HTTPS fixture: queue and detail each score Performance 100,
  Accessibility 100, Best Practices 100, SEO 60. Sanitized configuration/results
  are in `be-04-lighthouse.json`. SEO fails because both pages intentionally block
  indexing. The user explicitly approved the SEO-only exception for these two
  private pages on October 22; noindex and all other gates remain.
- Initial queue Best Practices 92 identified Bootstrap's inline data-URI select
  arrow blocked by CSP. Scoped native select appearance fixes it without relaxing
  CSP; the subsequent audit scores 100. No browser error is suppressed.
- Final focused diff, syntax and documentation review; `git diff --check` clean.

## Outstanding acceptance gates and limitations

- Firefox could not launch before navigation: “Could not find profile folder.”
  Eight earlier Firefox cases failed at launch, not in application assertions.
  The expanded final five-case suite per Firefox profile remains unverified.
  Run the unchanged Firefox projects in a working environment; no waiver assumed.
- An earlier combined queue-to-detail visual test stalled in WebKit. Independent
  queue/detail visual tests with fresh pages pass; native cross-page navigation
  remains covered separately. The precise harness cause is not established.
- Manual keyboard/focus, zoom/contrast and representative screen-reader acceptance
  review remains pending. Automated axe/Lighthouse and screenshots do not establish
  complete WCAG conformance. Native server-rendered forms/links exist, but a
  dedicated JavaScript-disabled browser journey was not run.
- Real staff access requires existing operator-configured direct HTTPS and
  individual accounts. Disposable test credentials/certificates are fixture-only;
  the public HTTP customer preview does not expose order records.
- Live pagination can shift as orders change. Ready-time warnings do not perform
  automatic cancellation/refunds. Status mutation is BE-05, not this story.

Keep BE-04 open for acceptance; verified implementation is suitable for review,
not a claim that all mandatory gates or the full sprint are complete.
