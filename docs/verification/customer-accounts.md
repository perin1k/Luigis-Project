# Customer accounts implementation checkpoint

October 24, 2026. [Source card](https://trello.com/c/1Z0lWQvP).
Brody approved the account/cleanup plan and separately confirmed profile retention,
password-confirmed deletion and existing order privacy deadlines. This implements
customer accounts; it does not deploy or migrate the public host.

## Behavior and review

Real username/password registration, sign-in/out, recovery-code reset, optional
contact profile, new-order ownership/history and account deletion are connected
to SQLite. Staff sessions/roles are separate; guest checkout stays available.
Native forms provide a no-JavaScript path. Recovery does not imply email delivery.
Existing guest orders cannot be claimed by contact matching or retrying them while
signed in. Read-time and background retention remove expired identifying links.
The [technical file guide](../customer-accounts-design.md) and
[end-user guide](../customer-account-help.md) explain boundaries and instructions.

The profile lasts until deletion or authorized project-data teardown. An ordinary
VM stop retains disks and does not itself execute data cleanup. Deletion revokes
all account sessions and removes profile/credentials/codes/account links, leaving
orders and their existing cancellation/refund/privacy rules intact.

## Verification recorded so far

- Windows x64, Node 24.22.1 / locked Playwright: full unit/service/storage regression
  passed **321 tests** after correcting the command's missing OpenSSL PATH.
  The first missing-tool run failed and is not accepted evidence.
- Final customer/schema/retention/storage focused run passed **25 tests** after
  tightening the new migration constraints. Added asynchronous recovery/deletion
  revision-race coverage and unknown-name verification: **7 account tests passed**.
- Chromium/Firefox desktop/mobile account journeys: **12 passed**, covering genuine
  registration, saved-profile checkout/persisted history, cross-account/staff
  isolation, recovery/revocation, password-confirmed deletion, CSRF/cookie checks,
  both themes, axe checks and 320px reflow. The subsequently added no-JavaScript
  scenario passed in Chromium desktop (one test); the final native workflow
  still requires its own recorded results below.
- Reproduced/fixed native POST Origin failure: no-referrer caused Origin null;
  account pages now use same-origin referrer policy while retaining exact HTTPS
  Origin/Host plus session-bound CSRF checks. No cross-origin bypass was added.
- A theme test initially audited during a Bootstrap color transition; it now uses
  actual labels and waits for the final computed control color. An attempted direct
  check on the clipped native radio also timed out; the user-visible label is the
  correct target. Initial failures are retained, not treated as passes.

## Remaining gates

Final native verification **passed** at
`749c1f0a6e32ebca28846ffe44d7463926b1664e` in
[40144515988](https://github.com/perin1k/Luigis-Project/actions/runs/40144515988):
Windows 2022 Chromium/Firefox desktop/mobile and macOS 15 / Ubuntu 24.04
Chromium/Firefox/WebKit desktop/mobile, including focused unit/storage/retention
and all four account browser scenarios. This verifies the final theme fix as well
as native forms without JavaScript. Required customer jobs all succeeded.
Storage workflow `40143966845` also passed at the implementation commit.

The first native run `40143966895` failed at browser launch because the workflow
installed browsers in the default cache while configuration expected the repository
cache. It is not a browser pass. The workflow now declares the same browser path
for installation and execution; a corrected run is required.

Corrected run `40144216041`: macOS/Linux Chromium/Firefox journeys passed (16
each), and WebKit functional journeys passed, but its axe checks caught theme
control contrast during color interpolation. The shared appearance buttons now
switch colors without that transition; strict axe checks are retained. A new
  native run above verifies the fix. Required Windows shared staff visual comparisons
in `40143966836` also differ after the intentional new header links; these are
unaccepted visual changes to review at the planned cleanup checkpoint, not green
results or permission for automatic baseline replacement.

The focused workflow verifies the recorded commit and supported WebKit on
macOS/Linux. No Windows WebKit/Safari support claim is made.
Visual reference review, grouped human keyboard/screen-reader/zoom checks,
production-host migration/deployment, customer-account hosted acceptance and final
mobile/desktop Lighthouse remain pending. These feature acceptance checks belong
to the linked QA-01/cleanup checkpoint before the customer card can move Done.
Broader end-user branding/menu cleanup
will affect shared navigation and references; TEST-04 retains final acceptance
after all current-delivery work. Ready for Testing is not Done.

No full-number input, real payment, external customer message, new dependency,
live customer account or public deployment was introduced in this increment.
No screenshot/report is attached to the user update. Sanitized reproducible
results remain in development/CI evidence; no credentials are committed.
