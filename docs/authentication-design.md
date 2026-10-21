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

The TOTP primitive described below has now been implemented; its protected routes,
key provisioning, login integration and recovery remain follow-up work.

1. Enrollment/password policy: recommend a minimum of 15 Unicode characters for
   all staff, allow long passphrases/paste/password managers, no forced character
   mixtures or periodic password changes, and reject common/compromised passwords
   using an explicitly selected blocklist strategy. Validate before hashing.
2. Web sign-in integration (internal orchestration is implemented below): generic failure responses, comparable handling of
   unknown accounts, bounded concurrent expensive hash operations, per-account
   and source throttling, secure CSRF-protected forms, fresh random session tokens
   and server-set cookie protections. Verify current account/credential revision
   again after asynchronous hashing before issuing any session; a password reset
   or deactivation during verification must invalidate the attempt. Never hold a
   synchronous SQLite transaction open across an await.
3. Admin TOTP integration: the user approved
   [OTPAuth](https://github.com/hectorm/otpauth), now pinned to 9.5.2.
   Protect enrollment challenges and time windows, record consumed counters to
   reject replay, and issue an admin session only after successful verification.
   Store factor secrets encrypted under an environment-owned key outside Git;
   the current MFA-reference table alone does not store or verify those secrets.
   Key provisioning, rotation and encrypted-secret schema need approval first.
4. Bootstrap: explicit local setup for the first admin, without a default password
   or public bootstrap route. Confirm the intended identity and let the user
   enter credentials directly through the eventual protected setup mechanism.
   Do not grant admins the general ability to create further admins by inference.
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
MFA-foundation increment adds OTPAuth 9.5.2. There is no
account creation, credential provisioning, MFA enrollment, recovery code, login
route or external communication yet. Neither TECH-04 nor BE-08 is complete.

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

## Verification references

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
