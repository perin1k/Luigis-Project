# BE-05 follow-up verification — October 22, 2026

Story: https://trello.com/c/HwkXU6Mn. Continues the implementation in `767c92f`.

## Changes

- `src/public/js/tracking.js` rechecks the request generation after response JSON
  parsing, before creating or replacing any DOM content. A link can change while
  parsing awaits; the earlier headers-only generation check did not cover that
  boundary. The new browser test deliberately delays parsing, opens an invalid
  different link, releases the old body and verifies private content stays empty.
  It failed before the fix and passes afterward.
- `src/app.js` adds Brotli negotiation for precompressed public CSS/JavaScript,
  with existing gzip/identity fallback. Brotli is computed only for cached public
  assets at app creation, not dynamic private HTML. Bootstrap is 22,970 bytes in
  Brotli versus 30,823 in gzip (about 25% smaller), with identical decoded content.
- The tracking-only CSS bundle concatenates the exact existing Bootstrap and staff
  rules. `src/views/partials/head.ejs` selects it only for tracking, replacing two
  blocking stylesheet requests with one; other pages keep their existing styles.
  No CSS, functionality or security rule is removed. Final-response preload hints
  were investigated but did not improve the score and were not retained.
- `src/views/pages/tracking.ejs` explicitly sets tabindex=0 on its refresh button,
  retaining natural tab order. macOS WebKit's default button-tabbing behavior
  skipped the native button; both WebKit profiles pass with the explicit index.
  Upstream context: https://github.com/microsoft/playwright/issues/41808.
- `tests/staff-orders-e2e/orders.spec.js` adds response-body-race and keyboard skip/
  refresh checks. Keyboard focus moves from the skip link to main, then to refresh;
  activation refreshes progress without losing the secret fragment. This is
  automated keyboard coverage, not a substitute for representative screen readers.
- `tests/unit/staff-orders-http.test.js` checks the private-data-free tracking shell
  and public-only assets. `tests/unit/http-hosting.test.js` verifies exact decoded
  Brotli bytes, fallback/refusal negotiation, caching and HEAD responses. The guide
  describes these integration points.

## Verification

- `npm run test:unit`: 208 pass, zero failures/skips.
- Final staff/admin/tracking browser run: 60 pass in Chromium/WebKit desktop and
  mobile, including both new checks and all existing screenshot comparisons,
  axe A/AA-tagged checks and 320px reflow. Run the four local projects through
  `playwright.staff-orders.config.js` to reproduce.
- Final checkout browser run: 16 pass in those four profiles via
  `playwright.payments.config.js`, including unchanged receipt references.
- No screenshot reference was changed. Earlier full browser attempt passed 58/60;
  the two failures identified WebKit button tabbing. The explicit natural index
  fixed both; the new final full run passes 60/60. The body-race test failed before
  its generation check and passes afterward.
- Focused transport/HTTPS checks pass, syntax checks pass, final documentation and
  scope review performed, and `git diff --check` is clean. No dependency, migration,
  account setup, deployment or financial action.

Earlier evidence remains in `be-05-tracking-exceptions.md`; it is historical rather
than silently rewritten. Automated keyboard/axe coverage does not complete manual
keyboard/zoom/contrast/screen-reader acceptance. That and Firefox remain pending;
keep BE-05 open. The previously unmet tracking performance gate is now passed.

The unchanged Lighthouse 13.5.0 default mobile simulated profile now reports
Performance/Accessibility/Best Practices 100 on queue, admin detail and tracking.
SEO is 60 under the separately approved private-page noindex exceptions.
`be-05-follow-up-lighthouse.json` retains sanitized configuration and results.
Brotli alone and preload hints each left tracking Performance at 99; combining
its identical styles into one resource closed the remaining point. No audit
configuration, indexing policy or visual reference was weakened/changed.

## Firefox investigation

Reproduced launch failure with both the ordinary macOS temporary directory and
`TMPDIR=/private/tmp`; both exit before navigation with “Could not find profile
folder.” No application assertion runs. The installed browser is the existing
Playwright arm64 Firefox build. Changing the temporary profile path does not fix
this environment.

The observed failure matches an upstream shared-application-data permission issue:
https://github.com/microsoft/playwright/issues/42768 and Mozilla's startup reporting
change https://bugzilla.mozilla.org/show_bug.cgi?id=2062988. This is a match to an
upstream report, not proof from a local OS permission trace. No privacy/sandbox
setting or personal Firefox directory was altered. Firefox remains unverified;
run the committed Firefox projects in a working authorized environment.
