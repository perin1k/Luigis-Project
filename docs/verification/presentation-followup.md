# Presentation follow-up — October 27, 2026

Story: [Presentation follow-up](https://trello.com/c/iOKbeoWq).
Brody approved this narrow update after receiving permission to change the live
site before the October 28 class presentation. This is newer than the original
submitted release; it does not rewrite the October 25 TEST-04 evidence.

## Result and scope

Application commit: `c8f657c0c055530836a2c8762e5346c05c8a4ec2`.
Owner account landing navigation exposes Order queue, Menu management and
Sales & analytics as buttons. Admin landing navigation exposes queue and read-only
sales; Employee gets queue. Existing operational ingredient-availability permissions
remain intact. Admin report reads require valid MFA-protected sessions; Employees
remain excluded. Prices, special hours and role management stay Owner-only.

Staff password and MFA sign-in budgets are each 30 per account and 120 per trusted
source per 15 minutes, including successful attempts. Four bounded source counters
share the same window start, preserving migration 008's maximum of 30 per row.
No applied migration was changed. Two-hash concurrency, MFA replay/source checks,
recovery/enrollment/password-change limits and 30-minute idle/eight-hour absolute
expiry remain unchanged. A generic sign-in error is not definitive proof of a
lockout, and the larger budget is still finite.

## Verification

- 65 focused Windows Node 24.22.1 unit/HTTPS checks passed for login boundaries,
  permissions, sessions, HTTP routes and real sales aggregates. Five verifier
  policy/summary checks passed, including noninteractive credential refusal.
- 12 local Chromium/Firefox desktop/mobile role-dashboard checks passed, including
  both themes, axe WCAG tags, keyboard navigation and 320px reflow. Integrated
  Owner/Admin dashboard images were reviewed internally using synthetic data.
- Native focused run [40633538859](https://github.com/perin1k/Luigis-Project/actions/runs/40633538859)
  passed all six Windows/macOS/Linux staff and operations jobs. The integrated
  role-dashboard cases run in Windows Chromium/Firefox and macOS/Linux
  Chromium/Firefox/WebKit, mobile and desktop. These establish engine/OS coverage,
  not a separately tested real Safari installation.
- All 64 collected native authentication-only fixture images exactly matched
  existing SHA-256 values. That fixture omits ordering services and therefore its
  dashboard navigation; it is not falsely presented as visual evidence of the new
  integrated buttons. Existing reference images were not replaced.
- Automatic staff run [40633510287](https://github.com/perin1k/Luigis-Project/actions/runs/40633510287)
  passed all three required OS jobs, including service/functional checks and strict
  native references. The pre-existing unsupported Windows WebKit diagnostic failed;
  its cookie protections/assertions remain unchanged and it is not counted as a pass.
- Storage run [40633510293](https://github.com/perin1k/Luigis-Project/actions/runs/40633510293)
  passed. The shared-role verifier was updated for Admin reporting and rehearsed
  locally for both the successful journey and intentional interruption/cleanup.
- Brody confirmed actual hosted Owner and Admin sign-in, dashboard navigation,
  menu entry and sales report access. No private credentials were collected in chat.
- A new read-only `scripts/verify-hosted-dashboard.js` checks only mobile/desktop
  Owner dashboard Lighthouse through trusted HTTPS, using hidden local credential
  prompts, native in-memory cookies and an explicitly cold cache for each profile.
  It creates no accounts/orders and signs its own session out. Brody completed the
  private run and reported final `bPassed: true`. That result requires both profiles
  to reach the signed-in dashboard, retain noindex, score 100 in Performance,
  Accessibility and Best Practices, and sign out successfully. No raw report or
  individual SEO scores were requested or invented. The established private-page
  noindex SEO exception remains. Unchanged pages reuse their prior accepted audits.

Unchanged public assets/pages, checkout, privacy, reporting calculations and other
screens reuse accepted prior evidence after impact review. The entire TEST-04 suite
was not rerun for this presentation increment; no new perfection/commercial-readiness
claim is made.

## Hosted switch and preservation

Prepared using the existing reviewed `deploy/maintain-host.sh`, locked production
dependencies and canonical migration bytes. Prepared archive SHA-256:
`0d97b12e0464726b0a316b23e8d02d1a501887dfbac7ea478b318a365afbe46e`.
Preparation found zero pending migrations and zero production dependency advisories.
The switch retained the prior `da2a2bdbe3ef0beb06f0e96dd0e07d64ef60140a`
release as the compatible fallback. Brief startup 502 responses were retried until
trusted HTTPS readiness returned `ready`.

Before/after hashes of every application database table, private runtime/proxy
settings and private presentation-access file matched. The current 20 orders and
6 staff accounts, including teammate/user additions since the seed, were preserved.
No reset, fixture endpoints, role bypass, new cloud service or secret replacement
was deployed. Normal later sign-ins/worker activity may update records as designed.
This update is on `dev`; the original submitted `main` was not silently merged.
