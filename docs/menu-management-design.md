# BE-07 persisted menu, availability and special-hours management

October 22 three-tier policy update: only the **Owner** publishes prices and
manages service hours. Admins and Employees retain ingredient availability access.
The server resolves ownership from the protected designation; existing admins
are not implicitly owners. See [current account policy](staff-role-policy.md).

Story: https://trello.com/c/bpjfXwga. October 22, 2026. This increment supplies
actual owner/staff controls using existing storage, permissions and transactions.
It adds no dependency, migration, real provider integration or deployment.

## Behavior and integration

`src/staff/menu-service.js` executes reads/mutations inside the session service's
synchronous authorized transaction. Employees/admins can manage ingredient
availability; only the Owner publishes prices or manages service hours. Caller-supplied
roles never grant access. Expired, revoked or disabled identities are rejected by
the existing session service.

Price publication requires the displayed catalog fingerprint and all current
pizza/drink size prices, validated as integer cents. Each amount is bounded to
0–1,000,000 cents. It creates a new catalog version, copies the existing approved
options and ingredient mappings under new identifiers, applies the reviewed
prices and publishes atomically. Previous catalogs, purchased lines/quotes and
financial records remain intact. Existing server pricing/payment rechecks require
review of changed unpaid totals. There is no menu cache to invalidate: subsequent
reads select the latest published version and compute the current fingerprint.
No new topping, crust, surcharge, discount or counted-stock feature is introduced.

Availability updates require the ingredient revision. Unavailable ingredients block
the corresponding catalog recipes. Affected active paid orders receive explicit
inventory review records and bumped order revisions, without silently changing
recipes, progress or ready times. Restoring availability does not dismiss earlier
reviews; existing admin exception handling governs decisions.

Special hours use an explicit service date and displayed revision. The current
editor supports same-day whole hours between 4 AM and 11 PM, avoiding ambiguous
DST transition hours and overnight scheduling. Central-time instants are converted
by the shared scheduling helper. Cutoff remains closing minus 30 minutes and latest
pickup closing minus 10 minutes. Past dates cannot be changed. Closed days have
null time fields. Affected active orders receive hours-change review records;
bookings are never moved. Existing unpaid payment checks reject invalidated hours.
This is date-specific management, not an arbitrary recurring-hours rule editor.

All changes and their fixed-summary audit events commit together or roll back.
Stale revisions/fingerprints return 409. There is no silent overwrite or automatic
retry on a possibly committed, interrupted response.

## File guide

- `src/staff/menu-service.js`: authorization, validation, versioned publication,
  availability/hours persistence, review creation and sanitized auditing.
- `src/staff/menu-router.js`: pinned direct-HTTPS host/origin, secure cookies,
  CSRF checks, strict 8 KiB JSON without inflation and safe errors. Routes are
  `/staff/menu`, `/api/staff/menu/csrf`, GET `/api/staff/menu/hours?date=...`, and
  POST `/api/staff/menu/{availability,prices,hours}`. Responses are private/no-store.
- `src/views/pages/staff-menu.ejs`: escaped server-rendered initial data, shared
  ingredient controls, Owner-only price/hour forms and explicit labels/instructions.
  Private page retains noindex, consistent with staff indexing policy; SEO is
  inapplicable and is not silently reported as 100.
- `src/public/js/staff-menu.js`: CSRF fetch, dollar-to-integer-cent conversion,
  submission/loading/error/focus behavior and current-record loading. Browser
  previews never replace server validation or permissions. No browser persistence.
- `src/public/css/staff.css`: menu-scoped responsive grids and checkbox sizing;
  other staff layout rules are unchanged.
- `src/app.js` and `src/server.js`: configured service/router integration. No
  unconfigured public HTTP staff route is enabled. The queue links to menu controls.
- `src/ordering/scheduling-service.js`: exports the existing Central whole-hour
  conversion helper for reuse; its scheduling rules are unchanged.
- Existing isolated staff fixtures now wire the real menu service. Test-only
  reset controls remain confined to fixture servers.

## Verification and outstanding acceptance

Seven service tests verify permissions, price cloning, fingerprint invalidation,
unchanged purchased quotes, ingredient recipe blocking/review, stale writes,
closed/special-day behavior including DST, input boundaries and audit rollback.
The HTTPS test verifies pinned host, anonymous redirect, employee/admin controls,
CSRF/origin, invalid/oversized/compressed JSON, persisted availability and conflicts.
`npm run test:unit`: **249 pass**, zero failures/skips on this increment.

`tests/staff-orders-e2e/menu.spec.js` covers real Owner publication/reload,
availability and hours changes with queue warnings, keyboard submission,
employee restrictions and expired-session recovery. Light/dark snapshots are
OS/browser/viewport specific; axe and 320-pixel reflow checks supplement them.
Commands and final browser/audit results are recorded in the verification note.
Theme changes wait for actual animation completion before contrast checks; no
accessibility rule or threshold is disabled.

The preceding results describe the original macOS increment, not a new run.
Current verification and remaining acceptance are tracked on
[BE-07](https://trello.com/c/bpjfXwga),
[FE-07](https://trello.com/c/d3pei0I4) and
[TEST-01](https://trello.com/c/5lLwJGB8). The original Firefox launch limitation
belongs to that environment; distinguish it from later native results.

Under the [staged verification policy](../AGENTS.md#staged-verification-cadence),
finished implementation with passing focused checks may move to Ready for Testing.
That is not acceptance. TEST-01 covers the menu/editor/customer-availability
journey, affected native browser/visual/accessibility checks and explicit remaining
criteria. Preserve platform-specific references and review visual changes rather
than accepting snapshots automatically. Keep manual keyboard, zoom/contrast and
screen-reader observations specific to these screens; staff account acceptance
does not prove the menu controls were reviewed. Retain private noindex behavior
and record audit applicability explicitly. Existing QA cards retain integrated
and hosted release acceptance; this guide does not certify those outcomes.
