# BE-11 verification — October 22, 2026

## Focused implementation reconciliation — October 23, 2026

Reviewed existing team preview/runtime code at
`47a33e02b630d5dcdfb3615bf2ce632b87c0da97`, preserving Perin's `109da81`
implementation and subsequent shared integrations. Windows x64 / Node 24.22.1 /
Playwright 1.64.1, locked Chromium 156.0.8078.4 and Firefox 157.0 desktop.
No application, fixture, test, dependency, schema or migration change was needed.

Fresh notification service/runtime/HTTPS checks passed for genuine confirmation/
Ready events, channel/template deduplication, sanitized rendering failures,
admin-only idempotent retries, atomic generation/audit rollback, inventory apology,
distinct cancellation/refund text, seven-day resolved expiry and pending-case
extension, redacted-contact suppression, forged-event rejection, v13 upgrade
preservation and cascading cleanup. A disposable configured server successfully
performed startup processing and expired-ciphertext cleanup while public HTTP
kept staff preview endpoints inaccessible. This is a startup runtime check, not
new evidence of hosted operation or a long-running periodic worker.

Selected Chromium/Firefox employee/admin journeys passed for actual preview and
Ready generation, keyboard disclosure/refresh, absence of employee retry controls,
admin failed-generation retry and repeat safety, and clearing private order/preview
content after session expiry, including a delayed parsed body that must not restore
it. No real email/SMS was sent, and no sent/delivered state is claimed.

```sh
node --test tests/unit/notification-service.test.js tests/unit/notification-runtime.test.js tests/unit/staff-orders-http.test.js
node node_modules/@playwright/test/cli.js test -c playwright.staff-orders.config.js notifications.spec.js --project=chromium-desktop --project=firefox-desktop --grep 'employees read actual|admin retries failed|expired sessions clear'
```

File responsibilities remain in [notification design](../notification-preview-design.md):
`src/notifications/outbox.js` queues deduplicated notices inside actual state-change
transactions; `src/notifications/notification-service.js` validates event sources,
generates bounded plain-text previews and enforces read/retry/retention rules;
server runtime invokes processing; existing staff routes and browser panel enforce
access and safe rendering. Raw customer contacts/card values/private tracking
secrets are not duplicated into preview text. All relevant service and transport
checks above used disposable synthetic records, not production data changes.

[BE-09](be-09-refunds.md) and [FE-05](fe-05-tracking.md) retain current evidence for
real cancellation/refund events and customer outcomes. This increment does not
repeat those suites or imply external delivery. Earlier native visual/audit
records below retain their original source/environment; they were not rerun or
presented as new acceptance. Documentation links and diff were reviewed.

BE-11 is **Ready for Testing, not Done**. [TEST-03](https://trello.com/c/WOZ38Ufw)
retains native supported browser/mobile visuals and axe, manual keyboard/zoom/
contrast/screen-reader review, applicable audits and connected fulfillment/
exception/preview acceptance. Existing private noindex exceptions and final
QA/INT/OPS boundaries remain. SEC-02 retains broader contact/grant cleanup;
current preview deadline and redaction checks do not certify all privacy work.
Earlier Firefox launch limitations are historical: this Windows sample passed,
without certifying unrun environments or changing personal browser profiles.

## Original implementation evidence

Story: https://trello.com/c/7V9PKfRN. [Design and file guide](../notification-preview-design.md).

## Server and runtime checks

`npm run test:unit`: **220 passed**, no failures/skips. Six notification service/
storage tests cover actual confirmation and Ready generation, channel/template
deduplication, plain-text privacy, failed rendering, sanitized error codes, admin
retry and repeated retry, cross-order denial, audit-failure rollback, inventory
apology, separate cancellation/refund messages, pending-case retention extension,
seven-day resolved expiry, contact-redaction suppression, forged-source rejection,
and real v12-to-v13 upgrade preservation/rerun/integrity/foreign keys/cascade cleanup.

The seventh new test starts the actual configured `src/server.js` against an
isolated synthetic SQLite file. Startup persists generated previews and public
HTTP still returns 404 for staff preview endpoints. It terminates the child
server and removes only its disposable directory. HTTPS tests additionally check
unauthenticated read denial, no-store responses, no contact/card/secret-link fields,
CSRF/origin denial and employee retry denial. Payment decline queues no confirmation.
Existing pricing, scheduling, session/MFA, payment/refund and tracking tests pass.

## Browser and visual review

Five new cases per profile cover employee confirmation/Ready reading, keyboard
disclosure/refresh operation, admin failed-generation retry and repeat safety,
expired-session clearing with a deliberately delayed parsed response, and generated/
failed preview visual/axe checks in light/dark themes with 320px reflow. Existing
staff/tracking/refund tests continue running. Test-only failure controls invoke
the actual service with a throwing local renderer; no external provider is used.

Forty-eight new references cover open generated/failed panels and the intentional
collapsed disclosure added to employee/admin/refund detail screens. Existing
historical references remain intact; queue/tracking/receipt comparisons retain
their active references. Full-screen layouts were reviewed in all four local
profiles, with representative mobile generated and desktop failed views inspected
at larger scale. No screenshot tolerance is loosened.

The first full run passed 96/100. Four generated-preview comparisons found that
variable-width random UUID text changed wrapping/mask bounds between runs. Using
the same fixed-width font as other order references corrects this deterministic
rendering problem; only those eight newly introduced references are regenerated
and reviewed. Body content remains visible to visual comparisons; only the random
reference is masked. The final full comparison run passes **100/100**, with no
snapshot updates, across Chromium/WebKit desktop/mobile. A final focus-only CSS
rule gives the native disclosure the shared visible focus outline; it does not
change resting layouts. Manual focus/contrast acceptance remains below.

Checkout regression: **16/16 passed**, Chromium/WebKit desktop/mobile, including
existing payment-success/failure/retry and unchanged receipt visual references.

Reproduce browser coverage with `playwright.staff-orders.config.js` and
`playwright.payments.config.js`, selecting `chromium-desktop`, `chromium-mobile`,
`webkit-desktop` and `webkit-mobile`; omit all snapshot-update flags. Production
Lighthouse reproduction uses `NODE_ENV=production node
tests/fixtures/staff-orders-server.js` in one terminal and `node
tests/audit-notifications.js` in another. These are disposable synthetic fixtures,
not production identities or the live preview database. No formatter/linter/build
command is configured for this server-rendered JavaScript application; syntax and
diff checks supplement the executable tests and production-mode page audits.

Lighthouse 13.5.0 default mobile simulated-throttling navigation audits score
**100 Performance, Accessibility and Best Practices** on both Received/refunded
admin detail and Received/refunded guest tracking. SEO is 60 under the existing
explicit private-page noindex exceptions. Sanitized configuration/advisories are
in `be-11-notifications-lighthouse.json`; no cookies or private fragment links are
retained. Navigation audits use the disclosure's default closed state; open
generated/failed states are covered by browser/axe/visual checks, not a separate
Lighthouse interaction-flow claim. Final syntax, documentation/content and scoped
diff review pass; existing migrations 001–012 are unchanged.

## Remaining acceptance boundaries

Firefox still fails before navigation with the previously reproduced local
profile-folder startup issue. No Firefox application assertion passes. See
[the investigation](be-05-follow-up.md#firefox-investigation); no OS protection or
personal profile is changed. Manual keyboard/zoom/contrast and representative
screen-reader acceptance remains outstanding. Automated keyboard/axe checks are
not full WCAG conformance. Keep BE-11 open until mandatory gates pass or the human
explicitly revises them.

The existing private staff-detail SEO-only exception applies; no new page or
indexing waiver is introduced. There is no external sending, real financial
action, live-data migration, dependency addition or deployment. Broader contact/
tracking deletion remains SEC-02; this increment enforces preview expiry and
cleans previews when contacts are removed. Raw tracking links are not duplicated
into preview storage. Original confirmation/admin replacement remains their
available display path. Historical events that never queued a notice are not
silently backfilled into previews.
