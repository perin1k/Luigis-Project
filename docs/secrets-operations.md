# OPS-03 secret custody and operator handoff — preparation only

October 23, 2026. Card: https://trello.com/c/3tuwMEqv.
The approved deployment uses private host configuration/external files, individual
staff identities and one unprivileged Node process. No new vault/provider, key,
account, permission, cloud identity or hosted configuration is created here.
Follow [the runbook](deployment-runbook.md) and [review templates](../deploy/README.md)
only after separate host authorization. OPS-03 remains In Progress for execution.

## Selected injection and isolation boundaries

| Material | Current application contract | Custody / separation |
| --- | --- | --- |
| MFA encryption | `MFA_ENCRYPTION_KEY_HEX`, 32 random bytes encoded as 64 lowercase hex characters; no fallback | Operator privately populates root-private `/etc/luigis/runtime.env`, loaded by systemd. Dedicated key per environment; separate from payment/TLS. The resulting process environment is accessible to sufficiently privileged or same-identity processes and inherited children: this is not an isolated secret vault. Do not reuse the service UID for unrelated tools/users. |
| Synthetic payment encryption | `DEMO_PAYMENT_KEYS_PATH` points to a versioned JSON key ring; up to eight versions, explicit active ID | `/etc/luigis/payment-keys.json`, regular non-symlink file owned by the service UID and mode 0600 on POSIX. Keep outside releases, SQLite directory and test fixtures. The loader enforces its current POSIX checks; Windows needs separate ACL inspection. |
| TLS private key / chain | `TLS_KEY_PATH` / `TLS_CERT_PATH`; Node loads them at startup | Operator-managed private files under `/etc/luigis/tls`; only intended service/operator access. Keep the private key out of source/data/artifacts. Certificate renewal must install a validated matching pair and restart Node; no renewal hook is installed here. |
| SQLite / credentials / sessions | `DATABASE_PATH` on the retained private data mount; password hashes and session/invitation/recovery digests in reviewed tables | No SQLite database password or extra default signing credential is part of this stack. Protect the actual database and journals by OS identity/mount permissions; do not copy them into release directories or publish them. |
| CSRF signing material | Existing transport generates random process-memory signing material | No operator-supplied static JWT/CSRF secret is requested. Restart invalidates old process-bound CSRF proofs; refresh/re-authentication follows the existing flow. Persisted sessions retain their own idle/absolute/revocation checks, not an indefinite restart exemption. |
| DuckDNS token | Future approved private updater job, not ordinary application configuration | Keep away from the Node runtime and public request logs/arguments. API token-bearing URLs must not enter shell history/logs. Updater identity/timer and actual rotation remain separate host work. |
| GCP/deployer credentials | Sponsor/operator access through reviewed GCP/IAP/OS Login controls | Application code requires no broad Compute/Storage/IAM administration role. Operator/deployer owns immutable release files and the release pointer; Node must not be able to rewrite them or administer the VM. Actual IAM/service-account attachment has not been inspected. |

Use unique keys, databases, origins, certificates and staff identities for each
developer/test/hosted demo environment. Never upload a developer database/key ring,
fixture account or browser profile to establish hosted access. This is synthetic
demonstration infrastructure; real merchant credentials and provider-native
collection remain future PAY-01. Do not feed synthetic numbers to a live processor.

## Issuance and secure handoff

The sponsor/operator verifies identity and destination before private provisioning.
Generate cryptographically random material through the approved private setup,
not an agent transcript, committed script argument, screenshot, ticket or shared
terminal scrollback. No actual value is needed to review these instructions.
Keep populated environment/key files outside the repository; the environment
example deliberately omits the required MFA key and cannot establish a working
configured service alone. No shared/default Owner password is provided.

Bootstrap the initial Owner only through the existing private interactive
procedure with actual authenticator confirmation. Existing installations require
explicit Owner designation, never automatic promotion of an Admin. Owner/Admin
MFA and the approved role hierarchy remain enforced. Brody Mensonides oversees
the approved recognized-team-member recovery procedure; software cannot certify
the human identity review. See [authentication procedures](authentication-design.md)
and [role policy](staff-role-policy.md). No account/bootstrap command ran here.

Record only non-secret custody metadata: environment, purpose, opaque version ID,
authorized custodian, provisioning/review date, affected release and next action.
Do not put values, recovery codes, raw invitations/tracking grants or exported
customer data in Git/Trello/logs. A private transfer is not permission to share
one login among the team; recipients enroll their own identities/factors.

## Rotation, revocation and loss

- Payment ring: privately add a fresh key/version, select it active and restart
  the configured runtime. New records use it; retain old versions until dependent
  ciphertext is purged or separately reviewed offline re-encryption occurs.
  Ciphertext expires independently seven days after the attempt; masked history
  remains. Do not delete a needed old key or promise lost-key recovery.
- MFA environment key: the current vault has no bulk re-encryption/versioned
  operator key-ring workflow. **Do not blindly replace it while factors depend on
  it.** A compromise/loss requires a separately reviewed account/factor recovery
  and re-enrollment plan. Missing/wrong keys deny authentication; never disable MFA,
  edit stored counters or promote accounts to work around key loss.
- Individual passwords/factors/sessions: use the reviewed password change,
  authenticator replacement, single-use recovery and hierarchy-controlled account
  lifecycle. These invalidate/revoke the applicable sessions/proofs; no public
  contact lookup, default password or employee administrative override is added.
- TLS: use the approved operator renewal/restart procedure and verify the chain,
  hostname, matching pair and rollback before relying on automation. Do not ask
  visitors to bypass certificate warnings. No actual issuance/renewal ran here.
- DuckDNS/GCP/operator access: revoke/rotate at the real service under authorized
  owner control, update only the intended private consumer, then verify DNS/access.
  Provider changes, account prompts and permission expansion are not performed by
  these instructions. Node gets no deployment privileges to simplify rotation.

Stop for an actual incident rather than continue with stale or compromised
material. Approved disposable-data loss means recreation is possible, not recovery
of the old keys/history. Key/data destruction and external-copy cleanup require
separate authorization; no backup/snapshot is silently created or deleted.

## Evidence reuse and target-side acceptance

[QA-02](verification/qa-02-payment-privacy.md) retains the fresh 22-case payment/key/
refund/retention set and bounded SQLite-byte/response/operational-event scan.
Existing `mfa-service.test.js` and `auth-runtime.test.js` cover missing, wrong,
destroyed or modified key material and fail-closed partial configuration; accepted
[TEST-01](verification/test-01-menu-acceptance.md) and the authentication records
retain their actual execution evidence. These are reused scoped results, not a
new runtime test run or proof that a real host is configured. No runtime/dependency
changes in this document justify repeating unaffected broad suites.

Before OPS-03 acceptance, inspect the actual host's identities, mounted data and
private file ownership/modes or Windows ACLs. Verify source/key/data separation,
immutable releases, minimal IAM, protected interactive bootstrap/handoff, startup
with missing/invalid configuration, controlled payment rotation and expected
recovery behavior. Test against authorized disposable data without publishing
values or weakening guards. Review actual journald/cloud logs, retention/rotation,
exports, certificate copies and any optional snapshots; application event redaction
does not prove every external copy/log is clean.

Current review checked source/configuration contracts, local links and diff
content only. No host permission, secret injection, IAM, key issuance/rotation,
certificate or service restart is claimed verified. Unsupported MFA key rotation
is explicitly retained as an operator limitation, not fabricated implementation.
Keep OPS-03 open until those concrete configuration/verification criteria pass.
