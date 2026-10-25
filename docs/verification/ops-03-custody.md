# OPS-03 custody and environment isolation

October 23, 2026. Brody approved setup tooling, hosted permission checks,
credential lifecycle documentation and focused disposable native verification.
Card: https://trello.com/c/3tuwMEqv. Still In Progress: actual host configuration
and private Owner/operator acceptance are required before Done. This increment
does not provision or publish GCP resources, accept spending, or create live keys.

GCP CLI reconnect: sponsor signed in locally; read-only `projects describe`
confirmed `capstone-510915` lifecycle ACTIVE. No credential/token is printed or
stored in the repository; no account/role/resource configuration changed.
Read-only Compute Engine inventory returned no instances. An actual target is
therefore unavailable for custody/Owner acceptance; provisioning remains OPS-02.

## Implementation and checks

File guide/procedure: [custody guide](../secret-custody.md). Initial new tests
failed with a missing setup module, then passed after implementation. Local
Windows x64/Node24.22.1 checks cover fresh independent keys, no overwrite,
source/data/path injection rejection, staged rotation preserving older
decryptability and source bytes, and refusal to discard versions at ring capacity.
Existing release/runtime regression checks also pass. Native results follow;
Linux host checks are not inferred from Windows file-mode behavior.

## Native results and failure history

[Initial native run 40057264455](https://github.com/perin1k/Luigis-Project/actions/runs/40057264455)
tested `1f54f2fadd056de4a9b14b57517d1dbf1090b7d6`: all eight focused portable
checks passed on Windows Server2022 x64, macOS15.7.9 arm64 and Ubuntu24.04.5 x64,
Node24.14.1/npm11.11.0. Ubuntu's real service preflight then failed. Follow-ups
40057517770, 40057698821 and 40057836633 retained the failure and narrowed it with
fixed categories/numeric metadata only: the staged Node executable was owned by
runner UID1001, rather than root. The runner's `/opt` also originally had mode0777.
Neither condition satisfies the selected protected-host policy.

The disposable rehearsal now stages the actual executable as a root-owned regular
file, sets its deployment parent permissions explicitly and temporarily makes the
runner's `/opt` root-controlled, restoring its original owner/mode during cleanup.
The production check is not weakened. Copied release dependency symlinks are kept
verbatim, so they remain inside their own immutable release; lexical and resolved
root-path ancestry are both checked. Each intentional rejection resets its own
unit failure state and requires an actual preflight exit failure, avoiding false
passes caused by a restart-rate limit.

[Passing Ubuntu run 40058001297](https://github.com/perin1k/Luigis-Project/actions/runs/40058001297)
tested `94a9a3704ef46138e13c3c6fd3ecfac372a604df`. All eight focused checks passed,
zero failures/skips. The real unit additionally passed private generated initial
configuration/no overwrite, ready HTTPS443 as the unprivileged identity with only
the bind capability, crash restart, rejection of unsafe DB/data/env/source modes,
wrong payment-key owner and missing key, staged payment-key reload with unchanged
MFA environment, stopped release/compatible rollback, incompatible additive-schema
rollback refusal/forward recovery and missing-mount/boot-decoy refusal.

Windows/macOS portable results are reused after impact review: successful setup,
rotation and portable preflight behavior are unchanged; subsequent changes are
Linux-only ownership/layout diagnostics and the disposable service rehearsal.
Final local Windows Node24.22.1 focused checks also pass after reconciliation.
No UI/authentication policy, dependency or database migration changed, so broad
browser/manual/Lighthouse runs were not repeated. Existing
[SEC](sec-acceptance.md) and [staff acceptance](../staff-acceptance.md) retain
the actual authentication/recovery coverage with their documented environments.

The unchanged `mfa-service.test.js` includes missing/wrong/destroyed encryption-key
denial. This is reused primitive evidence, not proof that a wrong valid-format MFA
key is detected by startup syntax checking or that bulk MFA rotation exists.
New staged payment rotation is verified independently with both old/new ciphertext.

The actual systemd unit now calls runtime preflight with `--host`, requiring
unprivileged Linux, private DB/journals, protected environment, service-owned
private TLS/payment files and root-controlled immutable releases/dependencies.
The default portable preflight remains available for development/testing; it
does not bypass the explicit hosted unit's required policy.

The approved file-based injection approach is preserved. No new library, schema,
cloud vault, public endpoint or default staff credential is added. MFA single-key
limitations are explicit; no bulk rotation or successful recovery after key loss
is fabricated. Setup never overwrites an existing MFA environment.

## Acceptance map

| Criterion | Current evidence / remaining work |
| --- | --- |
| Approved secret storage/injection and least privilege | PASS in disposable native service; real hosted identities/permissions still need inspection |
| Environment separation | PASS for fresh keys/private CI configuration and source/data rejection; real-host isolation still needs target review |
| Issuance/rotation/revocation/handoff | Implemented private issuance/staged payment rotation; existing account recovery/revocation evidence reused; MFA master-key migration is unsupported and must not be claimed |
| Build/log/history protection | Generated secrets excluded from source by path guards, fixed CLI diagnostics and no secret/database artifact upload; actual host logs/copies/operator access pending |
| Controlled initial Owner | Existing private interactive confirmed-MFA bootstrap retained; actual human enrollment/sign-in/recovery custody remains pending with OPS-02 |

No screenshot/report is delivered in chat. Valid TEST/SEC and OPS-01 evidence is
reused where unaffected; changed unit/preflight/setup behavior gets focused native
verification. Existing application auth roles/primitives/migrations are unchanged.

Actual-host blockers remain on this original card: approved GCP resource/identity
configuration, real file/ACL and log/copy custody inspection, private Owner MFA/
recovery-code enrollment and actual HTTPS sign-in, and authorized human custody
handoff. Do not mark OPS-03 Done from this repository/CI checkpoint. Instructions
and synthetic tests do not substitute for those private operator actions.

### Actual-host follow-up — October 24, 2026

The earlier unperformed-host statements above describe the initial checkpoint.
Approved resources, hosted identity/file isolation, DNS and TLS installation/
renewal are now recorded in [OPS-02 hosted evidence](ops-02-hosted.md). Brody has
explicitly confirmed successful replacement QR enrollment, private storage of new
recovery codes and actual hosted Owner sign-in; see
[QR acceptance](ops-03-authenticator-qr.md). The private Owner setup/sign-in gate
is satisfied. Remaining full custody/log/copy/operator review and native QR CI
acceptance must still be completed before marking OPS-03 Done.

### Full OPS-03 acceptance — October 24, 2026

The remaining review above is now completed. Actual host stat/access checks
confirmed root `0600` environment and DNS token, service `0600` payment/TLS/data
files and `0700` data/TLS directories. The application runs as `luigis`, with
NoNewPrivileges, strict read-only system protection, private home/temp and only
the HTTPS bind capability. It cannot read operator environment/DNS/Certbot logs
or modify the active release. Persistent mount protections remain intact.

Instance OS Admin Login is assigned to the verified sponsor; OS Login/project-key
blocking and disabled serial access are configured. No service account/scopes are
attached. Existing project owner/default-account/service-agent bindings were
reviewed without broadening or deleting them. Sponsor SSH private-key ACLs allow
only owner rights, local Administrators and SYSTEM. The named local DNS token
copy is DPAPI ciphertext; generated deployment files are Git-ignored. The VM
one-time transfer private key is absent.

A bounded VM-memory comparison of actual MFA/payment/DNS values against the
application/bootstrap/DNS journals, Certbot log and three deployment source archives
found no matches. Bootstrap journals also contained no provisioning URI, private
key marker or recovery-code-shaped value. No secret content was printed or saved
by this inspection. Journal files are root/systemd-journal `0640`; Certbot's log
is within its root-only `0700` directory and unreadable by the application.

Required native QR staff jobs all passed on Windows, macOS and Ubuntu in
[40079701553](https://github.com/perin1k/Luigis-Project/actions/runs/40079701553).
The optional Windows WebKit diagnostic failure remains visible under the approved
platform policy. Earlier missing/invalid/staged-rotation service tests and actual
Ubuntu rejection/reload evidence remain valid; no live key rotation was necessary
or performed. No unsupported MFA master-key rotation is claimed.

The human-reported hosted replacement/Owner sign-in and private recovery-code
custody are recorded in [QR acceptance](ops-03-authenticator-qr.md).
[Custody guide](../secret-custody.md) records Brody as the current verified
operator/custodian, credential lifecycle and private handoff procedure. No other
recipient was introduced; DOC-01 retains future receiving-person acceptance.

All five original OPS-03 criteria are satisfied for the approved hosted demo:
protected injection/least-privilege service, separate fresh environment keys,
documented/tested lifecycle, bounded artifact/log/operator protections, and
controlled verified Owner setup. OPS-03 may move Done. OPS-02/04/06/07 and hosted
QA/DOC acceptance retain their own criteria; this is not complete-project acceptance.
