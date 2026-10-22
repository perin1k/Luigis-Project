# BE-01 pricing verification — 2026-10-21

Implementation is ready for team review; the card remains incomplete pending the
mandatory Firefox UI and manual accessibility acceptance checks.

## Verified

- Node 24.14.1, macOS 27.0.1 arm64; existing pinned project dependencies.
- `npm run test:unit`: 165/165 unit/integration tests passed. After the final
  naming-only cleanup, the eight catalog/pricing tests also passed.
- Pricing Playwright suite: 24/24 tests passed across Chromium and WebKit,
  desktop and mobile. Covers authoritative prices, tax/tips, explicit review
  after menu changes, unavailable ingredients, recoverable network/payment
  failures, forged prices, quantity limits and retained selections.
- Eight new light/dark screenshot baselines were inspected before creation.
  A separate comparison run without baseline updates passed all four visual
  cases. Automated axe checks and 320px reflow checks passed in those cases.
- Lighthouse 13.5.0, default mobile simulated throttling, production-mode
  isolated database fixture, `/order`: Performance 100, Accessibility 100,
  Best Practices 100, SEO 100. Configuration and advisories are retained in
  [the sanitized report](be-01-lighthouse.json). This navigation audit does not
  establish every dynamic state or WCAG conformance.
- Actual application runtime using the existing demo database on loopback port
  3005: `/order` and `/api/pricing/catalog` returned 200; `/auth/session` returned
  404, confirming public database mode does not enable staff authentication.
- Focused source/diff review; no new dependencies or schema changes.

Reproduce browser coverage with `npx playwright test -c playwright.pricing.config.js`.
Run `NODE_ENV=production node tests/fixtures/pricing-server.js` and then
`node tests/audit-pricing.js` for the isolated Lighthouse audit. Stop the fixture
before running Playwright, which starts its own isolated server.

## Failed or pending

- Firefox UI launch failed before page navigation with `Could not find profile
  folder`, matching the previously recorded local environment limitation.
  Firefox request-only tests passed but do not verify Firefox UI behavior.
- Representative screen-reader, manual keyboard/zoom/contrast review and final
  three-engine acceptance remain pending. Automated checks are not substitutes.
- BE-02 order persistence/capacity reservations and BE-03 payment confirmation
  remain separate work. This endpoint previews prices only: it creates no order,
  reservation, persisted quote or payment. The current payment handoff reports a
  recoverable unavailable state and preserves the cart.

See [pricing design and file guide](../pricing-design.md) for integration boundaries,
approved demonstration tax assumptions and API contracts.
