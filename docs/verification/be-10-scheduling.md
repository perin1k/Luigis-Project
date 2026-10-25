# BE-10 scheduling increment verification — 2026-10-21

Implemented scope: available ready-time selection, Chicago service dates/hours,
rolling capacity and an atomic unpaid-order/quote/30-minute-hold transaction.
BE-10 remains incomplete pending its other lifecycle requirements and quality gates.

## Passed

- `npm run test:unit`: 177/177 tests. Eight focused scheduling/concurrency tests
  cover before opening, exact/after cutoff, both DST changes, closed and special
  days, stale revisions, invalid/early/late selections, off-grid ASAP, rolling
  boundary capacity, confirmed bookings, exact expiry, nonrenewing retries and
  full transaction rollback. After tightening ASAP selection validation, all
  eight focused tests passed again.
- Real competing connections test: two worker threads open separate connections
  to a file database, synchronize their submissions and compete for the same
  six-pizza slot. Exactly one order/hold commits; the other gets pickup_changed.
  Foreign-key checks pass afterward.
- Three-engine browser run: 12 functional cases passed in Chromium/WebKit,
  desktop/mobile. Six Firefox cases failed before navigation at browser launch.
  A subsequent Chromium/WebKit run verified the tightened ASAP/stale-response
  implementation: all 12 passed.
- Browser cases exercise explicit selection, saved hold, same-request retry,
  competing reservation with required reselection, recoverable pickup-network
  failure and expired hold requiring new review. Automated axe checks passed on
  selected-time review states. Representative Chromium mobile and WebKit desktop
  screenshots were inspected for layout and readable selection/hold messaging.
- Lighthouse 13.5.0 default mobile simulated throttling, production-mode isolated
  scheduling fixture `/order`: 100 Performance, 100 Accessibility, 100 Best
  Practices, 100 SEO. [Sanitized configuration/advisories](be-10-lighthouse.json).
  This initial navigation audit does not audit every dynamic state or establish
  WCAG conformance. JavaScript syntax/diff review also performed.
- Actual database-configured preview: scheduling enabled, option GET returned
  200 with America/Chicago times, and quantity seven returned 422.
- Environment: Node 24.14.1, macOS 27.0.1 arm64, existing project dependencies.
  No migrations, dependencies, live customer data or financial actions added.

## Failed / pending

- Firefox launch: local `Could not find profile folder` failure before page
  navigation; Firefox application behavior is unverified, not a pass.
- Deterministic screenshot comparisons, complete manual keyboard/zoom/contrast
  and representative screen-reader acceptance remain pending. Focused screenshots
  and automated axe results do not waive those gates.
- Payment confirmation/failure release, late-success review, paid-booking hours
  changes, pre-preparation inventory checks, refunds/cancellation and abandoned
  checkout cleanup remain separate lifecycle integrations. There is no received
  fulfillment status or confirmed order here, despite the persisted unpaid hold.
- No multi-day calendar or staff schedule editor is added: choices cover the
  earliest eligible day; reviewed stored special/closed-day records are honored.
- Hold expiry is interpreted at reads/reservation checks and materialized during
  successful new reservations; this increment adds no background expiry worker.

Reproduce: `npx playwright test -c playwright.scheduling.config.js`.
For isolated Lighthouse, start `NODE_ENV=production node tests/fixtures/scheduling-server.js`
then `node tests/audit-scheduling.js`; stop the fixture before running Playwright.
See [design/API/file guide](../scheduling-design.md).
