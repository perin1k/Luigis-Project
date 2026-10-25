# BE-06 dashboard verification — October 22, 2026

## BE-06 focused implementation checkpoint — October 23, 2026

Baseline `42d6a87d9b994581d1183275116e8ec6fd9b5a3c`. Preserves the team's
existing analytics ledger, dashboard and Owner-only role integration. Reviewed
DECISION-04 and found missing required date/day-of-week pickup trends: the service
previously returned only hourly buckets. New failing tests reproduced absent
`arrDates`/`arrWeekdays` before implementation; both now pass.

### Changes and integration

- `src/staff/analytics-service.js` adds `objPickup.arrDates` and
  `objPickup.arrWeekdays` alongside existing hourly results. A shared counter
  preserves total/cancelled/Not collected semantics. Dates use America/Chicago;
  weekdays derive from that local calendar date and use ISO Monday=1/Sunday=7.
  Buckets sort chronologically/Monday–Sunday and empty ranges return empty arrays.
  Existing sales/refund/quantity/AOV/timing outputs and Owner-only guard remain.
- `tests/unit/analytics-service.test.js` adds UTC-midnight/weekday cancellation
  and Sunday-after-DST-fallback cases; existing no-show and empty-period cases now
  check the new buckets. All data uses genuine service-created synthetic orders.
- `tests/fixtures/staff-orders-data.js` accepts an optional service date to seed
  the DST case. Its previous fixed default is preserved for existing fixtures;
  no production input or schema changes.
- `tests/unit/staff-orders-http.test.js` adds explicit valid MFA Admin denial
  for both analytics HTML and JSON. A positive order-queue request proves the
  session is valid; denial returns no-store 403 without financial/customer data.
  Existing Owner success and Employee denial remain intact.
- [Analytics metric/file guide](../sales-analytics-design.md) documents the additive
  fields. FE-06 owns rendering the required date/weekday tables and quick/custom
  filters; this backend increment does not claim those new controls already exist.

No new dependency, migration, account or external service was introduced. No
purchased data, timestamps, payment/refund policy or permission was rewritten.

### Focused verification

Windows x64 / Node 24.22.1 / Playwright 1.64.1; locked Chromium 156.0.8078.4 and
Firefox 157.0 desktop. After the service change, analytics and HTTPS checks passed
for payment/refund-date accounting, cohort averages/empty periods, tax/tip/cost
separation, purchased recipe/beverage quantities, Central dates/hours/weekdays,
no-show/timing coverage, invalid ranges and Owner/Admin/Employee access/privacy.
Selected browser checks passed again for actual Owner navigation, keyboard date
submission, invalid-filter input preservation/no stale report, and unauthorized/
expired-session denial. Reruns were limited to behavior affected by the new service
fields. Syntax, local links and diff checks passed.

```sh
node --test tests/unit/analytics-service.test.js tests/unit/staff-orders-http.test.js
node node_modules/@playwright/test/cli.js test -c playwright.staff-orders.config.js analytics.spec.js --project=chromium-desktop --project=firefox-desktop --grep 'owner navigation|employees and expired sessions'
```

BE-06 is **Ready for Testing, not Done**. [TEST-03](https://trello.com/c/WOZ38Ufw)
retains integrated reporting/refund/fulfillment acceptance, native browser/mobile
visual/axe coverage, grouped manual keyboard/zoom/contrast/screen-reader review
and applicable audits. FE-06 presentation must consume the added buckets before
that connected acceptance. Earlier visual/audit records remain historical, not
fresh results for the new metrics. Preserve the private-dashboard noindex SEO
exception and all other final QA/INT/OPS gates. Older local Firefox startup notes
below do not contradict this focused Windows pass or certify unrun environments.

## Original dashboard evidence

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
