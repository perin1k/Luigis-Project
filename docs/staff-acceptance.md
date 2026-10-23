# Staff authentication acceptance

BE-08 and FE-08 retain their complete acceptance scope. The three-tier services
and screens are implemented; automated functional, native visual, human
accessibility and private operator verification are distinct gates.

## Accepted application features — October 23, 2026

BE-08/FE-08 application acceptance is complete under the explicitly approved
browser/platform matrix and existing private-page SEO exception. The final
[strict verification run](https://github.com/perin1k/Luigis-Project/actions/runs/39903130899)
tested commit `4f5974c872bcf1bc4125701c9cc52de3b378df9d` with Node 24.14.1 and
locked Playwright 1.64.1. All required jobs passed service/HTTPS, browser behavior,
automated accessibility and unchanged-reference native visual checks:

| Hosted target | Required engines, desktop and mobile | Outcome |
| --- | --- | --- |
| Windows Server 2022 | Chromium, Firefox | Passed |
| macOS 15 | Chromium, Firefox, WebKit | Passed |
| Ubuntu 24.04 | Chromium, Firefox, WebKit | Passed |

Native Windows WebKit's separately named diagnostic job still fails its Strict
cookie reporting/enforcement checks; its other functional checks pass. This is
the explicit unsupported-path limitation approved October 22, not a passing
browser result. No required job ignores failures. Strict cookie assertions and
application protections are unchanged, image updates are disabled and the final
run uploaded no artifacts. The completed guided human review and existing staff
audits are recorded below; neither is a blanket WCAG conformance certification.

The accepted features include individual Owner/Admin/Employee identities,
server-enforced authority, privileged MFA and first enrollment, private
bootstrap/designation/recovery procedures, invitations, password changes,
deactivation/reactivation, session revocation, error states and integrated staff
screens. Actual installation of real accounts/keys/certificates and public
hosting remain their existing OPS obligations under the role policy. They are
not newly created deferrals or marked complete by these feature results.

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
- `playwright.staff-native-ci.config.js` inherits the same tests, fixture and
  assertions, selects visual checks and uses separate `*-snapshots/ci/` native
  reference paths for the recorded hosted-runner images. It defaults to no image
  updates and has a seven-minute overall limit. Local developer references are
  preserved; hosted fonts are not assumed to match a developer's desktop.
- `.github/workflows/staff-verification.yml` runs the unit/HTTPS and functional
  browser checks on Ubuntu 24.04, Windows Server 2022 and macOS 15 with Node
  24.14.1, locked dependencies/browsers and read-only checkout permissions.
  Linux browser system prerequisites are installed only on the disposable hosted
  runner. Windows discovers OpenSSL from PATH or the installed Git directory.
  Installation and execution share the repository-local browser path explicitly;
  installing into the default user cache does not satisfy this configuration.
  There are no application secrets, deployment steps or artifact uploads.
  The approved temporary collection steps were removed after candidate review.
  Linux replaces only the slow Azure Ubuntu archive URL with Ubuntu's main HTTPS
  archive in the disposable runner's existing source files, including GitHub's
  indirect `mirror+file:/etc/apt/apt-mirrors.txt` URI. The selected public archive
  is logged. Repository suites,
  signing keys and package verification remain unchanged. This avoids the observed
  prerequisite-download timeout; it does not alter the developer's machine.
  The approved runner repair changes macOS 14 to macOS 15 to investigate the
  older runner's WebKit protocol failure without changing locked dependencies.
  The job has a 60-minute ceiling, with separate service (8-minute), Linux
  installation (30-minute), other installation (15-minute) and browser
  (17-minute) step limits, plus an eight-minute native visual step. Browser
  functional tests retain their 15-minute global timeout.
  Installation time no longer consumes most of a 30-minute overall allowance.
  A newer macOS runner does not establish support for the failing macOS 14 path;
  no result is claimed until its run completes.

### Approved browser/platform matrix and temporary visual collection

On October 22 the human explicitly approved required Chromium/Firefox coverage
on Windows, and Chromium/Firefox/WebKit on macOS and Linux. Native Windows WebKit
remains a separately named diagnostic matrix job with its original strict checks
and visible failure; only that diagnostic job is allowed to fail. It is not Safari
and is not claimed as a supported passing browser path. Required jobs cannot
ignore cookie, authorization, accessibility or functional failures. The unfiltered
local staff command still exposes the Windows diagnostic failure.

The human also approved temporary internal collection of synthetic native visual
candidates. Collection runs used an explicit generation flag and a pinned upload
action with one-day retention, containing native staff PNGs only. No reports,
traces, logs or real data were uploaded. All required Windows/Linux/macOS scenes
were inspected in both themes and desktop/mobile, with no layout issue found.
The reviewed references are isolated in `*-snapshots/ci/`; local developer
references are preserved. Temporary generation/upload steps and their flag have
been removed. The final workflow compares those references with explicit
`--update-snapshots=none`; generation is never counted as a comparison pass.

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

`tests/helpers/cookie-flags.js` reconstructs `Set-Cookie` rows before extracting
flags: macOS WebKit can fragment an `Expires` date at its comma. Splitting only
at a subsequent cookie name/value boundary preserves the rest of that date and
its flags without borrowing flags from another cookie. Regression tests in
`tests/unit/cookie-flags.test.js` reproduce fragmentation, combined/intact rows,
missing cookies and flag isolation. The expected header flags and actual
cross-site cookie-presence assertions are unchanged. The helper returns flags,
never the opaque session value, for assertion output.

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

## Acceptance checkpoints and release boundaries

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

Historical hosted comparison at commit `d9d27253b43d973cd74b44a457d46404eb404441`:
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

Later candidate runs supersede those browser limitations where verified:
[Windows/Linux collection](https://github.com/perin1k/Luigis-Project/actions/runs/39881614839)
passed required browser checks on those OSes; the initial macOS header parser
failed before the behavior probe. After the test-only parser repair,
[Windows/macOS collection](https://github.com/perin1k/Luigis-Project/actions/runs/39882719419)
passed their required browser checks, including actual macOS WebKit cross-site
cookie enforcement. Linux's latter attempt timed out downloading prerequisites
from the Azure mirror, before browser execution. Its earlier browser evidence is
retained separately; a final common-commit strict comparison is still required.

Reviewed hosted references passed the final no-update comparison linked above.
The direct/indirect source selection repair also passed its final Linux job;
comment-only legacy source files do not interrupt selection, while no active
archive causes an explicit setup failure. Existing private staff noindex SEO approval is
retained; it is not a blanket audit waiver. Local staff audits previously passed
Performance, Accessibility and Best Practices at 100, with SEO 60 under that
explicit exception. This increment changes no application templates or assets.
Actual Owner bootstrap/designation, key custody, valid hosted TLS and operator
recovery require their existing private procedures and real operator evidence.
These are existing OPS installation obligations under the role policy, distinct
from BE-08/FE-08 application feature acceptance. Passing synthetic fixtures does
not certify those tasks or public deployment, and none is marked complete here.
