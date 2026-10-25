# End-user cleanup checkpoint

Approved by Brody October 25, 2026 under [the cleanup card](https://trello.com/c/qZvVZGnF).
Implementation and focused checks below are separate from complete native/visual/
manual and hosted final acceptance. No production deployment is part of this push.

## Implemented

- Shared top/bottom wizard actions with the same submit/back path, synchronized
  busy/uncertain-payment state, accessible names and preserved focus handling.
- Native beverage disclosures show sizes on demand and retain selections when
  collapsed. Counts remain visible; Remove this drink clears only that beverage
  and returns focus. Six approved beverages now also appear in the unconfigured
  presentation. Zero, invalid and aggregate quantity checks remain authoritative.
- `/menu` uses `partials/menu.ejs` and `ordering/public-menu.js`. A
  configured app reads the current catalog on each request rather than duplicating
  prices. Prices, availability and pre-tax/optional-tip wording remain explicit.
- Original project-authored SVG oven/pizza-peel identity, pepperoni favicon,
  clear ingredient-name tiles and staggered brick texture. Local assets, system
  fonts and semantic cream/brick/red theme tokens introduce no library or external
  image service. Removed the superseded CSS pizza illustration rules.
  Brody's review requested clearer toppings, a less cartoon-like oven and a
  welcome-only home. Ingredient icons were removed, oven linework/colors refined,
  and menu listings now appear only on /menu. Home links to menu/order/account.
  His next review requested more distinctive buttons; action controls now have
  bordered surfaces, stronger labels, a restrained raised edge and focus states.
  A follow-up made home/menu/account actions actual solid/outlined button
  components, extended bordered staff/customer recovery/navigation actions and
  redirected menu recovery links to /menu. Hover checks caught a low-contrast
  color-fade midpoint; instant state changes now pass without waiting out a fade.
  Public stylesheet URLs carry a content-derived fingerprint so cached CSS cannot
  disguise a released style update; gzip/HEAD/cache and single-bundle checks pass.
- Visible customer/staff links retain real server authorization. Inline refund
  review errors focus the required checkbox; refresh clears its approval and stale
  warning. Processing, success and uncertain-result recovery remain distinct.
  If expiry removes the private panel, only safe public sign-in feedback survives.
- Active draft navigation warns through the native beforeunload mechanism without
  storing contact/checkout data in browser storage. Browser support varies; it is
  not durable draft persistence or a promise to survive loss of a device/process.
- Plain-language user guidance updated. Scheduling past-date/cutoff/capacity rules
  remain server-side; new tampered-date regression supplements the existing DST,
  revision, capacity, hold-expiry and cutoff checks rather than replacing them.

## Focused verification and remaining gates

New navigation/drink regressions first failed against the old UI as expected.
The new no-JavaScript menu regression also first failed before implementation.
Six initial ordering checks passed, followed by 32 desktop/mobile Chromium checks
for ordering/home/theme/reflow and two successful real-link leave/cancel checks.
Eight changed-flow desktop/mobile Firefox checks passed. Existing pricing,
scheduling, payment retry, transport and menu checks are reused or rerun by impact.
The earlier automated reload cancellation attempt did not preserve its old document;
the final test exercises actual menu-link navigation/dismissal and verifies the
retained draft, URL and empty session storage. No failed run is recorded as a pass.

Refund checks reproduced missing focus and then passed after implementation.
Session-expiry checks caught a missing surviving public recovery message after the
new inline panel was removed; both expiry cases pass after that correction.
Current-menu integration assertions passed before the expected old visual reference
comparison failed. New native candidates need internal review before acceptance.

Brody separately approved bounded cleanup GitHub API/credential use in memory,
Windows/macOS/Linux CI and internal synthetic visual review. The new focused
workflow has explicit collect and compare phases; candidate generation is not a
passing visual comparison. It preserves Windows Chromium/Firefox and macOS/Linux
WebKit coverage rather than claiming Windows WebKit equals Safari.

This card remains In Progress until remaining implementation/review is resolved,
or Ready for Testing only when implementation/focused checks are complete with
native/manual/checkpoint gaps explicitly linked. Changed branding/theme/header
invalidates affected historical visual references. Do not blindly update them,
disable their comparisons, claim all existing suites pass, or call the application
commercial-ready. Final actual hosted desktop/mobile Lighthouse 100s, integrated
QA, customer-account acceptance and TEST-04 remain required on their own cards.

Native collection `40167748317` passed Windows, macOS and Linux on `08b5f90`.
That collected design was superseded by the subsequent human-requested artwork,
home/menu and button changes; do not treat its images as the final references.
Cancellation was attempted to avoid duplicate work but GitHub returned 409 because
the run had already finished. Its unchanged domain/workflow results remain useful
within their scope. Final revised native collection/comparison is still pending.
The new direct uncertain-payment regression passed Chromium and Firefox: top and
bottom actions retry the same request ID, keep editing locked and yield one payment.

Local Lighthouse 13.5.0 audited home, menu and ordering with standard mobile and
desktop profiles on the refreshed disposable preview: all six combinations scored
100 for Performance, Accessibility, Best Practices and SEO, with no runtime error
or label-content-name mismatch. This observation preceded the final button-surface
and stylesheet-fingerprint follow-up; affected final auditing remains explicit.
An earlier preview audit overlapped removal of an obsolete cached template asset
and yielded invalid page results; those are not accepted evidence. The corrected
logo uses native visible text rather than a mismatching aria-label.

The source-only no-JavaScript home test originally still expected the menu heading
on home; it now verifies the welcome heading and follows the menu link without
JavaScript. Its corrected check passes. Further visual reference reconciliation
and final current-source verification are recorded separately as they complete.
