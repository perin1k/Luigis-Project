# TECH-04 / BE-08 — Local staff authentication

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
configuration, employee enrollment UI, recovery and UI acceptance remain unfinished.

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
5. Recovery: single-use random recovery codes, shown once and stored as hashes;
   audited recovery overseen by Brody, session revocation and factor re-enrollment.
   Recovery must not become a bypass that accepts an order number, name, security
   questions or ordinary employee privileges. Exact identity checks and issuance
   procedure require their own review before enabling recovery.
6. Integrate the real sign-in/MFA/account lifecycle with EJS/Express. Run complete
   three-browser functional/visual checks, applicable manual accessibility checks
   and the required Lighthouse gates before accepting the web flow. Storage and
   unit checks do not establish authentication accessibility or security.

No new dependency was added in the password-foundation increment; the subsequent
MFA-foundation increment adds OTPAuth 9.5.2. The local setup command can now
provision the first admin with verified MFA. No actual project account was created
during implementation. Employee invitation/enrollment services and isolated routes
are now implemented below. There is no mounted login/enrollment UI, recovery flow
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
objSessionService, objStaffAccountService, objStaffEnrollmentService, strOrigin })`.
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
This contract remains isolated because the router is not mounted in `src/app.js`.

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
Recovery from a completed-but-lost enrollment must use the future reviewed recovery
procedure, not manual deletion or another bootstrap admin. No schema migration or
new npm dependency is added by setup.

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
ID and issue another. Management listing/UI and delivery remain future integration.

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
mounting and finished enrollment/account-management screens remain separate work,
with the required browser, visual, manual accessibility and Lighthouse gates.

`tests/unit/staff-enrollment-service.test.js` covers authorization, digest-only storage,
24-hour expiry, revocation/replay, issuer invalidation, password races, two-connection
acceptance, username collision, audit rollback, password/source/attempt/concurrency
limits and migration upgrade/rollback. `tests/unit/auth-router.test.js` covers an
actual HTTPS admin-to-anonymous-recipient handoff, employee sign-in after enrollment,
admin escalation rejection, CSRF, revocation and expiration. All records are synthetic.
The disposable local database upgrades additively with `npm run db:migrate`; rollback
is recreation from reviewed migrations/seed, not editing checksums or deleting staff
history. Never run older code unaware of migration 009 against the upgraded database.

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
