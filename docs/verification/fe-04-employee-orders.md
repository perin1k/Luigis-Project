# FE-04 employee queue and detail presentation

October 23, 2026. Source: [FE-04](https://trello.com/c/gVe9zURr).
Broader acceptance: [TEST-03](https://trello.com/c/WOZ38Ufw), followed by final QA.

## Scope and integration

Existing application services already supply paid order snapshots, scheduled
Central ready times, preparation controls, cancellation holds and authorized
menu availability controls. This increment fills two presentation gaps: explicit
Completed/Cancelled/Not collected queue filters and clearly labeled review notices.
The default queue still contains only active paid orders.

- `src/staff/orders-service.js`: validates final-status filters and selects the
  requested status through bound SQL parameters. Existing session authorization,
  accepted-quote/payment matching, ordering, pagination and retention remain.
- `src/views/pages/staff-orders.ejs`: server-rendered filters, neutral empty-state
  text and review notices. Reading/filtering does not require browser JavaScript
  after secure sign-in; status and availability writes retain their existing flows.
- `src/public/js/staff-orders.js`: refreshed queue/detail uses the same labeled
  notices and hides the detail notice when no reviews remain. Dynamic text uses
  textContent/native DOM creation.
- `src/public/css/staff.css`: review notices reuse semantic theme colors, a border
  and explicit text, so their meaning does not depend on color.
- `tests/unit/staff-orders.test.js`: separate paid final outcomes, default active
  isolation, service-date boundaries, absent sessions and unpaid exclusion.
- `tests/staff-orders-e2e/employee-presentation.spec.js`: filter/refresh behavior,
  both-theme axe checks, cancellation hold, 320px detail reflow, screenshots and
  authenticated navigation/filtering without JavaScript. Synthetic session state
  stays in memory; sign-in itself requires JavaScript by existing design.
- `docs/staff-orders-design.md`: current filter contract and file guide.

## Focused verification

Environment: Windows x64, Node 24.19.0, locked Playwright 1.64.1.
Disposable SQLite fixture and local self-signed HTTPS only; no real customer or
payment data and no changes to trusted certificates or staff security policy.

Domain/HTTPS command (OpenSSL must be on PATH):

```sh
node --test tests/unit/staff-orders.test.js tests/unit/staff-orders-http.test.js
```

Seven checks passed, covering authorization, origin/TLS restrictions, escaped
customer names, contact minimization, paid-only filtering and final states.

Browser command:

```sh
node node_modules/@playwright/test/cli.js test -c playwright.staff-orders.config.js tests/staff-orders-e2e/employee-presentation.spec.js --project=chromium-desktop --project=chromium-mobile --project=firefox-desktop --project=firefox-mobile
```

Final browser run: **8 passed** across Chromium/Firefox, desktop/mobile, in 1.4
minutes. Queue axe checks passed in both themes and detail reflow passed at 320px.
Reviewed local dark desktop and light mobile captures show readable notices and
wrapping; this spot review does not replace the checkpoint's full visual review.
Screenshots remain under ignored `test-results/staff-orders/` output directories.
`git diff --check` passed. Earlier test development
caught missing final timestamps in a synthetic fixture, an incorrect assumption
that secure sign-in works without JavaScript, and contrast sampling during theme
transitions. The tests now create valid final timestamps, authenticate before
disabling JavaScript, and wait for real animations to finish before axe checks.
No accessibility rules or contrast thresholds were disabled.

## Remaining acceptance

This is implementation evidence, not full FE-04 acceptance. TEST-03 must review
the integrated preparation, availability and exception flows, changed native
visual baselines and Lighthouse audits. Existing shared queue/detail references
will need reviewed updates because filter options and review notices changed;
they were not bulk regenerated. The approved private-page noindex SEO exception
remains separate from other Lighthouse requirements.

Manual keyboard/focus, zoom, contrast and representative screen-reader review
remain pending. Native macOS/Linux evidence and supported WebKit coverage remain
at the checkpoint; Windows WebKit staff authentication is an explicitly
unsupported diagnostic under the existing staff acceptance matrix. No new waiver
or cross-platform acceptance is claimed. Keep the card incomplete until its
applicable acceptance gates pass.
