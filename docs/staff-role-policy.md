# Owner, Admin and Employee account policy

Approved October 22, 2026 under TECH-04. This supersedes earlier two-tier policy,
single-admin delivery restrictions and statements that reactivation is out of scope.

| Permission | Employee | Admin / manager | Owner |
| --- | --- | --- | --- |
| Read orders, advance preparation, toggle ingredient availability | Yes | Yes | Yes |
| Decide cancellations, approve demo refunds, resolve operational holds, retry internal notifications | No | Yes | Yes |
| Edit menu/prices/special hours; read sales analytics | No | No | Yes |
| Invite, deactivate or reactivate employees | No | Yes | Yes |
| Invite/manage admins; change Employee/Admin role | No | No | Yes |

Owner and Admin require password plus authenticator MFA. Employee authentication
uses an individual password. Existing idle/absolute expiry, CSRF, pinned direct
HTTPS, password policy, throttling and recovery protections remain mandatory.

## Additive storage and compatibility

Migration 014 adds `staff_ownership`, a single immutable designation pointing to
an active administrative identity, and `staff_role_view`, which resolves the
effective `owner` role. The existing `staff_users.role` values remain `employee`
or `admin`; an owner is an MFA-protected admin identity with that designation.
This preserves all existing foreign keys, role/MFA storage guards and audit history
without rebuilding the staff table or editing migrations 001–013. Application
authorization uses the server-resolved effective role, never a browser role claim.

The migration grants nobody ownership automatically. Existing admins become
managers under the new policy and cannot edit business settings or read analytics
until the intended owner is explicitly designated. Fresh bootstrap through
`npm run admin:setup` creates the first **Owner**, with verified MFA and once-only
recovery codes; the command name is retained for existing setup instructions.

For an existing database with no owner, the authorized operator runs
`npm run owner:designate` in a private interactive terminal with `DATABASE_PATH`
and the separately provisioned `MFA_ENCRYPTION_KEY_HEX`. Confirm the intended
existing admin username, enter its password and a fresh authenticator code, and
confirm `DESIGNATE OWNER`. No credentials are accepted as command arguments.
The command refuses employees and repeat designation. It revokes existing sessions
and records an audit before the owner must sign in again. This local operation
must never be mounted as an HTTP endpoint. No real account was designated by tests.

Owner transfer, additional owners, self-demotion and owner deactivation are not
ordinary account controls. The single owner is protected in both storage and
services; existing private owner recovery retains the designation and requires
replacement MFA. A future ownership-transfer procedure needs a separate plan.

## Invitations, role changes and reactivation

- Admin invitation forms create employees only. Owner forms offer Employee or
  Admin. Server authorization and storage guards reject forged admin invitations.
  Managers cannot see or revoke admin invitations or manage another admin.
- Invitations remain single-use, privately handed off, digest-only and valid for
  24 hours. Recipient-chosen passwords follow existing policy. An admin invitation
  records a first-MFA requirement rather than issuing an administrative session.
- Owner promotion revokes all target sessions, pending login/recovery proofs and
  previous factor/recovery-code access. First-MFA setup is permitted only for an
  owner-approved promotion or admin invitation recorded in
  `staff_mfa_enrollments`; it requires the account password and the existing bounded
  recovery/enrollment controls. It cannot replace an established active factor.
  Coordinator requests explicitly record `purpose='first_mfa'`, distinct from
  `purpose='recovery'`; the legacy `method` field alone is not proof that a recovery
  code was supplied. Storage guards preserve the purpose and enrollment authority.
- The recipient opens `/staff/recovery`, selects **First administrator
  authenticator setup**, verifies the password, imports the private setup key,
  and confirms a current code. Only afterward can normal password-plus-MFA
  sign-in issue an admin session. Save the once-only recovery codes privately.
  Interrupted setup leaves access locked; restart first setup with the password.
- Demotion revokes sessions and factor/recovery-code access. Employees receive no
  administrative authority from a previous admin session or client-side controls.
- Deactivation revokes sessions. Reactivation enables fresh sign-in only; it never
  unrevokes a session or restores a pending proof. Admins may reactivate employees;
  the owner may reactivate employees/admins. Existing active admin MFA remains
  required; missing first enrollment is resumed through the restricted setup flow.
- `/auth/staff/update` accepts exactly `strUserId`, `strRevision`, `strField`
  (`role` or `state`) and `strValue`. All fields are strings at the HTTP boundary.
  The service validates revisions, target rights and current server permissions
  inside one synchronous transaction. Stale edits are denied and require refresh.
  The legacy `/auth/employees/deactivate` endpoint now also requires
  `strRevision`; it uses the same mutation boundary.
- Account changes and revocations commit with attributed audit records; audit
  failure rolls back changes. Issuer role/epoch changes invalidate pending
  invitations. No operation accepts caller-supplied actor identity or revives an
  old session, login challenge or recovery request.

## Implementation and acceptance

`src/auth/permissions.js` defines actions. `session-service.js` resolves the owner
designation. `staff-account-service.js`, `staff-enrollment-service.js` and
`recovery-service.js` implement target rights, invitations and restricted first
MFA setup. `auth-router.js` retains HTTPS/origin/CSRF protections. The account and
recovery EJS screens and `src/public/js/staff.js` expose the authorized controls.
Menu, analytics, notification and order services enforce the effective roles.
The Owner invitation form groups Employee/Admin radio choices under a semantic
legend, defaults to Employee and submits the selected `strRole` through the same
protected invitation boundary. Native radio choices avoid embedded Bootstrap
images and the style policy error from a native select reproduced in Windows WebKit;
keyboard arrows and browser console errors are checked alongside visual/axe review.

Tests use isolated synthetic identities, keys and databases. Relevant coverage is
in `tests/unit/staff-roles.test.js`, the existing auth/migration suites, and
`tests/staff-e2e/roles.spec.js`, with menu/analytics regressions in the staff-order
suite. Run checks using [cross-platform prerequisites](cross-platform.md).
Native visual references and manual accessibility acceptance remain explicit
quality gates; Windows results do not certify macOS/Linux or real Safari.

TECH-04 records the approved policy/design. BE-08/FE-08 cover application acceptance;
OPS covers private real setup, certificate/key custody and hosted access. Never
mark those tasks complete solely because the policy or migration exists.

BE-08/FE-08 application acceptance completed October 23 after the required native
matrix passed service, functional/accessibility and strict visual comparisons,
and the guided human review completed without an issue reported. See the linked
staff acceptance record for the exact source/run, approved exceptions and existing
OPS boundaries. This does not certify an actual hosted installation.

Native Windows WebKit reports `None` for the Strict session cookie and sends it
on a cross-site navigation; this is an enforcement failure, not an inspection-only
issue. On October 22 the human explicitly approved platform-appropriate coverage:
Windows Chromium/Firefox and macOS/Linux Chromium/Firefox/WebKit. Native Windows
WebKit remains an unsupported diagnostic path with both strict assertions intact
and its failure visible. Required platform paths must pass; no application cookie
or browser security policy is weakened. See [staff acceptance](staff-acceptance.md)
for reproduction, exact coverage, hosted outcomes and the human review checklist.
Keep private pages unindexed. The existing staff-page SEO exception does not
silently waive unrelated menu/analytics SEO or manual accessibility gates.
