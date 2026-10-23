# BE-08 / FE-08 staff integration verification

Historical October 21 integration checkpoint. Current three-tier implementation,
human review, approved browser/platform matrix and acceptance outcomes are tracked
in [staff acceptance](../staff-acceptance.md). The milestone status and limitations
below describe that earlier checkpoint; do not use them as current card status.

Status: implemented increment, **acceptance incomplete**. Perin approved the
file-level staff UI/runtime integration plan and commit/push/Trello synchronization.
On October 21, 2026, Perin separately approved retaining noindex and an SEO-gate
exception for the four private staff pages. No other quality gate was waived.

Story references: [BE-08](https://trello.com/c/JWv5cz7J),
[FE-08](https://trello.com/c/ZqKu1n46).

## Verified passes

| Check | Evidence |
| --- | --- |
| Unit/HTTPS integration | `npm run test:unit`: 155 passed, zero failed. Includes mounted views, safe session redirects, host rejection, virtual CSS delivery, invalid composition and startup without HTTP downgrade. |
| Staff functional/accessibility/visual | Final main run: 36 passed in Chromium/WebKit, each mobile and desktop. Separate added-boundary run: four passed for 320px reflow, actual logout and employee permission denial using browser cookies. |
| Visual comparison | 32 new macOS baselines: four pages × two themes × four browser/viewport profiles. Initial images were inspected before creation; a separate no-update visual run passed 16 cases, followed by the final main run with no updates. Existing Windows/customer baselines were preserved. |
| Automated accessibility | axe WCAG 2 A/AA, 2.1 AA and 2.2 AA rules passed across the tested pages, both themes and narrow layouts. This is not a conformance claim. |
| Focus/permissions | Pending MFA cannot obtain a session; employees cannot issue invitations even with genuine browser cookies and CSRF. Password changes force sign-in. Pagination restores heading focus, announces updated counts and removes stale controls after authorization loss. |
| Source review | Focused diff, naming, template escaping, secret exclusion and `git diff --check` reviewed. No dependency or migration added. The final access-error review also verified a persistent sign-in link and cleared private code panels; focused validation/pagination checks passed again after that fix. |

Functional journeys include employee password change/new-password sign-in; admin
MFA; one-use invitation acceptance; invitation revocation; employee deactivation;
recovery-code replacement; lost-factor recovery and replacement-factor sign-in;
wrong passwords; interrupted network requests; idle expiry; paginated lists; and
logout. Synthetic keys/accounts are isolated in memory. Traces/video are disabled
for secret-bearing staff flows, and screenshots show blank forms/non-secret lists.

## Lighthouse

Lighthouse 13.5.0, default mobile simulated throttling, default screen emulation,
production `NODE_ENV`, loopback HTTPS on `https://localhost:3443`. Node 24.14.1,
Playwright 1.64.1, macOS 27.0.1 arm64; Chromium 156.0.8078.4 and WebKit 27.2.
Self-signed certificate handling is confined to the synthetic fixture; trusted
production TLS/certificate deployment has not been verified.

| URL path | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| `/staff/sign-in` | 100 | 100 | 100 | 60 (approved noindex exception) |
| `/staff/enroll` | 100 | 100 | 100 | 60 (approved noindex exception) |
| `/staff/recovery` | 100 | 100 | 100 | 60 (approved noindex exception) |
| `/staff/account` | 100 | 100 | 100 | 60 (approved noindex exception) |

Actual sanitized category/audit outcomes are retained in
[be-08-lighthouse.json](be-08-lighthouse.json). Scores of 100 still have optimization
advisories; these are retained rather than hidden. Initial performance was 99.
Combining the unchanged staff styles and supplying server-authorized initial list
data removed redundant requests and achieved 100 without weakening audit settings
or removing account functionality.

Reproduce with a disposable fixture in one terminal:

```sh
NODE_ENV=production node tests/fixtures/staff-server.js
```

Then, in another terminal:

```sh
node tests/audit-staff.js
```

The audit script verifies the synthetic fixture marker and saves only sanitized
summaries under ignored `reports/`; it must never target actual staff accounts.
Stop the fixture before Playwright starts its own instance.

## Unresolved checks and limitations

- Firefox 157.0 runtime failed before navigation with `Could not find profile
  folder`, including fresh temporary and workspace profile attempts. Application
  behavior and visuals in Firefox are **not verified**; no Firefox baseline was
  accepted and no browser security protection was disabled to bypass this.
- Manual representative screen-reader, browser zoom and complete keyboard review
  are **not performed**. Automated focus/reflow checks and screenshot inspection
  do not replace those gates. Accessible authentication needs that human review.
- Customer regression: 26 of 28 selected ordering/theme checks passed. Two WebKit
  Tab-focus assertions failed on both mobile/desktop. Both reproduce against the
  unchanged pre-integration `HEAD` application, establishing they were not
  introduced here. An initial concurrent artifact-folder collision was corrected
  with separate output directories before this rerun; it is not counted as a pass.
- Real certificates, MFA-key custody, actual team bootstrap/recovery and public
  deployment were not performed. The configured runtime is implemented; these
  operational steps remain separately reviewed/operator-owned.
- No employee reactivation or additional-admin authority was introduced.

The cards must stay incomplete until the outstanding mandatory acceptance checks
pass or the human explicitly revises those requirements.

## Reproduction commands

```sh
npm run test:unit
npx playwright test -c playwright.staff.config.js
```

The second command includes all three engines and currently exposes the Firefox
startup blocker on this machine. The verified local engine subset is:

```sh
npx playwright test -c playwright.staff.config.js --project=chromium-desktop --project=chromium-mobile --project=webkit-desktop --project=webkit-mobile
```

Configuration disables baseline updates by default. Review actual screenshots
before explicitly creating any new platform-specific baseline. `test-results/staff`
is separate from other suites; do not run suites that recursively clear an ancestor
output directory concurrently.
