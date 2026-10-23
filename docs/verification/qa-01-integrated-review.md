# QA-01 integrated release review

October 23, 2026. [QA-01](https://trello.com/c/EB8UO8lI) is In Progress,
not accepted. This record adds local integrated evidence after the focused
body-parser patch; it does not replace the original release criteria.

## Scope and provenance

Test baseline: `4c20e0b3800d6b2dbe2a9b08262f758274b02625`, including the
body-parser 2.4.0 lockfile patch `618e177`. macOS arm64, Node 24.14.1,
npm 11.11.0, locked Playwright 1.64.1. Reuse the team's existing
[INT-01](int-01-customer-journey.md) and [INT-02](int-02-shared-records.md)
scenarios and isolated real-service/SQLite fixtures. Their implementation and
earlier Windows evidence belong to the original contributors.

The first local attempt could not launch Chromium because the pinned browser
binaries were absent after `npm ci`. Six desktop executions failed at launch,
one mobile execution was interrupted and 17 customer executions did not run.
A single-case diagnostic confirmed the missing executable. These are environment
failures, not application passes or demonstrated application defects. Restore
only the pinned Chromium/WebKit binaries through the locked Playwright installer;
do not change application code, dependencies, snapshots or browser assertions.

Reproduction commands:

```sh
node node_modules/@playwright/test/cli.js test -c playwright.payments.config.js tests/payments-e2e/customer-journey.spec.js --project=chromium-desktop --project=chromium-mobile --project=webkit-desktop --project=webkit-mobile
node node_modules/@playwright/test/cli.js test -c playwright.staff-orders.config.js tests/staff-orders-e2e/shared-records.spec.js --project=chromium-desktop --project=chromium-mobile --project=webkit-desktop --project=webkit-mobile
```

The customer fixture uses loopback HTTP and the staff fixture isolated self-signed
HTTPS. Browser certificate-error suppression is confined to these existing test
fixtures; it does not approve warning bypass or invalid certificates on a host.
No working database, real contact, charge, external message or staff identity is used.

## Post-restoration outcomes

Pinned Chromium 156.0.8078.4 (revision 1248) and WebKit 27.2 (revision 2370)
were restored successfully. Customer journeys passed **24/24** executions in
1.2 minutes across desktop/mobile for both engines. All six existing scenarios
ran in each project; no snapshots or test expectations changed. Local log:
`/private/tmp/luigis-qa01-customer.log`. These functional checks do not add a
new visual or Lighthouse acceptance claim.

Shared-record journeys passed **16/16** executions in 1.3 minutes across the
same four projects, with zero failed or skipped tests. Local log:
`/private/tmp/luigis-qa01-shared.log`. The four scenarios verify genuine customer
purchase through preparation/tracking/refund/reporting, current Owner edits versus
immutable purchased prices, session revocation, concurrent progress conflicts and
failed-refresh recovery. Combined final result: **40 successful executions** of
ten existing scenarios across four projects. Both suite processes exited zero.
No application change was required. Earlier launch failures remain documented;
restoring the pinned browser files resolved the environment blocker.

### Firefox follow-up

On the same application baseline (documentation HEAD `93bc2d4`), the pinned
Firefox 157.0 / revision 1555 downloaded successfully. A single Chromium-equivalent
carry-out journey was selected with `--project=firefox-desktop --grep
'carry-out committed' --max-failures=1`. Firefox exited before page creation with
`Could not find profile folder` (process exit 1). One diagnostic rerun with
`TMPDIR=/private/tmp` produced the same launch failure. Both test processes exited
1; neither exercised application behavior. Logs:
`/private/tmp/luigis-qa01-firefox-probe.log` and
`/private/tmp/luigis-qa01-firefox-temp-probe.log`.

Do not retry the full matrix against this known launch blocker or report a
Firefox pass. No browser sandbox, certificate policy, test assertion, dependency
or persistent OS setting was changed. Current patched integration scenarios still
need native Firefox verification on a working runner, alongside the retained
Windows/Linux and final acceptance gates. Earlier teammate native Firefox passes
remain valid for their documented commits/scopes; they do not prove this rerun.

## Release criteria retained

### Privacy Lighthouse and approved indexing exception

On October 23 the existing teammate-authored `tests/audit-privacy.js` ran
unchanged against the disposable production-mode HTTPS staff-orders fixture,
using a genuine synthetic Admin password/MFA session. Baseline `a10d131`,
macOS arm64 / Node 24.14.1, locked Chromium and Lighthouse 13.5.0. Default mobile
simulated throttling, 412×823 emulation, 4× CPU slowdown; complete configuration
and advisories are in [the sanitized report](qa-01-privacy-lighthouse.json).

Scores: Performance **100**, Accessibility **100**, Best Practices **100**,
SEO **60**. The human explicitly approved an **SEO-only exception** for
`/staff/privacy/:reference`, retaining noindex. No other category, page or
security control is waived. The indexing block remains in place; no application
or audit configuration was changed to obtain passing required scores.
The additional agentic-browsing category reported 100 but is not a project gate.

Reproduce by starting `NODE_ENV=production node tests/fixtures/staff-orders-server.js`
in an isolated verification checkout, then running `node tests/audit-privacy.js`;
stop only that fixture afterward. The fixture creates/removes its own temporary
database/certificate and synthetic accounts. The audit keeps session cookies in
memory; its report normalizes the reference and contains no contact data or
credentials. Local log: `/private/tmp/luigis-qa01-privacy-original-audit.log`.

An initial redundant script edit was reverted completely before this recorded
run after identifying the existing audit. No audit-script change is delivered.
The retained report comes from the original script. This is local self-signed
fixture evidence, not trusted-host verification, manual accessibility review,
native visual-reference acceptance or a claim of WCAG conformance. Earlier
remaining-audit statements are historical; the local privacy audit is now recorded,
while actual public HTTPS and final release gates remain open.

### Privacy behavior follow-up

At documentation HEAD `4da3655` (unchanged application baseline), the existing
privacy suite passed **12/12** executions in 40.4 seconds across Chromium/WebKit,
desktop/mobile. Command:

```sh
node node_modules/@playwright/test/cli.js test -c playwright.security.config.js --grep-invert 'privacy visual' --project=chromium-desktop --project=chromium-mobile --project=webkit-desktop --project=webkit-mobile --max-failures=1
```

The three original team-authored scenarios exercise reviewed contact correction
and a restricted copy, Employee denial and session-expiry clearing (including late
responses), and an interrupted correction whose committed result is verified on
reload. Process exit zero; no failures or skips among these selected cases.
Local log: `/private/tmp/luigis-qa01-privacy.log`. No test/application code changed.
The two visual/axe scenarios were deliberately outside this behavioral run;
their missing native-reference/manual/audit acceptance is not claimed passed or
waived. Existing SEC ownership and implementation remain unchanged. Together with
the integrated journeys above, this adds 12 successful executions to the earlier
40; it does not establish full release acceptance.

| Criterion | Evidence / remaining boundary |
| --- | --- |
| Connected customer confirmation, retries and private tracking | INT-01 scenarios exercise both service types, current menu changes, unavailable ingredients, ambiguous payment recovery and original submission retries. |
| Shared staff/customer data and permissions | INT-02 exercises Employee progress to guest tracking, Admin cancellation/refund, Owner reporting/menu changes, session deactivation and concurrent revision conflicts. |
| Financial/privacy/security | [QA-02](qa-02-payment-privacy.md), [SEC acceptance](sec-acceptance.md), [security review](../security-review-evidence.md); local passes are not host custody or final human acceptance. |
| Concurrency/recovery/performance | [QA-03](qa-03-concurrency-recovery.md); actual host load and ten-minute restart target remain unmeasured. |
| Native/browser/manual/visual coverage | Accepted TEST-01–03 evidence is reusable after impact review. These focused scenarios do not update screenshot baselines or establish a fresh Firefox/Windows/Linux/full-matrix acceptance. New privacy-page/manual and applicable final review remain explicit SEC/QA gates. |
| Lighthouse | Real trusted public HTTPS `/order` still needs required 100 scores. Retain approved SEO-only noindex exceptions for private pages; no other category is waived. |
| Operations and handoff | OPS-01–07 real target configuration/lifecycle/deployment plus DOC-01 independent receiving-person rehearsal and acceptance remain unfinished. Hosting is on hold. [Handoff entry point](../handoff.md). |

No card may move to Done on this local record alone. A receiving human must
accept actual scope and commit, and required hosting/quality evidence must exist.
