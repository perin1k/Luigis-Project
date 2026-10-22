# BE-04 verification — October 22, 2026

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
