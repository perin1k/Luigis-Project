# INT-02 focused hosted acceptance

Approved October 24, 2026. John retains application implementation ownership;
Perin retains QA. This acceptance assists the remaining hosted criterion on
[INT-02](https://trello.com/c/yGIbpR63), reusing the accepted
[shared-record scenarios](int-02-shared-records.md) and pre-OPS checkpoint.

## File responsibilities

- `scripts/verify-hosted-int02.js`: private interactive terminal entry point,
  pinned to the approved public HTTPS origin. Credentials are hidden, remain in
  process/browser memory and are never arguments, environment variables or files.
  Debug settings and noninteractive invocation are rejected. No browser recordings,
  screenshots, tracing or persistent profile are created.
- `scripts/hosted-int02.js`: four isolated browser sessions using genuine
  invitation/enrollment/MFA, customer checkout and staff routes. One clearly named
  synthetic order advances through Preparing/Baking/Ready, then Admin cancellation
  and full demonstration refund. Owner analytics is read; prices are never changed.
  The verifier does not call fixture endpoints or edit the database. Temporary
  Admin authenticator/recovery values stay in memory and are discarded.
- `scripts/hosted-int02-policy.js`: exact-run cleanup scope, HTTPS target restriction
  and a fixed-field sanitized result. Existing accounts are never cleanup targets.
- `tests/unit/hosted-int02-policy.test.js`: denied targets, unrelated account
  preservation, unexpected-role refusal, sanitized output and noninteractive refusal.
- `tests/operations/hosted-int02-rehearsal.js`: disposable HTTPS/in-memory success
  and interrupted-run cleanup checks; original synthetic staff remain active.
- `.github/workflows/hosted-int02-verification.yml`: focused Chromium rehearsal on
  Windows/macOS/Linux, with no live credentials or live host operations. Existing
  accepted browser-engine/visual evidence remains separate.

## Private operator procedure

Use Node 24.22.1, the lockfile installation and installed Playwright Chromium.
From the repository root in a private, unrecorded terminal run:

```sh
node scripts/verify-hosted-int02.js
```

Windows may require the full quoted Node executable path with PowerShell's `&`
operator. Enter the Owner username/password only at hidden prompts. Enter a fresh
authenticator code when prompted after password acceptance. This creates temporary
Employee/Admin accounts and one labeled **no-charge demonstration** order. Ordinary
teammate accounts, menu prices and existing orders are not edited. The order/audit
history is retained; temporary accounts are disabled and pending invitations revoked.

Keep the terminal/network open until cleanup finishes. Ctrl+C at a prompt requests
an orderly stop; forced termination or network loss can prevent cleanup. If a run
fails, review the static failure stage and the run identifier privately in Owner
tools. Resolve any labeled unfinished order and disable only that run's temporary
accounts before considering another run. The verifier never blindly repeats an
uncertain payment. A failed run is not acceptance.

Share only its final sanitized JSON summary or pass/fail with the reviewer—never
credentials, authenticator setup values, recovery codes or private tracking links.
The summary is operator-reported evidence, not a cryptographically attested report.

## Current results

Local Windows / Node 24.22.1: focused policy tests and disposable Chromium
success/interrupted-cleanup rehearsal passed. Native CI and actual hosted acceptance
remain pending. No live order or temporary live account has been created yet.
INT-02 stays In Progress until its remaining hosted evidence passes. Final hosted
Lighthouse and product QA remain on their original QA cards.
