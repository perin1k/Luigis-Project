# TECH-04 / BE-08 — Local staff authentication

Latest approved target: [TECH-04 consolidated authentication decisions](authentication-decisions.md).
The Owner/Admin/Employee rollout and its acceptance are distinct from the historical
implementation milestones below; verify the coordinated BE-08/FE-08 work before use.

## Current policy — October 22, 2026

Current acceptance commands, the cross-site cookie investigation and the human
review checklist are maintained in [staff acceptance](staff-acceptance.md).
Historical Firefox startup and two-role limitations below are not current scope.

The approved [three-tier account policy](staff-role-policy.md) supersedes earlier
two-role and no-reactivation boundaries below. Owner controls Employee/Admin
assignment and admin accounts; Admin manages employees only. Owner/Admin require
MFA. Reactivation is supported without restoring revoked sessions. Menu/prices/hours
and analytics are Owner-only. Migration 014 resolves ownership additively and does
not promote existing admins automatically; see the private designation procedure.

The mounted runtime/screens, enrollment, recovery and account lifecycle are
implemented. Earlier foundation-stage statements about unmounted routers and
missing UI below are historical, not the current backlog. Remaining BE-08/FE-08
acceptance and hosted operator setup must be tracked against current verification;
TECH-04 design completion alone does not certify those implementation gates.

## Original design and implementation history

Decision recorded October 21, 2026: the user approved individual local
usernames/passwords and authenticator-app MFA for admins, starting with the
password foundation. Scope is the synthetic, test-payment class demonstration.
This document does not approve live use, create an account, or assert security
or legal compliance.

## Approach and trade-offs

Local authentication fits the existing single-server SQLite demo without a
hosted identity account. The project takes responsibility for password protection,
factor enrollment, throttling, cookies, recovery and revocation. A hosted identity
provider is the alternative; it reduces locally implemented identity behavior
but adds external ownership/configuration and provider-specific integration.
Switching approaches requires a reviewed plan.

Approved existing policies remain: individual identities, mandatory admin MFA,
30-minute idle/eight-hour absolute sessions, admin-managed employee accounts,
and no implicit permission to create additional admins. Brody Mensonides is the
designated recovery owner. Customers remain guests; there is no customer login.

## Implemented password foundation

- `src/auth/password-service.js` exports asynchronous `hashPassword` and
  `verifyPassword`. Hashes use scrypt N=131072, r=8, p=1, 16 random salt bytes,
  a 64-byte derived key and a 256 MiB maximum-memory option. The work runs through
  Node's asynchronous crypto API, not a synchronous hash on the event loop.
- The versioned format is
  `scrypt-v1$131072$8$1$<32 lowercase hex salt characters>$<128 lowercase hex key characters>`.
  Verification accepts only this exact format/size. It does not execute arbitrary
  cost parameters parsed from untrusted stored text. Changing the policy requires
  a reviewed format/migration strategy, preserving access to existing credentials.
- Derived keys are compared with `timingSafeEqual`. Mutable password/key buffers
  are cleared in `finally`; JavaScript strings and internal crypto copies cannot
  be guaranteed erased. No password or hash is logged or returned in errors.
- The primitive accepts nonempty, well-formed Unicode up to 1024 UTF-8 bytes.
  It does not trim, normalize, truncate or otherwise transform the password.
  This size bound is not a complete password-strength/enrollment policy.
- Incorrect passwords, malformed hashes and invalid inputs return false from
  verification. Hash creation rejects invalid inputs. Crypto/system failures
  propagate and must deny sign-in, never fall back to plaintext or a weak hash.
- Migration 006 creates one `staff_credentials` row per staff identity with a
  unique lowercase ASCII username (3–64 characters; letters, digits, dot,
  underscore and hyphen), hash, canonical UTC timestamps and revision number.
  It does not populate the table or change existing identity subjects.
- Credential updates require the next revision and a nondecreasing change time.
  A changed password hash or username revokes existing sessions in the same
  transaction. Replacement/deletion is blocked; deactivate the staff account
  instead. Authorized credential services must additionally record audit events.
  A hash-shaped value is not proof that a password was actually hashed correctly.

`staff_credentials` is server-only. Do not send hashes to EJS/browser code, accept
hashes supplied by a browser, put passwords on a command line or commit real
credentials/fixture secrets. The module is a cryptographic primitive, not a
sign-in endpoint or proof of MFA.

## Remaining integration work

Password, MFA, sign-in, the isolated transport router, deactivation and local
first-admin setup are implemented below. Application mounting, public transport
configuration, employee enrollment/recovery UI and UI acceptance remain unfinished.

1. Apply the implemented enrollment policy below to future employee creation and
   password changes as those services are added. The finite offline common-password
   blocklist is not an exhaustive compromised-password database.
2. Web sign-in integration (internal orchestration is implemented below): generic failure responses, comparable handling of
   unknown accounts, bounded concurrent expensive hash operations, per-account
   and source throttling, secure CSRF-protected forms, fresh random session tokens
   and server-set cookie protections. Verify current account/credential revision
   again after asynchronous hashing before issuing any session; a password reset
   or deactivation during verification must invalidate the attempt. Never hold a
   synchronous SQLite transaction open across an await.
3. Admin TOTP: the user approved
   [OTPAuth](https://github.com/hectorm/otpauth), now pinned to 9.5.2.
   Protect enrollment challenges and time windows, record consumed counters to
   reject replay, and issue an admin session only after successful verification.
   Store factor secrets encrypted under an environment-owned key outside Git;
   the current MFA-reference table alone does not store or verify those secrets.
   Encrypted-secret storage and local bootstrap enrollment are implemented. Actual
   environment key provisioning, rotation and protected factor-management routes
   remain separate work.
4. Run the implemented local first-admin command only when the operator is ready,
   with their own identity and a separately provisioned MFA encryption key. The
   implementation/tests did not create an actual project admin or production key.
5. Recovery policy and backend/terminal implementation are approved and recorded
   below. Integrate their protected routes into finished screens without adding
   public local-operator recovery, security questions or ordinary employee overrides.
6. Integrate the real sign-in/MFA/account lifecycle with EJS/Express. Run complete
   three-browser functional/visual checks, applicable manual accessibility checks
   and the required Lighthouse gates before accepting the web flow. Storage and
   unit checks do not establish authentication accessibility or security.

No new dependency was added in the password-foundation increment; the subsequent
MFA-foundation increment adds OTPAuth 9.5.2. The local setup command can now
provision the first admin with verified MFA. No actual project account was created
during implementation. Employee invitation/enrollment services and isolated routes
are now implemented below. There is no mounted login/enrollment/recovery UI
or external communication yet. Neither TECH-04 nor BE-08 is complete.

## Implemented MFA foundation

`src/auth/mfa-service.js` provides `createMfaService`, with `beginEnrollment`,
`confirmEnrollment`, `verifyCode` and `destroy`. All are internal server methods;
they are not Express endpoints. The caller must establish a verified identity and
authorize enrollment/factor changes before calling them. Never take a browser's
claimed staff ID as sufficient authorization. The service additionally checks
that the persisted identity is an active admin.

Configuration requires `MFA_ENCRYPTION_KEY_HEX`: a separately provisioned random
32-byte key encoded as 64 lowercase hexadecimal characters. Tests pass explicit
synthetic keys; no actual environment key was generated or saved. A trusted
constructor option selects the key ID (default `local-v1`). There is no generated
fallback or automatic rotation. Missing/malformed keys fail initialization;
wrong IDs, modified ciphertext and authentication failures throw generic
decryption errors and must deny authentication. Keep the real key outside Git,
database files, logs, command arguments and user-facing configuration. Rotation
and recovery after key loss require a separate reviewed procedure.

Migration 007 stores 20-byte TOTP secrets encrypted with AES-256-GCM, random
12-byte IVs and 16-byte tags. Authenticated additional data binds the format,
factor ID, staff ID and key ID, so copying another factor's encrypted payload
does not decrypt under a new owner. Mutable buffers are cleared where possible;
JavaScript/library copies and returned provisioning strings cannot be guaranteed
erased from memory.

Enrollment returns a provisioning URI containing the secret **once** for the
eventual protected enrollment page. Do not log it, place it in third-party QR
services, analytics, screenshots, notification previews or ordinary audit rows.
No URI for a real account was generated in this increment. The pending enrollment
expires after ten minutes, creates no active reference until a correct code, and
cannot replace an already active factor. Expiry clears its encrypted payload;
metadata remains for history. Successful confirmation links an active reference,
consumes the accepted counter and records an audit event atomically.

Codes use SHA-1, six digits and 30-second periods with a one-step clock window
in either direction. Only counters strictly greater than the stored consumed
counter succeed, including after confirmation, across connections and restarts.
The database transaction serializes validation/counter updates. Invalid input,
unknown/inactive identities, revoked factors, wrong codes and backward clocks
cannot authenticate. The constructor clock is trusted server state, not request
input. Revoking the MFA reference clears the encrypted secret and invokes the
existing session-revocation behavior; do not bypass that path with manual updates
to the secret row.

Verification returns an internal boolean and creates no session or MFA marker.
A future login service must bind the result to the same password-authenticated
attempt/user and enforce throttling before exposing code validation. Enrollment
routes also require reauthentication, CSRF protection and authorization. The
service deliberately supplies no factor-replacement/recovery bypass. `destroy`
clears its key buffer at application teardown; do not share it after destruction.

`tests/unit/mfa-service.test.js` covers confirmation, encrypted persistence,
correct/incorrect/expired/replayed codes, clock drift, account/factor state,
cross-factor ciphertext substitution, key failures, audit rollback, migration
rollback and consumed counters shared by two database connections. All keys,
accounts and provisioning URIs are isolated synthetic test artifacts.

## Implemented internal sign-in service

`src/auth/login-service.js` exports `createLoginService(database, options)` with
`beginSignIn(username, password, source)` and `completeMfa(challenge, code, source)`.
These are internal server methods, not routes. Expected rejection returns `null`;
system/crypto/database errors propagate and callers must deny access. The source
must be derived from trusted transport/proxy configuration, never request form
fields or untrusted forwarded headers. No real account was provisioned.

Employees receive a fresh 32-byte random session token after password verification;
admins receive only a five-minute random challenge until the existing MFA service
verifies a code. Challenges are source-bound and single-use. Raw tokens are returned
only to the trusted caller; SQLite stores SHA-256 digests. Session issuance uses the
existing eight-hour absolute and 30-minute idle policies. Never expose these tokens
in URLs, logs, analytics or browser storage. HTTP integration must set secure,
HttpOnly, SameSite cookies, protect forms against CSRF, and rotate/revoke any old
session; none of those HTTP behaviors is implemented in this increment.

Migration 008 adds transient `login_limits`, `login_challenges`, and an identity
epoch. Staff updates and credential updates increment the epoch and delete pending
challenges, including disable/re-enable changes that restore previous field values.
After asynchronous password work, a synchronous transaction rechecks account,
credentials, revisions and epoch before granting any result. No SQLite transaction
is held across an await. MFA counter consumption precedes issuance in its own
synchronous transaction; an issuance failure can consume a code without granting a
session. Retrying requires a new code. Challenge consumption and session insertion
commit together. This fail-closed trade-off avoids nested transactions.

Conservative demo limits allow five attempts per account and 30 per source in a
fixed 15-minute window, separately for password and MFA stages. Successful attempts
also count; limits are not reset on success. Expired transient rows are removed on
subsequent attempts; there is no cleanup worker. A 5,000-row throttle-table cap denies
new attempts under saturation. Source digests are pseudonymous, not anonymous (low
entropy addresses can be guessed). No raw source address or username is stored in
these transient rows. Two expensive password checks may run concurrently per Node
process, with no queued excess work. Multiple processes require a separately reviewed
shared resource limit. Fixed windows permit bursts around boundaries and account
throttling can deny legitimate access temporarily; these limits need operational
review before public exposure. Unknown accounts perform the same scrypt verification
using a synthetic dummy hash; this reduces obvious timing differences but is not a
constant-time end-to-end guarantee.

No new dependency, web route, cookie, account setup, recovery flow or sign-in screen
is included. BE-08 remains incomplete. Browser, visual, accessibility and Lighthouse
acceptance remains required for the eventual web flow, not established by these
internal-service tests. Migration rollback for disposable local data is recreation
from reviewed migrations/seed; do not edit applied checksums or roll code back to a
version that does not recognize migration 008.

`tests/unit/login-service.test.js` covers employee issuance, admin MFA, expiry,
replay, source binding, generic rejections, persistent throttling, hash concurrency,
and credential changes during hashing. Synthetic fixtures are isolated in memory.

## Implemented isolated HTTP boundary

`src/auth/auth-router.js` exports `createAuthRouter({ objLoginService,
objSessionService, objStaffAccountService, objStaffEnrollmentService, objRecoveryService, strOrigin })`.
`src/auth/auth-transport.js` holds strict cookie
parsing and CSRF helpers. No dependency or migration is added. The router is not
mounted in `src/app.js`, so customer pages and the running application's exposed
routes are unchanged. The internal login service now also provides
`revokeChallenge(token)` for explicit logout or replacement of a pending challenge.

Proposed mount prefix is `/auth`, with these relative contracts:

| Method/path | Input | Result |
| --- | --- | --- |
| GET `/csrf` | Existing auth cookies if any | `{ strCsrfToken }` and a protected seed cookie if needed |
| POST `/login` | `{ strUsername, strPassword }` | `{ strState: 'authenticated' }` or `'mfa_required'` |
| POST `/mfa` | `{ strCode }` plus protected challenge cookie | `{ strState: 'authenticated' }` |
| GET `/session` | Protected session cookie | `{ strUserId, strRole }` from persisted identity |
| POST `/logout` | `{}` plus CSRF | 204, revocation and cookie clearing |
| POST `/employees/deactivate` | `{ strEmployeeId }` plus session cookie and CSRF | `{ strState: 'disabled' }` or `'already_disabled'` |
| POST `/employees/invitations` | `{ strUsername }` plus admin session and CSRF | 201, invitation ID, one-time token and expiry |
| POST `/employees/invitations/revoke` | `{ strInvitationId }` plus admin session and CSRF | `{ strState: 'revoked' }` |
| POST `/employees/enroll` | `{ strInvitationToken, strPassword }` plus CSRF | 201, `{ strState: 'enrolled' }` |
| GET `/employees` | Admin session; optional `intOffset`/`intLimit` query | Paginated employee summaries |
| GET `/employees/invitations` | Admin session; optional `intOffset`/`intLimit` query | Paginated invitation summaries, never tokens |
| POST `/account/password` | `{ strCurrentPassword, strNewPassword, strCode }` plus session and CSRF | `{ strState: 'password_changed' }`; cookies cleared |
| POST `/recovery/codes` | Admin session, `{ strPassword, strCode }`, CSRF | Ten new recovery codes, shown once |
| POST `/recovery/start` | `{ strUsername, strPassword, strRecoveryCode }`, CSRF | Replacement provisioning URI; protected recovery cookie |
| POST `/recovery/confirm` | `{ strCode }`, recovery cookie, CSRF | `recovered` plus new recovery codes; no session |

POST requests require exact configured `Origin`, a valid `X-CSRF-Token` header,
and JSON (at most 4 KiB, compressed bodies rejected). Extra fields, wrong field
types, duplicate/malformed auth cookies and hostile Fetch Metadata are rejected.
All methods require a directly encrypted socket and the pinned host; neither
Express `trust proxy` nor forwarded headers can provide TLS/source proof. Source
limits use the socket address. This deliberately does not support TLS termination
at a reverse proxy yet: do not mount it behind GCP's proxy without a separately
reviewed trusted transport/address strategy. No HTTP development bypass exists.

Session, MFA challenge and CSRF seed cookies use `__Host-` names, Secure, HttpOnly,
SameSite=Strict, Path=/ and no Domain. Cookie lifetimes are eight hours, five minutes
and ten minutes respectively; database session/challenge expiry remains authoritative.
CSRF uses an HMAC over a random seed plus the current session/challenge, under a
random process-local router key. Browser code obtains the signed token from the
same-origin JSON response, then sends the custom header; it cannot read HttpOnly
cookies. Cookie injection alone cannot manufacture the signature. The seed rotates
after successful password/MFA stages; fetch `/csrf` again before the next POST.
Restarting the router invalidates outstanding CSRF signatures, requiring a refetch,
without granting access or invalidating persisted sessions. Never enable permissive
credentialed CORS around these endpoints. Future UI must preserve typed inputs
through recoverable errors without storing passwords or tokens in browser storage.

Successful sign-in sets a fresh session cookie and revokes the previous cookie's
session; raw session/challenge tokens are never JSON response fields. Replacement
or logout deletes the old pending challenge in SQLite. If replacing a session fails,
the new unexposed session is revoked where the database permits and the request
fails closed. Catastrophic database failure can leave an unexposed row until expiry;
no multi-operation atomicity or operational recovery guarantee is claimed here.
Session lookup only returns current persisted user ID/role, never a client role.
Future business routes must separately authorize each action with the existing
permission service; identity lookup alone grants no business operation.

Responses use no-store, no-cache, noindex and no-referrer protections. Expected
authentication failure returns generic 401; CSRF/transport/origin failures 403;
invalid JSON/schema/cookies 400; oversized bodies 413; unsupported content/encoding
415; system failures 503. No password, code, token or internal exception is logged
by this router. Mount before unrelated body parsers/access logging, and configure
outer application/proxy logs to exclude credentials, cookies and request bodies.

`tests/unit/auth-router.test.js` exercises real local HTTPS requests with disposable
self-signed certificates generated by local OpenSSL, synthetic identities and actual
password/MFA/session services. Only that isolated test client disables certificate
verification; no application TLS checks are weakened. Tests check cookies, CSRF
rebinding, login/MFA/logout, expiry/revocation, spoofed headers, request limits and
safe errors. They require OpenSSL and local listening permission. These are protocol
integration tests, not browser cookie-policy, accessibility or Lighthouse evidence.
The eventual mounted UI still requires the full three-browser/manual/visual and
Lighthouse gates. No real user account, key or enrollment was created.

Implementation references reviewed October 21, 2026:
[Express 5 API](https://expressjs.com/en/5x/api/) and
[OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
The HMAC, origin/header checks and host cookie prefix are layered defenses, not a
claim of complete security conformance.

## Implemented employee deactivation

`src/auth/staff-account-service.js` exports `createStaffAccountService(database,
{ fnNow })` with `deactivateEmployee(sessionToken, employeeId)`. The clock is a
trusted server dependency. The caller supplies a bearer token, never a claimed
actor ID, role or permission. The factory creates its own session service against
the same database/clock; callers cannot substitute a permissive authorization result.

The new internal `executeAuthorized(token, action, synchronousWork)` method in
`src/auth/session-service.js` validates the persisted session and permission, touches
activity, and executes trusted synchronous work under the same SQLite write lock.
This avoids a separate authorize-then-write race and nested transactions. Async
callbacks are rejected before invocation; thenable results trigger rollback. Do not
start asynchronous work inside these callbacks. Failed/expired session handling
retains the existing denial/revocation behavior. Business services must hardcode
their required action rather than accept a caller's action name as authority.

Deactivation requires `employees.manage`, currently admin-only, and accepts only
an employee target. Self and all admin targets are protected, including other
admins. Unknown/malformed targets and denied authorization return `null`, without
target state changes. The first successful request returns `{ strState: 'disabled' }`;
subsequent authorized requests return `{ strState: 'already_disabled' }` without
another revision, revocation or audit entry. Valid authorization may still update
the requesting admin's activity timestamp on target rejection or repeat requests.

The mutation sets disabled state/time, increments the staff revision, and writes an
attributed `staff_change` audit with the allowlisted summary `Staff account changed`.
Existing database triggers revoke every active target session, advance its login
epoch and delete pending challenges. A password verification already in progress
must fail its post-hash account/epoch checks. The update and audit commit together;
audit failure rolls back target state, revocations, epoch/challenges and admin
activity. Future target session activity, a future creation timestamp or exhausted
revision prevents an inconsistent write. Errors propagate for fail-closed handling.
No credentials, tokens, contact details or free-form reasons enter the audit summary.

The isolated auth router now requires `objStaffAccountService` and exposes the
relative POST `/employees/deactivate` endpoint. Its body accepts exactly one string
`strEmployeeId` (1–128 characters), with no client actor or role. The service performs
the authoritative admin/target checks inside its transaction; the router does not
substitute a separate identity lookup. Expected denial returns generic 403 for
missing/expired/revoked sessions, employee callers, and protected/unknown targets.
Malformed bodies return 400; internal failures return sanitized 503. The endpoint
inherits direct TLS, pinned origin, signed CSRF, protected cookies, JSON limits and
no-store headers. Repeated authorized requests return 200 with `already_disabled`.
The configured HTTPS runtime now mounts this contract; see the mounted staff experience below.

No migration, dependency, screen, reactivation, account creation,
password change or admin lifecycle operation is included. This internal module does not
complete BE-08 or its user-facing browser/accessibility/Lighthouse acceptance.

`tests/unit/staff-account-service.test.js` uses isolated synthetic records to verify
permission/target boundaries, revocation, stale challenge deletion, idempotency,
clock/revision boundaries, transactional rollback, synchronous callback rules and
deactivation racing an actual asynchronous password check.
`tests/unit/auth-router.test.js` additionally verifies the complete HTTPS boundary
using actual password/MFA/session/account services: administrator sign-in through
deactivation, a separately active employee session becoming invalid, idempotency,
unauthenticated/employee/MFA-pending/expired/revoked callers, protected targets,
role/actor injection, CSRF and method rejection, and audit-failure rollback/retry.

## Implemented local first-admin setup

Run `npm run db:migrate` for the intended `DATABASE_PATH`, then `npm run admin:setup`
in a private interactive terminal. Configure `MFA_ENCRYPTION_KEY_HEX` beforehand
through your private environment/secret manager: a separately provisioned random
32-byte key encoded as 64 lowercase hex characters. Never put the key/password on
a command line, in Git, terminal recordings or this chat. The command does not
generate or persist a fallback key. Keep the same key available for later sign-in;
losing it does not enable a recovery bypass. Actual environment provisioning and
recovery procedures remain a separate reviewed activity.

`scripts/setup-admin.js` requires terminal input/output, rejects arguments and piped
input, and uses the existing database path (default `data/luigis-demo.sqlite`). It
verifies/applies reviewed migrations, asks for an individual username and hidden
password/confirmation, then displays a secret `otpauth:` URI only in that private
terminal. Import directly into an authenticator supporting URI import; no external
QR service or QR dependency is used. The URI remains in terminal scrollback until
the operator clears it, so disable recording/screen sharing and clear it afterward.
No secret file is created. Code input is hidden. Ctrl-C, end-of-input, five rejected
codes, or the ten-minute command timeout abort setup; restart rather than bypassing
MFA. The setup command creates no login session or recovery codes.

`src/auth/password-policy.js` validates new passwords before hashing: at least 15
Unicode code points and at most 1024 UTF-8 bytes, well-formed Unicode, no terminal
control characters, offline case-insensitive common-password matching, and rejection
of single repeated characters and simple username/project-only variants. Spaces,
Unicode passphrases, paste and password managers are supported. No required character
mixtures or periodic changes are introduced. Matching trims/lowercases a temporary
comparison only; the original password is hashed and verified exactly, with no
trimming/normalization/truncation. A finite blocklist cannot identify every weak or
compromised password. Historical credentials are not silently rehashed or rejected
at login under a new enrollment policy.

The reviewed `src/auth/blocklists/common-passwords.txt` is imported from a pinned
SecLists revision, with its MIT license in `LICENSE-SecLists`, source/checksum in
`SOURCE.md`, and a load-time SHA-256 integrity check. Missing/changed list bytes fail
closed. Passwords never leave the process for a breach-check service. Updating this
static list requires review and maintenance; a future online service or larger list
is a separate choice. These text data are not executed.

`src/auth/bootstrap-service.js` reuses the real migrations/password/MFA services in
an isolated in-memory staging database. After password hashing it stages a random
admin identity, salted credential and encrypted pending factor, then returns the
provisioning URI once. The application database remains unchanged until a correct
authenticator code. Confirmation replays the pending-to-active factor transition
under existing schema guards and commits account, credential, factor/reference and
two sanitized system audit events in one application transaction. No transaction
spans asynchronous password work. Cancellation/disposal closes the staging database
and destroys the MFA service key buffer; JavaScript/SQLite internal copies cannot be
guaranteed erased. The CLI also drops password/provisioning-string references after
use, without claiming secure string erasure.

Confirmation rechecks the ten-minute window, monotonic clock and absence of an
existing admin after taking the application write lock. Any existing admin, including
a disabled admin, prevents setup. A durable `local-bootstrap:` identity subject
also prevents repeating setup after a later role change. Competing connections may
stage candidates but only one can commit. No employee/admin-management endpoint can
invoke bootstrap or create additional admins. Local filesystem/database access is
the operator's authority boundary; do not expose this service as a public API.

On audit/database failure the entire application write rolls back. A valid code may
already have been consumed in staging; a retry requires a fresh code and remains
within the original time/attempt limit. A username conflict, interruption or process
crash does not leave a partial application account. After successful commit, a later
terminal failure does not undo the account: rerunning safely refuses duplicate setup.
Recovery from a completed-but-lost enrollment must use the reviewed recovery
procedure, not manual deletion or another bootstrap admin. Setup now returns
`{ arrRecoveryCodes }` on confirmation (rather than the earlier boolean success),
and the CLI displays those ten codes once. Code digests are committed atomically
with the first admin. Existing admins can generate codes after password/fresh MFA
verification. Migration 010 adds their storage; no new npm dependency is added.

Verification: `tests/unit/bootstrap-service.test.js` covers password boundaries and
blocklist rejection, no writes before MFA, real post-setup sign-in, cancellation,
expiry/code limits/backward clocks, full rollback/retry, separate-connection first
admin contention, durable bootstrap marker, invalid/key failures, concurrent begin,
cancellation during hashing, and rejection of piped input without secret echo.
Additional terminal verification used a disposable database/key and pseudo-terminal:
entered synthetic credentials, imported the returned URI locally, generated a current
code, checked one committed admin, and checked password/code absence from captured
output; a second run interrupted at the code prompt and verified zero accounts.
Neither run used the real project database. No browser page changed; the eventual
mounted account UI still needs browser/visual/manual accessibility/Lighthouse checks.

## Implemented employee invitations and enrollment

`src/auth/staff-enrollment-service.js` provides `issueInvitation(sessionToken,
username)`, `revokeInvitation(sessionToken, invitationId)` and asynchronous
`acceptInvitation(token, password, source)`. Issue/revoke require the existing
`employees.manage` permission under the session service's atomic authorization
boundary. The proposed username is canonicalized to lowercase ASCII, 3–64 characters,
with letters, digits, dot, underscore or hyphen. An existing credential (including
a disabled user's) or pending invitation reserves that username. Expired pending
invitations for that username are marked expired before issuing a replacement.
Explicit revocation also permits a replacement. No account is created at issue time.

Migration 009 adds `staff_invitations`: random ID, username, SHA-256 token digest,
issuer and issuer epoch, canonical UTC issue/24-hour expiry timestamps, bounded attempt
counter and pending/accepted/revoked/expired state. Terminal state retains its closing
time and either revoking admin or accepted employee reference. Identity fields and
terminal rows are immutable; deletion is blocked. These attributed issue/revoke/accept
records are invitation lifecycle evidence, not new general audit action types.
Acceptance additionally writes the existing sanitized `staff_change` audit event.
No raw invitation token, password or free-form message enters the database history.

The service returns the 32-byte random invitation token only when issued. Hand it
directly to the intended demo teammate through a private manual handoff; no email,
SMS, notification preview, URL link or automated delivery is implemented. Treat it
as a bearer credential: anyone holding it can enroll the named employee before
expiry. Do not post it to Trello, logs, analytics, screenshots, browser storage or
shared notes. Lost tokens cannot be retrieved; revoke using the returned invitation
ID and issue another. Management listing/UI is integrated below; token delivery stays a private manual handoff.

Acceptance needs the token and a password satisfying the existing enrollment policy;
it does not need an admin session and never accepts a requested username, actor or
role. It creates an active **employee only**, with the reserved username and fresh
salted password hash. It does not issue a session; normal sign-in follows enrollment.
Token consumption, account/credential insertion and audit commit together. SQLite's
write lock serializes concurrent acceptance; at most one can commit. The token and
issuer's active admin role/epoch are checked before hashing and again inside the
final transaction. Revocation, expiry or issuer account/credential changes during
hashing invalidate the attempt. A password/account change advancing the issuer
epoch invalidates old invitations even if the issuer is later restored; explicitly
revoke/reissue rather than restoring an old token. No transaction spans an await.

Each invitation permits five admitted password-hash attempts. Invalid password-policy
inputs are cheap rejections and do not count. Expensive acceptance also permits at
most 30 attempts per trusted socket source in a fixed 15-minute window, stored as
a namespaced digest in the existing transient `login_limits` table. The existing
5,000-row saturation cap fails closed. Two enrollment hashes run at once per process
without queued excess work; this is separate from the two-login-hash cap, so combined
memory/concurrency must be assessed before public deployment or multi-process use.
Source digests are pseudonymous, not anonymous. No raw source address is retained.
Audit/system failure rolls back enrollment and consumption, but the previously
reserved attempt/source budget stays consumed; retry within the remaining budget.

The isolated router requires `objStaffEnrollmentService` and exposes the three POST
contracts above under the same TLS, origin, signed CSRF, JSON-size, cookie and
no-store protections. Admin issue returns the sensitive token in its authenticated
201 JSON response once; enrollment success returns only `enrolled`. Missing authority,
unknown/expired/revoked/used tokens, conflicts and policy failures receive generic
403; unexpected body fields return 400, and system errors sanitized 503. No actual
team invitation or employee account was created during implementation. Router
mounting and enrollment/account-management screens are described in the integration
section below, along with browser, visual, manual accessibility and Lighthouse gates.

`tests/unit/staff-enrollment-service.test.js` covers authorization, digest-only storage,
24-hour expiry, revocation/replay, issuer invalidation, password races, two-connection
acceptance, username collision, audit rollback, password/source/attempt/concurrency
limits and migration upgrade/rollback. `tests/unit/auth-router.test.js` covers an
actual HTTPS admin-to-anonymous-recipient handoff, employee sign-in after enrollment,
admin escalation rejection, CSRF, revocation and expiration. All records are synthetic.
The disposable local database upgrades additively with `npm run db:migrate`; rollback
is recreation from reviewed migrations/seed, not editing checksums or deleting staff
history. Never run older code unaware of migration 009 against the upgraded database.

## Implemented account maintenance

`src/auth/staff-account-service.js` now additionally provides
`listEmployees(sessionToken, offset = 0, limit = 50)` and asynchronous
`changeOwnPassword(sessionToken, currentPassword, newPassword, code, source)`.
`src/auth/staff-enrollment-service.js` provides
`listInvitations(sessionToken, offset = 0, limit = 50)`. Its shared `validPage` helper
is exported from the account service to keep the service/router bounds consistent.
No migration or npm dependency is added.

Lists require `employees.manage`; employee callers and absent/expired/revoked
sessions cannot read them. SQL selects explicit fields only. Employee summaries
contain user ID, username (nullable for a legacy identity without credentials),
state, creation and disabled timestamps, excluding admin identities. Invitation
summaries contain ID, username, persisted state, issuing admin ID, issue/expiry/closing
timestamps and accepted employee ID. No password hash, token/digest, MFA material,
source bucket or internal epoch is returned. Persisted `pending` state does not
override expiry or issuer invalidation: acceptance always rechecks those conditions.
An expired invitation may remain stored as pending until replacement; use its expiry
timestamp when designing the eventual status presentation.

Both lists return `{ arrEmployees | arrInvitations, intOffset, intLimit, bHasMore }`.
Offsets are safe integers 0–1,000,000; limits 1–100, default 50. Queries use bound
parameters, order by creation time then ID, and read one extra row for `bHasMore`.
Each page is authorized/read atomically, but separate requests are not a snapshot:
concurrent inserts can affect offset pagination. The router accepts only canonical
decimal strings for those two query parameters; duplicates, unknown keys, fractions,
whitespace or out-of-range values return 400. Unauthorized list requests return
generic 403. Responses inherit no-store/noindex and the existing HTTPS/origin checks.

The new `account.password.change` permission is available to both recognized staff
roles, but only the service's session owner can be changed: there is no target ID,
username, actor or role input. The current password is verified exactly and the new
password must satisfy the existing enrollment policy and differ from the supplied
current password. Invalid/rejected attempts return `null` internally and generic
403 over HTTP. Employee requests pass an empty `strCode`; admin requests must supply
a fresh six-digit code verified by the real MFA service. The factory accepts its
trusted `objMfaService` dependency for this purpose and fails closed if unavailable.
It never treats a client flag or session's previous MFA marker as a fresh code.

Initial session authorization, credential snapshot and throttle reservation occur
synchronously under a write lock. Password verification/new hashing run outside a
transaction. After MFA verification where applicable, a final authorized transaction
rechecks the same owner, role, credential revision/hash and login epoch, current
session validity, monotonic time and a five-minute attempt deadline before updating.
Future password/session timestamps or exhausted revisions prevent an inconsistent
write. Credentials update and an attributed sanitized `staff_change` audit commit
together; audit failure rolls both back. Existing credential triggers revoke all
sessions (including the current one), delete pending login challenges and advance
the login epoch, invalidating outstanding issuer-bound invitations as well. No
replacement session is issued: the router clears all auth cookies, then the user
must fetch CSRF and sign in again. Admin MFA counters may be consumed before a later
failure, so retry with a fresh code. There is no transaction across an await.

Password-change hashing permits two concurrent operations per Node process, five
admitted attempts per account and 30 per trusted source in a fixed 15-minute window,
with the existing transient 5,000-row saturation cap. Source/account buckets contain
namespaced digests. Weak/same-password inputs rejected before hashing do not consume
the expensive-work budget. Failed verification and downstream failures do consume
admitted budget, and success does not reset it. Login, enrollment and password-change
caps are separate: deployment must size memory for their combined worst case (up to
six simultaneous scrypt operations), or review a shared cap before public use.
Source must be the trusted socket address, not request data/forwarded headers.

The account-maintenance foundation changed no customer page; the staff integration
is documented below.
Recovery, reactivation, admin-created password resets and role changes are outside
this increment. No actual user password was changed. Future screens must preserve
recoverable inputs safely, permit paste/password managers, explain required sign-in
after change, and pass browser/visual/manual accessibility/Lighthouse acceptance.

`tests/unit/account-maintenance.test.js` covers admin-only pagination, secret exclusion,
own-password behavior, current/new password failures, fresh admin MFA, invitation
invalidation, concurrent/deactivated attempts, audit rollback, session expiry and
persistent account/source/concurrency throttles. HTTPS integration checks in
`tests/unit/auth-router.test.js` verify strict list queries, missing permissions,
CSRF and target injection rejection, cleared cookies, copied-session revocation,
new-password sign-in and fresh/replayed admin MFA behavior.

## Implemented recovery policy and flow

Approved October 21, 2026: ten random single-use admin recovery codes, shown once
and stored only as digests; password plus code to replace lost admin MFA; revocation
of sessions and mandatory confirmation of a replacement authenticator before access
resumes. When password and codes are lost, Brody verifies the teammate **in person**
and oversees the private local recovery command. No public identity-question or
ordinary employee override is permitted. The in-person check means recognizing the
actual project teammate and matching the intended individual account, rather than
treating possession of a name, email, phone or order number as proof. Do not collect
identity-document scans for this synthetic class demonstration.

The local command's typed acknowledgement records compliance with that procedure;
software cannot establish that Brody actually performed it. Operating-system access
to the database/key is the technical authority boundary. Restrict that access to
approved team operators and never expose `beginLocalRecovery` through HTTP. Anyone
with unrestricted database/key access can alter this local demo independently of
its web controls; the command does not claim stronger identity proof or compliance.

Files and integration:

- `src/auth/recovery-records.js`: internal transaction helpers to issue/revoke code
  digests and write sanitized audit entries. Call only after real authorization.
- `src/auth/recovery-service.js`: password/MFA-authenticated `regenerateCodes`,
  password/code `beginRecovery`, challenge `confirmRecovery`, operator-only
  `beginLocalRecovery`, and `destroy`. Requires the existing MFA key/key ID and
  trusted server clock. The same configured key must remain available after recovery.
- `010-account-recovery.sql`: immutable-history `recovery_codes` and
  `recovery_requests`, plus persistent `recovery_locks` bound to the correct request
  and user. No account, key, code or recovery request is seeded by migration.
- Bootstrap confirmation now issues the first ten codes in its account transaction.
  Existing admins regenerate them with their password and a fresh authenticator
  code. Ordinary employees cannot generate/use the admin MFA recovery-code flow.
- Login and session services deny recovery-locked accounts; a database trigger
  also rejects insertion of live sessions while locked. Local recovery preserves
  the original employee/admin role and refuses disabled accounts.
- The isolated auth router exposes only the three public contracts above, with
  the existing TLS/origin/CSRF/body-size/no-store protections. It never exposes the
  local operator method. The configured HTTPS runtime mounts only the public recovery contracts.

Codes are ten independently random 16-byte values encoded as 32 lowercase hex
characters (128 bits each). Store them privately in a password manager or offline
safe place, separate from the authenticator, and never in Trello, logs, screenshots,
URLs, browser storage or shared project files. No notification is sent. The database
stores SHA-256 digests with active/used/revoked states and canonical closing times;
there is no retrieval of raw values. Regeneration revokes the prior active set.
Codes have no automatic expiry, but one use consumes a code and successful factor
replacement invalidates all remaining old codes and issues ten replacements once.
They are a second factor replacement, not a standalone password reset credential.

Public recovery checks the current password plus an unused code for an active admin.
Unknown accounts perform dummy scrypt verification for comparable work. After proof,
a transaction consumes the code, records the request, revokes every session and
active MFA reference (which clears old encrypted secrets), advances the identity
revision/epoch, invalidates login challenges/invitations, and creates a persistent
access lock. The old factor is never restored on cancellation or timeout. Initial
audit failure rolls this transaction back, including code consumption and revocation.

Replacement factor enrollment is staged in an isolated in-memory database through
the existing MFA service. Only encrypted material is copied to the application
database after a valid new authenticator code. The challenge is a random 32-byte
token, with only its digest stored; HTTP keeps the raw token in a Secure/HttpOnly/
SameSite=Strict `__Host-luigis-recovery` cookie. Its ten-minute lifetime and five
confirmation attempts are enforced server-side. CSRF signatures now also bind this
cookie; refetch `/csrf` after recovery starts. The provisioning URI contains the new
secret and is returned once to the protected response/private terminal, never to an
external QR service. No sign-in session is issued during or at completion of recovery.

Completion rechecks request ownership, the current active account/role, epoch,
credential revision, time and lock under a write lock. It atomically persists the
new factor, optionally replaces the password for the local procedure, closes the
request, removes the lock, writes sanitized audit history and issues fresh admin
codes. Normal password/MFA sign-in must follow. Failed completion rolls all of those
changes back and leaves old access revoked; a staged authenticator counter may
already be consumed, so use a fresh code for retry within the remaining limits.
Replay and competing connections cannot consume one recovery code twice. A newer
valid recovery supersedes the old request/challenge rather than granting both.

Interrupted process, cleared cookies, expiry, exhausted confirmation attempts or
`destroy` discards the private in-memory enrollment but **retains the access lock**.
Restart with the current password and another unused recovery code, or use Brody's
approved local procedure if those are unavailable. Do not delete the lock manually,
reenable the lost factor, create another admin, or silently bypass MFA. Old request
metadata is retained; an in-memory context is required to confirm its challenge, so
a server restart does not permit replay of a partially completed enrollment. The
service holds at most 20 staging contexts and removes expired ones on subsequent
start/confirmation work; destruction clears key buffers and closes staging stores.
JavaScript/library/internal copies and returned secret strings cannot be guaranteed
erased. A future multi-process deployment needs a reviewed routing/staging design.

Password proof/regeneration/local reset admits at most two expensive operations
per Node process, five attempts per account and 30 per trusted source per fixed
15-minute window, plus the existing 5,000-row transient saturation cap. Reserved
budgets remain consumed on failure. This cap is additional to login/enrollment/
password-change caps, so combined worst-case sizing is up to eight simultaneous
scrypt operations. Local attempts share the account limit and may need to wait after
throttling; there is no operator bypass of proof-budget limits. Unknown/invalid/
used codes and unavailable account states produce generic denial. Crypto/database
errors propagate for sanitized 503 responses, never fall back to weaker proof.

For loss of password/codes, run `npm run account:recover` only in a private,
unrecorded interactive terminal against the intended migrated `DATABASE_PATH` with
the separately provisioned `MFA_ENCRYPTION_KEY_HEX`. After Brody's in-person check,
type the explicit `RECOVER` acknowledgement, enter/confirm a new password privately,
and, for admins, import and confirm the replacement authenticator. Employees retain
employee role and need no newly introduced MFA. The command rejects arguments/pipes,
supports interruption/time limits and hides password/code input. It records method
`brody_in_person` and system audit attribution, with no uploaded identity evidence or
free-form private notes. Save newly displayed admin codes and clear sensitive terminal
scrollback afterward. The command cannot solve loss of the database or encryption
key; those remain separate operational decisions. No actual account was recovered
and no real code/key generated during implementation.

Verification: `tests/unit/recovery-service.test.js` covers code regeneration, digest
storage, replay, complete recovered sign-in, expiry/attempt limits/restart lock,
start/completion audit rollback, two-connection consumption, local acknowledgement/
password/role handling, throttling and migration upgrade/rollback. HTTPS integration
tests cover protected recovery cookies and CSRF, old-session revocation, replacement
factor sign-in, new codes returned once, denied employee use and absence of a public
local-recovery endpoint. Bootstrap tests confirm ten codes committed with setup.
Private terminal verification used only temporary databases/keys and simulated the
acknowledgement: successful admin recovery, interrupted admin enrollment and employee
password recovery all passed, with hidden inputs and lock/password invariants checked.
No actual in-person verification was claimed or performed by these synthetic tests.

Migration recovery follows the approved disposable-data policy: recreate from
reviewed migrations/seed if necessary; never alter applied checksums or reuse older
code against a database containing migration 010. Application-managed backups and
key-loss recovery remain outside this increment. Mounted screens and their acceptance
evidence are tracked in the integration section below.

Engineering references reviewed October 21, 2026:
[OWASP MFA recovery](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
and [OWASP password recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
These inform proof, single-use tokens and protected factor changes; they do not
certify this demonstration's implementation or the human verification procedure.

## Earlier foundation verification

`tests/unit/password-service.test.js` uses only synthetic values. It covers
random salts, actual correct/incorrect verification, Unicode/byte limits,
malformed hash/cost rejection, username/owner constraints, session revocation,
and upgrade rollback. Existing session/permission tests remain applicable.

Research checked October 21, 2026:

- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html):
  recommends Argon2id first and provides scrypt as an alternative. The selected
  scrypt parameters match its N=2^17, r=8, p=1 option; Node supplies scrypt without
  a new dependency in this project's supported runtime.
- [Node crypto API](https://nodejs.org/docs/latest-v22.x/api/crypto.html):
  asynchronous scrypt, random salts and timing-safe byte comparison.
- [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
  and [MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html):
  password length/blocklists, protected factor changes and careful recovery.

These are engineering references, not a claim that all recommendations are
implemented or that a scan can certify conformance.

## Mounted staff experience (BE-08 / FE-08)

`createApp({ objAuthRuntime })` in `src/app.js` mounts `/auth` and four private,
no-store/noindex EJS views: `/staff/sign-in`, `/staff/enroll`, `/staff/recovery`,
and `/staff/account`. The default export remains the view-only app for existing
customer fixtures. Account views validate the persisted session before rendering;
employee views never include administrator controls. Every mutation still repeats
server authorization, so hidden controls are not a permission boundary.

`src/auth/auth-runtime.js` composes the existing login, MFA, session, employee,
invitation and recovery services around one migrated database. Its teardown wipes
in-memory keys and recovery stages. No default account is created. First-admin
setup and Brody's in-person recovery remain private terminal procedures.

`src/views/pages/staff.ejs` and `partials/staff/field.ejs` provide semantic forms;
`src/public/css/staff.css` uses existing theme tokens; `src/public/js/staff.js`
handles JSON/CSRF requests, MFA transitions, private once-only displays,
pagination, explicit refresh, mutation confirmation and focus/status messages.
Forms require JavaScript and have disabled submit controls until listeners are
attached. Their fallback uses POST, so credentials cannot become query strings.
No staff secrets or identity are written to browser storage. Password/code inputs
are cleared after attempts; private text panels clear on hide/page departure.
Browser/password-manager memory cannot be reliably erased by application code.

### Runtime configuration

`src/server.js` keeps HTTP presentation-only when no authentication settings are
present. Supplying any authentication-specific setting below (other than the general
`DATABASE_PATH`) requires all of them; incomplete or invalid
configuration fails startup instead of downgrading transport:

| Environment setting | Purpose |
| --- | --- |
| `AUTH_ORIGIN` | Exact HTTPS origin, with the configured `PORT` (default 3000). |
| `TLS_KEY_PATH` | Private server TLS key file outside the repository/public tree. |
| `TLS_CERT_PATH` | Trusted server certificate/chain for that origin. |
| `DATABASE_PATH` | Existing private SQLite file; reviewed migrations are checksum-verified/applied at startup. |
| `MFA_ENCRYPTION_KEY_HEX` | Separately provisioned private 32-byte lowercase-hex MFA key. |

`DATABASE_PATH` alone enables public catalog/pricing and BE-02 unpaid order
submission on loopback HTTP;
staff authentication stays unmounted. Any authentication-specific setting still
requires complete direct HTTPS configuration. Public hosting requires the separately
reviewed HTTPS deployment. Set `HOST` to the intended interface; its default remains loopback. The Node
process accepts direct TLS only, with minimum TLS 1.2. No forwarded headers confer
HTTPS or source identity. Reverse proxies, public exposure, GCP resources, domain
configuration and deployment need their own reviewed configuration. The runtime
does not provision a certificate, change OS trust, create a real key/account, or
send invitations by email/SMS. Node does not automatically load a `.env` file.
Keep keys and certificates out of Git and never paste them into Trello.

Cross-platform setup follows [the shared compatibility guide](cross-platform.md).
Staff HTTPS fixtures require OpenSSL on PATH on Windows, macOS and supported Linux;
check the local installation before testing. OS certificate trust and private-file
permissions are separate operator responsibilities. Platform differences never
authorize weaker TLS, cookies, MFA or account recovery. No certificate installation,
trust-store mutation or permission change is performed by these instructions.

### Reproducible integration checks

- `npm run test:unit` includes `tests/unit/auth-runtime.test.js` for actual mounted
  HTTPS responses, no-store/noindex/referrer controls, missing-session redirects,
  host rejection and invalid runtime composition.
- `npx playwright test -c playwright.staff.config.js` exercises real services and
  Secure/HttpOnly/SameSite cookies on a disposable loopback HTTPS fixture in all
  three browsers at mobile/desktop sizes. `tests/fixtures/staff-app.js` owns only
  synthetic in-memory identities and deterministic clock controls. Fixture-only
  `/__test/*` routes never exist in `src/server.js` or the production app.
- The fixture's self-signed certificate exception belongs exclusively to isolated
  automated tests. It is not a production certificate-validation setting or an
  instruction to bypass a browser security warning. Trace/video capture is off
  for secret-bearing authentication flows. Visual snapshots use blank forms and
  non-secret account lists, in light/dark themes.
- New visual baselines need inspection; existing Windows customer baselines must
  not be regenerated to match a different machine. Full WCAG/manual and
  Lighthouse acceptance evidence remains separate from automated axe results.

Staff-only asset delivery uses `partials/head.ejs` with `bStaffPage` and the virtual
`/css/staff-bundle.css` response in `src/app.js`. It combines the unchanged token,
global and staff source styles with the existing gzip negotiation/cache policy;
customer asset URLs and the pinned Bootstrap stylesheet are preserved. The account
view receives only already-authorized employee/invitation summaries as escaped
JSON data, so the browser can draw initial records without two extra round trips.
Explicit refresh, pagination and mutations still call protected endpoints.

Perin explicitly approved an SEO-gate exception on October 21, 2026 for these four
private staff pages, retaining their noindex protection. This does not waive
performance, accessibility, browser or manual review requirements. See
`docs/verification/be-08-staff-ui.md` for measured outcomes and unresolved gates.
