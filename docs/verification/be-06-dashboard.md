# BE-06 dashboard verification — October 22, 2026

Story: https://trello.com/c/4K7rYt9e. [Metric and file guide](../sales-analytics-design.md).

- Server regression: **226 tests pass**, zero failures/skips. Existing period/
  cohort/authorization tests now verify historical recipe quantities and a
  refund-only negative quantity period. A new beverage case checks beverage/size
  snapshots separately from pizza recipes. No existing migration changes.
- Dashboard browser cases exercise actual admin MFA and queue navigation, native
  keyboard filter submission, invalid-range feedback/preserved dates, absence of
  stale data, employee/unauthenticated denial, expired-session reload, populated/
  empty reports, both themes, axe A/AA tags and 320px reflow. Only the new analytics
  spec is run; unchanged customer flows are not repeatedly tested for this scoped
  increment. No browser script or dependency is added.
- First functional run: 8 functional cases passed; 8 visual/axe cases sampled
  theme colors during the existing transition. Waiting for animations to finish,
  as the existing visual specs do, fixes the test timing; contrast checks remain
  enabled. Review then found cramped mobile table headers/oversized recipe labels.
  Scoped typography and spacing plus shorter headings improve their layout.
  Only the eight newly introduced populated references are regenerated for this
  intentional correction; no tolerance or audit configuration is weakened.
- Sixteen new light/dark screenshot references cover populated/empty reports in
  Chromium and WebKit desktop/mobile. Representative mobile screens and the
  full set were reviewed. Final no-update comparison: **16/16 pass** across
  Chromium/WebKit desktop/mobile after the mobile table correction. No existing
  screenshot reference is changed. Updated focused HTTP checks also pass (2/2),
  covering the page's 200/400/403 status, no-store/noindex and private-data absence.
- Lighthouse **13.5.0**, unchanged default mobile simulated throttling, production
  HTTPS fixture: **100 Performance, Accessibility, Best Practices**; SEO **60**
  under the explicit private-dashboard noindex exception. Configuration and
  sanitized results are retained in `be-06-dashboard-lighthouse.json`. No cookie,
  MFA code, contact or tracking secret is retained in the report.
- Final syntax, content, naming, scoped diff and whitespace review pass. No new
  library, browser script, account or schema is introduced.

The user explicitly approved the new `/staff/analytics` SEO-only exception on
October 22, retaining noindex. No other quality gate is waived. Firefox remains
blocked before navigation by the existing local profile-folder startup failure;
no Firefox assertion passes. Manual keyboard/zoom/contrast and representative
screen-reader acceptance remains outstanding. Automated keyboard/axe checks do
not prove full WCAG conformance. Keep BE-06 open until mandatory gates pass or the
human explicitly revises them.

Reproduce with `npm run test:unit` and the `analytics.spec.js` cases in
`playwright.staff-orders.config.js`, selecting the four Chromium/WebKit projects
without snapshot-update flags. For Lighthouse, run the disposable HTTPS fixture
with `NODE_ENV=production node tests/fixtures/staff-orders-server.js`, then
`node tests/audit-analytics.js`. The audit uses actual synthetic admin MFA, not a
public staff bypass. No real customer data, account setup, financial action,
live-data migration or deployment is involved.
