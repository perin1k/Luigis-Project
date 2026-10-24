# OPS-03 authenticator QR checkpoint — October 24, 2026

Approved scope: pinned QRCode 1.5.4, local server generation/browser canvas,
first administrator enrollment and authenticator replacement, manual fallback,
private-display clearing and focused verification. No schema or MFA policy change.
Initial terminal Owner bootstrap remains unchanged.

Windows verification used Node 24.14.1/npm 11.11.0 and the existing locked browser
engines. QR unit, HTTPS auth-router and recovery-service checks passed (32 tests).
Focused first-enrollment/replacement/expiry/fallback checks passed in Chromium,
Firefox and WebKit desktop plus Chromium mobile. Final replacement checks passed
in all six desktop/mobile engine projects, including axe in both themes at 320px.
The synthetic narrow dark view was inspected internally; no operator secret was
used. These Windows engine checks are not native Safari or macOS/Linux evidence.

Initial sandbox OpenSSL loading failed; rerunning with the installed Git OpenSSL
runtime outside that restriction passed. An initial test incorrectly used a
visible-role locator after intentionally hiding the QR; the corrected test checks
the actual cleared canvas. No application protection or test assertion was waived.

Tests verify full URI-to-pattern mapping, invalid URI rejection, white quiet zone
and black finder pixels, hidden zero-size canvas, cleared manual key, actual MFA
confirmation/sign-in, protected no-store auth response, timer/page-exit clearing,
and usable manual fallback on unavailable QR rendering. Dependency install audit
passed; existing locked package versions were preserved. No external QR service,
secret-bearing image URL, CSP relaxation or secret browser storage is introduced.

Implementation/file guide: [authentication design](../authentication-design.md).
New QR tests join the existing native staff CI through `scripts/verify-staff.js`
and existing Playwright suites. Native CI/hosted checks and human phone scanning,
private credential replacement and final Owner sign-in must be recorded separately.
The previously exposed factor/recovery set remains unaccepted until replaced
privately; no exposed value is reproduced here. OPS-03 is not Done from this change.
