# OPS-03 private configuration and credential custody

Brody approved this implementation on October 23, 2026. Public hosting remains
subject to OPS-02/06's separate resource, cost and execution review. This guide
does not provision IAM, a VM, a certificate, a real key or an application account.
Actual-host acceptance is recorded in [OPS-03 evidence](verification/ops-03-custody.md),
including the separate private Owner confirmation. This procedure itself does not
provision resources; the approved executed hosting scope is recorded there.

## People, application accounts and operating-system identities

These are separate permission boundaries:

- The authorized operator controls GCP/IAP access, deployment, root-owned release
  folders and private configuration. An application Admin is not a cloud operator.
- The Linux identity `luigis` runs one application process. It has no login shell,
  public SSH access, deployment rights or cloud-administration credentials. Do not
  attach broad cloud API permissions to the VM/application or copy gcloud's local
  credentials there. Actual IAM and VM service-account settings require OPS-02.
- The human's application Owner account manages Admin/Employee roles. Admins may
  manage Employees only. Each person has an individual account; Owner/Admin use
  an authenticator. No setup script supplies shared passwords or default accounts.

The application must read its encryption keys to operate. Root and the running
application can therefore access key material. File permissions and systemd's
read-only source/configuration boundary limit access; they do not protect keys
from a compromised authorized application process or root operator.

## File guide and approved injection approach

| File | Purpose |
| --- | --- |
| `scripts/setup-host-secrets.js` | Root-only Ubuntu CLI creates a new private configuration directory and fresh independent MFA/payment keys; stages payment-key rotation without activating or dropping old versions |
| `scripts/validate-host-layout.js` | Service-user checks for private DB/journals/TLS/payment files, root-controlled environment/release/runtime paths and immutable dependency/source ownership |
| `scripts/validate-runtime.js --host` | Existing TLS/origin/key validation plus the hosted layout checks; the systemd unit requires this mode |
| `tests/unit/host-secrets.test.js` | Fresh environment separation, no overwrite, unsafe path/input rejection, retained decryptability and full-ring refusal |
| `tests/operations/rehearse-ubuntu.js` | Actual disposable root/service identities, generated configuration, unit startup rejection for unsafe permissions/missing keys and staged payment-key reload |

The selected design retains the approved protected host files and systemd
EnvironmentFile; it adds no cloud secret vault or paid service. The root-owned
environment file injects the existing MFA key setting; the payment setting is a
file path. Root owns the configuration directory and environment file. The
payment loader requires the payment file to be owned by the service identity.
TLS files are privately installed for the same identity. systemd makes `/etc`
read-only inside the application service, even though that identity owns its
readable key files. Do not run unrelated programs as that service identity.

Environment variables are visible within an authorized process; this is not a
secret vault. Never print `env`, `/proc/.../environ`, the environment file or key
JSON, use shell tracing, put values in command arguments, or upload raw service
diagnostics. The setup/validation commands deliberately print fixed status only.

## Initial installation after separate host authorization

First prepare the approved root-controlled release/runtime and dedicated service
identity, and verify the actual private data-disk mount. No developer database or
key is copied to the host. Use the pinned Node runtime from OPS-01.

In a private root terminal on that approved Ubuntu host, replacing `<commit>`
with the reviewed full release ID:

```sh
/opt/luigis/runtime/bin/node /opt/luigis/releases/<commit>/scripts/setup-host-secrets.js create /etc/luigis /var/lib/luigis-data /opt/luigis/releases/<commit> https://luigispizzeria.duckdns.org hosted-demo
```

All arguments above are non-secret paths/settings. The command generates two
independent random keys and writes mode-0600 files directly. It creates the new
directory privately, then grants traversal only after setting payment-file
ownership. It refuses existing directories, including partially completed setup.
If interrupted, preserve the private partial state for operator inspection; do
not delete it or regenerate keys blindly. No TLS certificate is issued here.

Required final ownership/modes:

| Path | Owner / mode / purpose |
| --- | --- |
| `/etc/luigis` | root, 0711; service can traverse known private paths, cannot list or modify this directory |
| `/etc/luigis/runtime.env` | root, 0600; systemd reads it, ordinary staff/service shell cannot |
| `/etc/luigis/payment-keys.json` | luigis, 0600, regular file with one link; no source/data placement |
| `/etc/luigis/tls` | luigis, 0700; certificate installation remains OPS-02 |
| TLS key and full chain | luigis, 0600, regular files; current matching hostname/certificate/key |
| Data directory | luigis, 0700; actual required mount, private SQLite/journals |
| SQLite and existing journals | luigis, no group/other permissions; no symlink/hard-link copies |
| Runtime, releases and their parent folders | root-controlled, no group/other writes; dependency links remain inside the release |

Host startup refuses these policy failures. POSIX mode checks do not establish
Windows ACL protection; real host installation is Ubuntu-only. Portable unit
tests on Windows/macOS check file content and safety logic, not deployment there.

Use separate `local-demo`, `ci-demo` and `hosted-demo` configurations/databases.
Each initial setup generates fresh keys. Never copy a developer/CI environment,
database, test password, authenticator seed or guest link into the hosted runtime.
`LUIGIS_ENVIRONMENT` is an operator label, not cryptographic proof that someone
has never copied a key. Actual isolation/custody must still be inspected.

## Private Owner enrollment and handoff

After the real host's data/migrations, private configuration and trusted HTTPS are
ready, use the existing `npm run admin:setup` flow in a private interactive
terminal with the intended DB/MFA environment available. Do not source an
unreviewed file as shell code; the protected systemd environment format is not a
general shell script. The authorized operator must arrange this private terminal
under the reviewed host procedure; it must not run through recorded CI/chat output.

On the separately authorized Ubuntu host, an operator can use systemd's private
interactive PTY to inject the root-private EnvironmentFile while running the
existing setup program as `luigis`. Review/execute this only in the human's own
unrecorded terminal, after verifying the mount and while the application is stopped:

```sh
systemd-run --unit=luigis-owner-setup --pty --wait --collect --service-type=exec \
  --property=User=luigis --property=Group=luigis \
  --property=WorkingDirectory=/opt/luigis/current \
  --property=EnvironmentFile=/etc/luigis/runtime.env --property=UMask=0077 \
  --property=NoNewPrivileges=yes --property=ProtectSystem=strict \
  --property=RequiresMountsFor=/var/lib/luigis-data \
  --property=AssertPathIsMountPoint=/var/lib/luigis-data \
  --property=ReadWritePaths=/var/lib/luigis-data \
  /opt/luigis/runtime/bin/node /opt/luigis/current/scripts/setup-admin.js
```

This is a reviewed operator command awaiting actual private-host acceptance, not
an executed enrollment. `--pty` connects the setup program's input/output to the
operator's terminal; it does not ask the assistant to receive those secrets.
The [systemd-run documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html)
describes this interactive service mode. Do not substitute recorded output or
an unattended/default-password bootstrap for that private human step.

The human enters an individual username and hidden password, imports the private
authenticator provisioning information directly into their app, confirms a current
code and saves single-use recovery codes privately. Do not send any of them to
the assistant, Trello, GitHub or an external QR service. No account commits until
factor confirmation. Sign in on the actual HTTPS site and verify the Owner role.
Existing Owner setup must not be repeated to create another Owner.

Record only who holds operator/key/recovery responsibilities, the environment,
release and completion of private checks. Transfer access through an approved
private channel or in person, then verify the receiving person's access. Do not
attach keys/codes to a handoff document. DOC-01 retains receiving-person acceptance.

## Rotation, revocation and recovery

**Payment key:** while the existing active ring remains untouched, stage a new
version in its private directory:

```sh
cd /opt/luigis/current
/opt/luigis/runtime/bin/node scripts/setup-host-secrets.js prepare-payment-rotation /etc/luigis/payment-keys.json /etc/luigis/payment-keys.next.json
```

The candidate has a new active key and retains all prior keys. It refuses an
existing candidate or an eight-version ring. Verify private ownership, version
IDs and offline old/new synthetic-record decryptability without printing numbers
or keys. Under the authorized maintenance scope, stop the service, retain the
prior ring privately, atomically install the candidate on the same filesystem,
and restart/preflight plus smoke-test. Never remove an old version while retained
ciphertext needs it; await applicable purge or separately reviewed re-encryption.
Restoring the old ring after new writes would lose access to new ciphertext: keep
the combined ring rather than blindly rolling back the key file with the release.

**Authenticator encryption key:** the existing implementation supports one master
key and has no bulk re-encryption tool. The setup command intentionally refuses
to replace it. Do not change that key while encrypted factors remain and claim
existing staff can still sign in. A missing/incorrect original key denies factor
verification; startup's syntax/permission check alone cannot prove it is the right
key. Owner/Admin sign-in on the real environment is a required custody check.
If a key is lost, restore the original only from an authorized private retained
copy if one exists; it cannot be recreated from the database. Recovery codes do
not reconstruct the encryption key. If compromise is suspected, restrict/stop
service, preserve protected state and require a separate reviewed MFA master-key
migration/re-enrollment plan before resuming. This guide does not pretend that
restoring a compromised key or resetting one factor remediates master-key compromise.

**Passwords, factors and sessions:** use the existing authorized recovery and
account-management flows. Replacement/recovery revokes the affected sessions,
proofs and old recovery codes under their implemented policies. Deactivation
revokes access; reactivation requires a fresh sign-in. Do not edit authentication
tables manually or pass credentials through environment variables/CLI arguments.

**TLS/DuckDNS/operator access:** TLS renewal must atomically install a matching
private pair and restart the service; OPS-02 owns real renewal verification.
DuckDNS's token belongs only to its operator updater, never Node's environment
or release. GCP login credentials stay with the operator. Actual grants/revocation
and log/copy access need target review; no broad cloud permissions are added here.

Keep DB/key lifecycles aligned. Application retention does not erase external
copies or backups. Do not delete real keys, retained data or someone else's files
without explicit cleanup authorization. No mandatory app-managed backup or durable
business recovery guarantee has been approved for this disposable demonstration.

References: [authentication](authentication-design.md), [payment key format/lifecycle](demo-payment-design.md),
[systemd execution settings](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html),
[Node file creation](https://nodejs.org/download/release/v24.14.1/docs/api/fs.html),
[deployment guide](../deploy/README.md), [OPS-03 evidence](verification/ops-03-custody.md).

## Executed sponsor custody — October 24, 2026

Brody is the current GCP/DuckDNS operator and application Owner. His verified
operator login controls root access through IAP/OS Login; application staff roles
do not confer cloud access. The VM has no attached cloud service account/scopes.
Existing project-level Google service-agent/default-account grants were inspected
and preserved; they were not attached or delegated to the application.

Hosted MFA/payment keys remain in private VM configuration outside source and data;
the application receives only its required key access. DNS credentials remain
operator-only and reach the separate DynamicUser updater through LoadCredential.
TLS originals are Certbot/root-controlled; private service-readable generations
are installed atomically. Operator SSH keys are confined by Windows ACLs to the
owner, Administrators and SYSTEM. The local DuckDNS copy is Windows-user-encrypted,
not plaintext; uploaded transfer copies are ciphertext and the temporary VM
private transfer key was removed. Generated archives/ciphertext remain Git-ignored.

Brody confirmed replacement authenticator enrollment, private storage of the new
recovery codes and hosted Owner sign-in. No new credentials were supplied in chat.
Selected service/bootstrap/DNS journals, Certbot log and three source archives
were checked in memory for actual hosted key/token values; none matched. The
service identity cannot read operator configuration/DNS/log files or alter source.
These are bounded checks, not a universal history/log scan or a security certification.

No additional person received credentials. Future receiving-person handoff remains
DOC-01 and must use a private channel with verified access. No application-managed
backup or recovery after loss of original MFA encryption keys is promised.
