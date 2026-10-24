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

The focused Windows/macOS/Linux workflow verifies the final commit and supported
WebKit on macOS/Linux. No Windows WebKit/Safari support claim is made.
Visual reference review, grouped human keyboard/screen-reader/zoom checks,
production-host migration/deployment, customer-account hosted acceptance and final
mobile/desktop Lighthouse remain pending. Broader end-user branding/menu cleanup
will affect shared navigation and references; TEST-04 retains final acceptance
after all current-delivery work. Ready for Testing is not Done.

No full-number input, real payment, external customer message, new dependency,
live customer account or public deployment was introduced in this increment.
No screenshot/report is attached to the user update. Sanitized reproducible
results remain in development/CI evidence; no credentials are committed.
