# BE-07 acceptance handoff — gates retained

## Accepted checkpoint — October 23, 2026

BE-07 and FE-07 completed their feature acceptance through
[TEST-01](test-01-menu-acceptance.md), including strict supported-platform native
comparisons and scoped human review. The earlier open-card instructions below
describe the historical handoff and are superseded by that accepted record.
Final hosted QA and the explicitly retained deployed performance gate remain.

## Current workflow — October 23, 2026

The original macOS evidence and limitations below remain historical records.
Use [TEST-01](https://trello.com/c/5lLwJGB8) for batched menu acceptance and the
current [BE-07](https://trello.com/c/bpjfXwga) /
[FE-07](https://trello.com/c/d3pei0I4) notes for later focused verification.
Passing focused checks allows finished implementation to enter Ready for Testing;
neither that status nor a teammate's acceptance of other staff screens closes
these cards. Native visual, applicable browser/platform, manual accessibility and
audit acceptance remain explicit checkpoint criteria. No historical result below
is a claim that those checks ran again on a later commit.

## Original handoff

October 22, 2026. Card: https://trello.com/c/bpjfXwga.
The human explicitly chose: **“Retain gates; teammates will verify missing checks.”**
No Firefox, cross-platform or manual screen-reader requirement is waived. Keep
BE-07 open until the full acceptance evidence is available.

## Work ready for teammate verification

The [menu implementation](../menu-management-design.md) supplies actual persisted
prices, ingredient availability and special hours. Existing tests cover immutable
purchased snapshots, revision conflicts, permissions, audits and unpaid checkout
rechecks. The last complete server suite has **249 passes**, no failures/skips.
This follow-up changes tests/references/documentation only, not application behavior
or dependencies; it does not invent another full-suite run.

A new two-tab browser story verifies that a stale price or hours form receives a
conflict, preserves the operator's entered values, and can reload the other tab's
saved record. The existing menu owner/employee browser flows cover actual
save/reload, permissions, review warnings and expired sessions.

The new menu-navigation link intentionally changes staff queue/detail, refund and
notification views. An initial normal Chromium-desktop comparison produced three
expected visual test failures. Reviewed queue/admin-detail diff images localized
the change to navigation; a representative updated mobile queue was inspected for
legibility/reflow. The reconciliation run passed **32 cases** across Chromium/WebKit desktop/mobile:
4 concurrent-tab scenarios and 28 staff visual/accessibility scenarios. It updated
56 affected light/dark macOS references. Only affected macOS references are
reconciled. Existing Windows
and Firefox references are preserved, not replaced with macOS images.

A follow-up **normal, non-updating Chromium-desktop comparison passed 3 cases**:
concurrent-tab recovery, queue visuals and admin-detail visuals. This confirms
representative references compare cleanly after review; it does not imply that
Windows/Linux/Firefox or manual acceptance ran. No application source changed,
so Lighthouse and the unchanged server suite were not redundantly repeated.

## Required teammate checks

| Check | Procedure / evidence to return |
| --- | --- |
| Windows and Linux runtime | Follow [cross-platform setup](../cross-platform.md), use the lockfile, run `npm ci` and `npm run test:unit`; record OS/architecture, Node/npm, Git and Playwright versions, exact commit and actual pass/failure counts |
| Firefox desktop/mobile | Run the menu stories below in an environment where the locked browser launches; report launch failures separately from application failures |
| Native visual references | Review current queue/detail/refund/notification navigation diffs on that OS. Generate only missing native references after inspection; do not copy macOS screenshots over Windows/Linux or broadly normalize snapshots |
| Keyboard and focus | Reach all ingredient buttons, price fields, date/hours controls, load/save and refresh links without a pointer. Check visible/unobscured focus, logical order, error/status focus, no traps, and recovery after expiry/conflict |
| Zoom/contrast | Check light/dark at 200% and 400%, narrow reflow, readable labels/errors, controls and checkbox indicators; automated axe is supporting evidence, not the full review |
| Representative screen reader | Review headings/landmarks, ingredient availability/button names, price groups/labels, closed-day checkbox, loading/success/error announcements and stale-edit recovery with a named actual screen-reader/browser/OS combination |
| Private-page indexing | Keep `/staff/menu` noindex. Recorded Lighthouse SEO is 60; an applicable explicit indexing/audit acceptance decision remains needed rather than manufacturing SEO 100 |

Focused menu command (all configured desktop/mobile engines):

```sh
npx playwright test --config=playwright.staff-orders.config.js --grep "menu owner|menu employee|menu concurrent"
```

Affected staff visual checks (normal comparison, not baseline acceptance):

```sh
npx playwright test --config=playwright.staff-orders.config.js --grep "queue visual|detail visual|refund .* visual|notification .* visual"
```

Use the isolated HTTPS fixture from the config. Its self-signed-certificate handling
is confined to test automation; do not bypass warnings for a deployed site.
Do not publish fixture credentials, MFA codes or unredacted runtime data in reports.

## Known blocker and reporting format

This Mac's Firefox fails before navigation with “Could not find profile folder.”
A one-off isolated `/private/tmp` profile-location diagnostic also failed; it did
not change OS permissions, browser sandboxing or application security. The new
concurrent-tab Firefox cases have not executed here. Do not infer a fix or pass
from successful Chromium/WebKit runs.

Return the exact commit, environment/tools, commands, actual passes/failures,
reviewed image differences and manual observations. Missing checks remain marked
not run. Keep the full card open for unresolved mandatory gates; this handoff
neither certifies WCAG conformance nor authorizes hosting/provisioning.
