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
- `/menu` and home share `partials/menu.ejs` and `ordering/public-menu.js`. A
  configured app reads the current catalog on each request rather than duplicating
  prices. Prices, availability and pre-tax/optional-tip wording remain explicit.
- Original project-authored SVG oven/pizza-peel identity, pepperoni favicon,
  decorative ingredient drawings and staggered brick texture. Local assets, system
  fonts and semantic cream/brick/red theme tokens introduce no library or external
  image service. Removed the superseded CSS pizza illustration rules.
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
