# INT-02 shared persisted records

October 23, 2026. [INT-02](https://trello.com/c/yGIbpR63).

## Scope and provenance

The card's original 58592af status predates the existing team implementation.
`src/server.js` already composes customer, staff, tracking, menu and reporting
services around the same configured database, with the real authentication
runtime. This increment extends integration evidence; no new production service,
authorization policy, metric definition, dependency, schema or deployment is
introduced. Existing roles, encrypted synthetic payments and internal notification
previews remain under their approved policies.

The current Owner/Admin/Employee policy supersedes the card's older admin-only
analytics wording: only Owner reads sales or edits prices. Admin can cancel/refund
and manage employees; Employee can prepare orders and toggle ingredients. Existing
analytics policy/service definitions govern rounding, cancellation exclusion,
payment/refund periods, Central pickup buckets and Received-to-Ready elapsed time;
this increment does not invent new financial definitions.

## Acceptance map

| Criterion | Connected evidence |
| --- | --- |
| Customer purchase appears in employee queue/detail | A browser submits and pays a new order through real customer services. A separate Employee session locates its server-issued reference and recipe. |
| Staff changes reach customer tracking | Employee saves Preparing/Baking/Ready and refreshes; the customer's private tracking page refreshes to each persisted status. |
| Menu edits affect subsequent purchases while history stays intact | Owner publishes a new base price and reloads it. Another purchase receives the new tax-inclusive total; replaying the original paid operation preserves its old totals/items. Owner marks pepperoni unavailable; a fresh customer builder disables that topping. |
| Reporting reflects actual transactions/refunds | Admin cancels/refunds the newly purchased order; customer tracking shows cancellation and the completed demo refund. Owner reporting excludes the cancelled purchase from its eligible cohort, records its exact refund, restores seed-only item totals and reports the cancellation in the pickup-date bucket. |
| Role navigation and account operations | Customer cannot read staff orders; Employee and Admin cannot read analytics; Employee has no refund controls. Admin deactivates an active Employee through the account UI; the other session's order refresh clears private details and returns sign-in. |
| Stale/concurrent/error recovery | Two Employee tabs load one newly purchased order. A stale progress write conflicts after the first advances it; refresh loads the correct next step. An interrupted queue refresh keeps explicitly stale records; retry loads actual persisted status. |
| Production boundary | Test control routes and generated staff identities remain in fixtures. Source runtime uses configured real database/auth services. Actual public-hosted role/access verification remains under OPS and final QA. |

## File guide

- `tests/fixtures/staff-orders-app.js`: optional `bCustomerCheckout` mode supplies
  catalog, scheduling, order and demo payment services to the existing app,
  alongside the staff services on one disposable database. It uses the existing
  fixture clock and an in-memory random encryption key. Default mode remains
  unchanged so earlier test assumptions and visual references are preserved.
- `tests/fixtures/staff-orders-server.js`: isolated `/__test/reset-integrated`
  selects that mode. `/__test/reset` still restores the earlier fixture.
- `tests/staff-orders-e2e/shared-records.spec.js`: four scenarios using separate
  browser contexts for Customer, Employee, Admin and Owner; actual password/MFA
  sign-in, native controls, genuine submissions, payments and server transactions.
  Seeded baseline orders remain distinct from the new customer orders. No mocked
  successful write is treated as real. Refunds transfer no money.
- `docs/integrations.md`: current composition, policy and test/runtime boundaries.

## Verification

Environment: Windows x64, Node 24.19.0, locked Playwright 1.64.1; self-signed local
HTTPS, synthetic contacts and disposable in-memory SQLite. OpenSSL must be on PATH.

```sh
node node_modules/@playwright/test/cli.js test -c playwright.staff-orders.config.js tests/staff-orders-e2e/shared-records.spec.js --project=chromium-desktop --project=chromium-mobile --project=firefox-desktop --project=firefox-mobile
node --test --test-concurrency=1 tests/unit/staff-orders.test.js tests/unit/staff-orders-http.test.js tests/unit/order-progress.test.js tests/unit/menu-service.test.js tests/unit/analytics.test.js
```

Initial three-scenario Chromium desktop run: **3 passed**. Focused domain/HTTPS
run: **19 passed**, including authorization, TLS/origin checks, immutable price
snapshots, availability reviews and revision-checked status transitions. Final
four-scenario matrix: **16 passed** across Chromium/Firefox desktop/mobile in
3.0 minutes. `git diff --check` passed. No production defect was found in these checks;
the approved increment supplies missing connected evidence and documentation.

## Grouped pre-OPS follow-up

The [pre-OPS checkpoint](preops-checkpoint.md) adds current native cross-role
coverage using these same four scenarios; accepted TEST/SEC checks are reused
after impact review. John's implementation and Perin's QA ownership are preserved.
The original hosted role/navigation/access criterion remains unverified until OPS
supplies the approved environment; fixture results cannot satisfy that criterion.

## Remaining acceptance and limits

October 24 follow-up: the approved [private hosted verifier](int-02-hosted.md)
targets the remaining public-host criterion without repeating accepted native
coverage or changing production business behavior. See its current results before
treating hosted acceptance as complete.

This fixture verifies services sharing actual records in a disposable database;
it does not prove disk durability across server restarts or actual hosted runtime
configuration. Existing storage/security evidence remains separate. Customer and
staff sessions are genuine within the synthetic fixture, not newly provisioned
real staff accounts.

The approved Windows staff matrix is Chromium/Firefox desktop/mobile. Native
Windows WebKit staff authentication remains an unsupported diagnostic, as recorded
in staff acceptance; macOS/Linux supported-engine evidence is a separate gate.
No security setting is weakened to enable a browser.

The suite is runnable with the focused command above. It is not registered in the
already accepted TEST-03 CI collection, which has an explicit file list. Adding
new native CI coverage is separate workflow scope; this increment does not claim
that earlier hosted runs included these new shared-record scenarios.

QA-01/02/03 retain applicable integrated/manual accessibility, security, native
platform, visual/Lighthouse and runtime acceptance. OPS retains public HTTPS
deployment and actual hosted role-navigation/access verification. This increment
does not rerun broad Lighthouse/visual baselines, claim complete WCAG conformance,
establish external email/SMS delivery, or provision infrastructure. Keep INT-02
incomplete until its applicable acceptance is reviewed; Ready for Testing is not
Done. Source card criteria are retained.
