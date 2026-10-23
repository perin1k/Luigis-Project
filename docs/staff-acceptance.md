# Staff authentication acceptance

BE-08 and FE-08 retain their complete acceptance scope. The three-tier services
and screens are implemented; automated functional, native visual, human
accessibility and private operator verification are distinct gates.

## Reusable automated checks

- `npm run test:staff:unit` runs the explicit auth/session/password/MFA/login,
  bootstrap, invitation, maintenance, recovery and role suites using disposable
  records. `scripts/verify-staff.js` propagates failures and records OS/runtime.
- `npm run test:staff:functional` uses `playwright.staff-ci.config.js`. It inherits
  the six Chromium/Firefox/WebKit desktop/mobile projects and strict assertions,
  but selects functional tests rather than tests named `visual`. It produces
  console results without uploading reports, screenshots, traces or videos.
- `npx playwright test -c playwright.staff.config.js` remains the full functional
  and strict native visual suite. The functional CI command does not replace it,
  create baselines or waive missing/stale native references.
- `.github/workflows/staff-verification.yml` runs the unit/HTTPS and functional
  browser checks on Ubuntu 24.04, Windows Server 2022 and macOS 15 with Node
  24.14.1, locked dependencies/browsers and read-only checkout permissions.
  Linux browser system prerequisites are installed only on the disposable hosted
  runner. Windows discovers OpenSSL from PATH or the installed Git directory.
  Installation and execution share the repository-local browser path explicitly;
  installing into the default user cache does not satisfy this configuration.
  There are no application secrets, deployment steps or uploaded artifacts.
  The approved runner repair changes macOS 14 to macOS 15 to investigate the
  older runner's WebKit protocol failure without changing locked dependencies.
  The job has a 60-minute ceiling, with separate service (8-minute), Linux
  installation (30-minute), other installation (15-minute) and browser
  (17-minute) step limits. Browser tests retain their 15-minute global timeout.
  Installation time no longer consumes most of a 30-minute overall allowance.
  A newer macOS runner does not establish support for the failing macOS 14 path;
  no result is claimed until its run completes.

## Cookie enforcement investigation

The existing browser-cookie assertion still requires `SameSite=Strict`. The
server's Secure/HttpOnly/Path/SameSite flags are additionally verified without
printing cookie values. `tests/staff-e2e/cookie-policy.spec.js` signs in a real
synthetic employee and checks cookies actually received by the test HTTPS server.

Same-site navigation must send the session and a synthetic `SameSite=None`
positive control. A link from `https://127.0.0.1:3443` to
`https://localhost:3443` is a cross-site top-level navigation: the Strict session
must be absent while the None control is present. This distinguishes enforcement
from an inspection-only metadata discrepancy or complete cookie blocking.
The test fixture returns presence booleans only and is never mounted by the app.

Local Windows Chromium/Firefox pass this behavior check. Local Windows WebKit
fails it: the session is sent cross-site despite the Strict header. Consequently,
the previous description of a possible inspection-only discrepancy is insufficient.
Keep both strict checks failing until the affected platform behavior is resolved
or the human explicitly approves a different acceptance requirement. Do not
disable browser security, remove SameSite, suppress the failure or claim a server
flag can force a browser to enforce its cookie policy. Compare hosted results
before attributing the problem to application code or all WebKit platforms.

The locked Playwright 1.64.1 upstream
[cookie tests](https://github.com/microsoft/playwright/blob/v1.64.1/tests/library/browsercontext-cookies.spec.ts#L110)
mark native Windows WebKit Strict/Lax cookie reporting as expected failures
(separately from the `webkit-wsl` channel). This corroborates a known platform
limitation; it does not turn this application's enforcement failure into a pass.
No WSL installation, browser upgrade or acceptance-matrix change is authorized
by documenting that upstream distinction.

## Human accessibility review

Use `node tests/fixtures/staff-server.js` with OpenSSL on PATH. This fixture is
local HTTPS with a disposable self-signed certificate, synthetic credentials and
in-memory data. Do not install its certificate as a trusted system root or use
real staff/customer data. Stop it before an automated suite needs the same port.

The fixture's Employee/Admin/Owner usernames are `employee`, `admin`, `owner`;
their synthetic password is the value of `PASSWORD` in `tests/fixtures/staff-app.js`.
These are test identities, never default application accounts. The fixture-only
`/__test/code` helper supplies an Admin code; `?secret=owner` supplies an Owner
code. Avoid resetting the fixture while another person is reviewing it.

Record actual reviewer, browser/screen-reader versions, checks performed and any
failures privately; never fabricate human review from axe or screenshots.

1. Sign-in: navigate with Tab/Shift+Tab; confirm landmarks/headings, username and
   password labels, visible focus, password paste and a clearly announced error
   after incorrect details. Correct sign-in must reach account controls.
2. Privileged access: confirm the MFA prompt and instructions are announced,
   codes can be pasted, and Owner/Admin cannot bypass MFA. Confirm role and
   recovery-code fields have clear accessible names without accidental public
   announcements of private values.
3. Account management: check radio-group legend and arrow-key selection, role
   restrictions, invitation handoff, deactivate/reactivate confirmations,
   pagination/focus restoration and success/error announcements.
4. Enrollment/recovery: verify input instructions, error association, setup-key
   and once-only-code labels, keyboard access and focus when panels appear/hide.
   Verify hiding private material removes its value as well as its visibility.
5. Zoom/reflow: check 200% and 400% browser zoom with light/dark themes. Controls,
   messages and focus must remain usable without clipped content or keyboard
   traps. Use actual browser zoom, not only a resized viewport.

## Remaining release boundaries

### Reviewed status — October 22, 2026

The human collaborator completed the guided local Chrome/Windows screen-reader
(Narrator) review with no issue reported: sign-in labels/errors/focus, Employee
sign-in, 200%/400% zoom in both themes, Owner MFA, role radio keys, account
deactivation/reactivation, invitation token display/hiding, enrollment, recovery
display/hiding and account pagination. Pagination and account actions were
explicitly confirmed passing; recovery completion was reported as done without
an issue. Exact browser/screen-reader versions were not supplied. These are human
observations on the disposable fixture, not a full WCAG conformance claim or
evidence for another OS/browser. No private token, code or password was collected.

Hosted comparison at commit `d9d27253b43d973cd74b44a457d46404eb404441`:
[staff verification run](https://github.com/perin1k/Luigis-Project/actions/runs/39878530147).
Service/HTTPS checks passed on all three runners. Windows browser checks failed
only the native WebKit Strict-cookie metadata and actual cross-site enforcement
checks. macOS 14 Chromium/Firefox checks passed, but WebKit failed before page
creation with `Page.overrideSetting: Unknown setting: PushAPIEnabled`; the suite
then reached its global timeout with remaining tests unrun. That is a browser
toolchain failure, not a passing WebKit comparison or an application-page result.
Linux is still installing browser/system prerequisites at this recorded checkpoint;
its browser behavior is unverified. Retain these limitations until a subsequent
verified run supersedes them. No strict assertion or dependency was changed.

Native visual comparisons still require reviewed OS-specific references. Existing
private staff noindex SEO approval is retained; it is not a blanket audit waiver.
Actual Owner bootstrap/designation, key custody, valid hosted TLS and operator
recovery require their existing private procedures and real operator evidence.
Passing synthetic fixtures does not certify those tasks or public deployment.
