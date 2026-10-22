# BE-05 tracking and administrator verification — October 22, 2026

Story: https://trello.com/c/HwkXU6Mn. Companion implementation/file guide:
`../tracking-and-exceptions.md`. Prior normal-status delivery: `d304fcc`.

## Verified

- Full server regression: `npm run test:unit` — 207 pass, zero failures/skips.
  Ten new tracking/exception cases cover digest-only grants; minimum guest output;
  genuine successful checkout issuance; seven-day final-outcome and pending-case
  extension boundaries; old-link revocation and preserved explicit expiry; employee
  denial; admin cancellation/capacity release with unchanged successful payment;
  pending cancellation denial; hours/inventory review resolution; prepared no-show
  at closing with a current admin session; audit/event/grant-failure rollback.
  After the final progress-filter adjustment, all ten focused tests pass again,
  including no duplicate guest milestones from administrative review events.
- Expanded real HTTPS tests deny employee exception/replacement requests, enforce
  CSRF/origin, expose minimum tracking data and reject cross-origin tracking reads.
  No order reference/name/contact is accepted as a tracking credential.
- Final staff suite: 52 pass in Chromium/WebKit desktop/mobile via
  `npx playwright test -c playwright.staff-orders.config.js` selecting
  chromium-desktop, chromium-mobile, webkit-desktop and webkit-mobile. Includes
  admin MFA, reviewed cancellation and grant replacement, old-link rejection,
  status progress, stale writes, session expiry, network recovery, and delayed
  responses that cannot overwrite a newly opened tracking link.
- Payment suite: 12 functional cases pass across those four profiles. Complete
  dine-in/carry-out checkout and both demonstration payment methods reach genuine
  Received tracking; lost-response retry remains one payment; decline/expiry do
  not confirm an order. Four receipt visual cases pass in a separate no-update
  comparison run. Use `playwright.payments.config.js` to reproduce.
- 24 new references reviewed: eight admin, eight guest tracking and eight updated
  receipt images, both themes and viewport sizes per engine. The final runs compare
  them without updates alongside 16 existing queue/employee-detail references.
  Random public references and masked synthetic card identities are the only masks.
  No raw grant appears as visible screenshot text. Axe WCAG A/AA-tagged checks and
  320px reflow pass. Original historical receipt baselines are retained under their
  old names; current assertions use `receipt-tracking-*`.
- Lighthouse 13.5.0, default mobile simulated throttling, production NODE_ENV:
  `/order` scores 100 in all four categories; private queue/admin detail each score
  Performance/Accessibility/Best Practices 100, SEO 60. `/track` scores Performance
  99, Accessibility 100, Best Practices 100, SEO 60. Sanitized configuration/results
  are `be-05-order-lighthouse.json` and `be-05-tracking-lighthouse.json`.
- Initial tracking performance 98 included CLS 0.075. Reserved panel/button space
  removes the measured layout shift; all eight changed tracking captures were
  reviewed again before updating references. Final score remains 99 due to paint
  timing (FCP 1.5s, LCP 1.7s), so the performance gate is NOT claimed passed.
- User explicitly approved the SEO-only exception for `/track` on October 22;
  existing queue/detail exceptions apply separately. Noindex stays enabled.
- Initial browser investigation reproduced a same-document fragment-change stale
  view and corrected it, adding a delayed-response regression. An early test used
  the wrong MFA button name; the corrected test uses the actual accessible label.
  Contrast was checked after the existing theme animation settles, consistent with
  other suites. Expected missing/changed-baseline review runs are not passing
  comparison evidence; final comparisons are separate. No failed result is hidden.
- Syntax checks and focused source/documentation/diff review. No dependency,
  migration, real identity setup, money movement, notification sending or deployment.

## Remaining acceptance and boundaries

- Required tracking Performance 100 remains unmet (99). Firefox still cannot launch
  in the existing environment due to the profile-folder error; new paths have not
  passed Firefox. Manual keyboard/focus, zoom/contrast and representative screen
  reader acceptance remains pending. Do not close BE-05 or claim full WCAG coverage.
- Lighthouse `/order` audits its initial navigation; dynamic receipt states have
  functional/visual/axe coverage rather than a separate Lighthouse navigation URL.
- Actual demo refund processing and notification/contact cleanup are BE-09 and
  related integration work. Cancellation merely records refund review required;
  tracking remains available while that unresolved case lacks successful refund
  evidence. Late-payment recovery never silently bypasses capacity; cancellation
  remains available to admins when fulfillment is impossible.
- Raw tracking grants are returned once. A payment response lost after commit
  recovers the payment without minting another grant; approved admin-reviewed
  replacement recovers the lost link. Existing explicit expiry is preserved.
- Private tracking enforces deadlines on reads; this is not a claim that background
  contact/notification deletion jobs are implemented. Staff/admin transport still
  requires operator-owned direct HTTPS and individual accounts; HTTP customer
  preview never enables staff access.

Implementation is reviewable; retain BE-05 incomplete until the remaining quality
checks pass or the user explicitly revises them. This record does not waive gates.
