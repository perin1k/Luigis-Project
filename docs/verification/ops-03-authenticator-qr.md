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

Hosted update: release `7b627ef7116e9a3aaa2e46a2d11eb706c2256ae8` was staged with
the source archive checksum, locked production install, root-controlled manifest
and read-only retained-schema compatibility check (zero pending migrations).
The existing database and keys were not replaced or migrated. Actual Ubuntu QR
generation passed, then the service stopped, its release pointer switched atomically
and the unprivileged service restarted. Trusted HTTPS readiness passed after normal
startup retries. The previous compatible release was retained for rollback.
Public recovery returned 200/no-store with QR markup and current renderer; readiness
returned 200. Missing-proof recovery returned 403 without QR data. CSP remained
unchanged. The retained data mount remained rw/nosuid/nodev/noexec.

Automatic native staff [run 40079701553](https://github.com/perin1k/Luigis-Project/actions/runs/40079701553)
is still pending acceptance; storage run 40079701584 passed. Native jobs must be
reviewed separately rather than inferred from the local Windows engine passes.
Private phone scanning, factor replacement and Owner sign-in are still required.
