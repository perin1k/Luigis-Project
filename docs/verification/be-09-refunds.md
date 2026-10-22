# BE-09 verification — October 22, 2026

Story: https://trello.com/c/ZbHyVm4H. Scope and file integration:
[demonstration refund guide](../demo-refund-design.md).

## Verified

- `npm run test:unit`: 213 passing, zero failures/skips, with loopback listener
  permission. An initial restricted run could not bind test listeners (EPERM);
  rerunning with the needed local listener permission passes.
- Five new domain/storage tests cover full 900 item + 88 tax + 198 tip reversal,
  zero net after success, unchanged original payment, duplicate/same/new request
  keys, admin-only access, stale/invalid/forged inputs, failure then reviewed retry,
  atomic audit-failure rollback, tracking expiry after resolution, cancellation
  holds/denial/preparation boundaries, and immutable records. The actual v11
  upgrade test preserves payment rows, backfills exact original amounts/times,
  reruns safely, and passes SQLite integrity/foreign-key checks.
- Existing HTTPS tests now include employee refund denial, private-link-only
  cancellation, wrong-origin denial and repeated request handling. Existing
  payment, authorization, scheduling, pricing, encrypted synthetic-data, exception
  and no-show tests continue passing. Migration count assertions advance to 12;
  no old migration or existing tracking test is removed.

## Visual review and checks

New cancellation and failed/succeeded admin refund screens were reviewed in light
and dark themes on Chromium/WebKit desktop/mobile. Review found the new checkboxes
inheriting text-input minimum heights; scoped sizing corrects them while retaining
large label targets. Twenty-four new screenshot references cover those states;
historical references are preserved. Random order references are masked, matching
the existing baseline convention. Checks include axe WCAG A/AA tags and 320px
reflow. Keyboard coverage now traverses the cancellation checkbox/button before
refresh while preserving the secret link. Lost-refund-response coverage executes
the server write, drops the response, and verifies the same UUID returns the one
recorded outcome. A failed refund remains visibly distinct until a reviewed retry.

- Final full browser run: **80/80** staff/admin/tracking/cancellation/refund tests
  pass across Chromium and WebKit desktop/mobile, with no snapshot-update flag.
  Payment regression run: **16/16** pass in the same profiles, including unchanged
  receipt references. Runs use `playwright.staff-orders.config.js` and
  `playwright.payments.config.js`, selecting those four projects.
- Final review removed a misleading unconfirmed-capacity warning after a final
  cancellation has correctly released capacity. A domain assertion covers this;
  all 213 server tests pass again. Only the new refund visual references change
  for this intentional removal; active-order screens retain their references.
  The final eight refund visual/accessibility/reflow cases pass again without
  updating snapshots after that correction.
- `tests/audit-refunds.js` uses the disposable production HTTPS fixture, real
  application admin MFA/cancellation/refund writes, Lighthouse 13.5.0 and unchanged
  default mobile simulated throttling. Refunded admin detail, refunded tracking
  and Received tracking with cancellation controls score **100 Performance,
  Accessibility and Best Practices**; SEO 60 is the explicitly approved noindex
  exception. Sanitized results/configuration are retained in
  `be-09-refunds-lighthouse.json`; no cookies or private link tokens are recorded.
- Syntax, documentation/content, final diff and whitespace checks pass. No new
  dependency or alteration of versions 001–011 is included.

## Remaining acceptance boundaries

Firefox remains blocked before navigation by the previously reproduced local
“Could not find profile folder” startup error; no Firefox application assertions
pass. See [the investigation](be-05-follow-up.md#firefox-investigation). No privacy
protection or personal profile is altered. Representative manual keyboard, zoom,
contrast and screen-reader acceptance is still outstanding; automated axe and
keyboard checks do not establish full WCAG conformance. Keep the card open until
mandatory gates pass or the human explicitly revises them.

The existing explicit SEO-only exceptions apply to the same private staff detail
and tracking routes; both retain noindex. All other audit gates still apply.
No real transfer, external notification, hosted deployment, account creation,
shared-history rewrite or live-data migration was performed. Pending event-linked
outbox records are not rendered/delivered notification previews; BE-11 remains
separate. This local synchronous adapter is not remote-provider reconciliation.
