# BE-07 owner/staff menu-management verification

October 22, 2026. Story: https://trello.com/c/bpjfXwga.
Implemented behavior and file guide: [menu management](../menu-management-design.md).

## Verified passes

- Complete server/unit suite: **249 passed**, zero failures/skips. New service
  tests cover permission denial, versioned price publication, unchanged purchased
  snapshots, new-catalog fingerprint checks, stale revisions, ingredient blocking,
  review records, Central special-hours/DST arithmetic and atomic audit rollback.
- New real HTTPS test: employee/admin permissions, pinned host, CSRF/origin,
  malformed/oversized/compressed JSON, persistence, stale writes and private headers.
- Final focused browser run: **8 passed** across Chromium and WebKit, desktop and
  mobile. Admin flow publishes/reloads a price, flags existing orders for ingredient
  and hours changes and sees corresponding queue warnings. Employee flow persists
  availability, receives no price/hour controls and handles expired sessions.
- Owner keyboard submission, light/dark axe-tag scans and 320px reflow pass.
  Eight new OS/browser/viewport-specific owner-page visual references were
  generated. Representative desktop light and mobile dark references were
  inspected; the initial overly tall desktop layout was replaced with responsive
  ingredient/price grids and correctly sized checkbox controls before final run.
- Lighthouse: **Performance 100, Accessibility 100, Best Practices 100, SEO 60**.
  The private page intentionally retains noindex; the SEO result is recorded,
  not relabeled as a passing 100. Full scores/configuration/advisories:
  [report](be-07-menu-lighthouse.json).
- Syntax, naming, fixed-summary auditing, private-data boundaries and diff review
  passed. No applied SQL migration or external dependency was changed.

Integration additions verify unpaid checkout rejection after price, ingredient or
hours changes, with no payment confirmation or saved-quote mutation.

Environment: macOS 27.0.1 arm64, Node 24.14.1, npm 11.11.0, Playwright 1.64.1.
Installed browser manifest: Chromium 156.0.8078.4 revision 1248; WebKit 27.2
revision 2370; Firefox 157.0 revision 1555. Browser engines are not OS coverage.
The Lighthouse version is 13.5.0; default simulated mobile profile, production
NODE_ENV and an isolated HTTPS fixture were used.

## Failures and outstanding gates

The initial all-engine run attempted all 12 cases. Firefox desktop/mobile failed
before navigation with the existing “Could not find profile folder” launch issue;
none of those four application scenarios executed. Chromium/WebKit owner tests
initially sampled theme colors mid-animation. Waiting for actual animation
completion, consistent with existing tests, resolved that harness timing issue;
no contrast threshold or axe rule was disabled. Final passes above use that fix.

Manual representative screen-reader, zoom/contrast and full keyboard acceptance
remain open. Windows/Linux environment checks are not available in this checkout.
The [acceptance handoff](be-07-handoff.md) records the subsequent concurrent-tab
checks and macOS navigation-reference reconciliation; other platforms' snapshots
remain preserved and require their own verification.
No private-page SEO score was manufactured by allowing indexing. Keep BE-07 open
until mandatory gates pass or receive an explicit applicable acceptance revision.
No hosting, live payment, outbound notification or security certification claim.

## Reproduction

`npm run test:unit`

`npx playwright test --config=playwright.staff-orders.config.js --grep 'menu owner|menu employee'`

Initial new references were generated for Chromium/WebKit projects only after
layout review, with `--update-snapshots`; normal verification must compare existing
references without that option. For Lighthouse, start the disposable
`node tests/fixtures/staff-orders-server.js`, then run `node tests/audit-menu.js`.
The test fixture uses only invented identities/orders and an isolated in-memory
SQLite database. Test controls are not mounted by the production server.
