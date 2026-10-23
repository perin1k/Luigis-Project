# FE-06 focused implementation checkpoint — October 23, 2026

Story: https://trello.com/c/QcHjLVWq. Baseline
`0b1fa51d2c79360166391272272a1e7f7a14c974`. Preserves the team's existing
Owner dashboard and the BE-06 accounting/trend foundation.

## Changes and file guide

- `src/staff/analytics-service.js` adds authorized date shortcuts using the session
  clock and inclusive America/Chicago calendar dates. Completed paid collections
  are counted separately by promised pickup date. Existing financial authority,
  MFA permissions, accounting and missing-observation semantics remain intact.
- `src/staff/orders-router.js` supplies authorized ranges to successful and invalid
  custom-filter pages; unauthorized users receive no report or range data.
- `src/views/pages/staff-analytics.ejs` renders native quick links, the existing
  custom form, completed collections, observed-only on-time percentage and three
  captioned date/weekday/hour tables. Empty/error states preserve honest coverage.
- `src/public/css/staff.css` adds scoped wrapping shortcut links and pickup column
  widths using existing theme styles. No new browser JavaScript is introduced;
  the dashboard works with JavaScript disabled after normal sign-in.
- Unit and browser analytics tests cover the new contract and presentation.
  [The metric guide](../sales-analytics-design.md) explains their integration.

No dependency, migration, external service or permission change. New service tests
first reproduced absent shortcuts/completed counts, then passed after implementation.

## Focused verification

Windows x64, Node 24.22.1, Playwright 1.64.1, locked Chromium 156.0.8078.4 and
Firefox 157.0 desktop. These commands passed with the final behavior changes:

```sh
node --test tests/unit/analytics-service.test.js tests/unit/staff-orders-http.test.js
node node_modules/@playwright/test/cli.js test -c playwright.staff-orders.config.js analytics.spec.js --project=chromium-desktop --project=firefox-desktop --grep 'owner navigation|employees and expired sessions|FE-06 reporting'
```

Service/HTTP coverage includes inclusive shortcuts across DST fallback, completed
versus active orders, accounting and empty periods, Owner success, valid MFA Admin
and Employee denial, private-response protection and invalid ranges. Browser checks
exercise native links with dashboard JavaScript disabled, a non-Central browser
timezone, keyboard activation, custom-error recovery and real order progression to
Completed. Both themes at 320px pass focused axe A/AA and horizontal reflow checks;
observed on-time coverage and missing ready timestamps remain explicit. Syntax and
diff review pass. BE-06's record retains detailed underlying accounting evidence.

## Remaining acceptance

FE-06 is Ready for Testing, not Done. [TEST-03](https://trello.com/c/WOZ38Ufw)
retains integrated fulfillment/refund/reporting verification, native desktop/mobile
browser and visual coverage, grouped manual keyboard/zoom/contrast/screen-reader
review and applicable audits. Existing analytics references predate this layout;
review updated native references at that checkpoint rather than treating old images
as current acceptance. No snapshots were regenerated or visual gates waived here.
No fresh macOS/Linux, WebKit, manual or Lighthouse acceptance is claimed. Preserve
the private-page noindex exception and final hosted HTTPS/QA/INT/OPS gates.
