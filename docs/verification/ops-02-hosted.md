# OPS-02 / OPS-03 actual-host checkpoint — October 24, 2026

Status: OPS-02 accepted October 24, 2026. Brody's approved hosting/custody work; this does not replace
the team's hosted QA acceptance or claim another developer's work.

## Executed and verified

- Project `capstone-510915`; `luigis-preview`, Ubuntu 24.04 x86-64, e2-small Spot,
  `us-central1-a`. Spot quota granted for two CPUs. No VM service account/scopes.
- Dedicated network/subnet; public TCP 443/80 only, SSH 22 restricted to IAP's
  range. OS Login enabled; project SSH keys blocked. Authenticated IAP SSH works.
- Separate retained balanced 20 GB boot / 10 GB data disks. Data mounted by UUID
  at `/var/lib/luigis-data` with nodev/nosuid/noexec and private service ownership.
  The default network was preserved; no existing resource was deleted.
- Project-scoped USD 25 monthly budget with approved actual/forecast alerts,
  excluding credit offsets. Alerts are not a spending cap. Credit coverage is
  unverified. VM has STOP termination time `2026-11-02T05:00:00Z`; disks remain.
- Node 24.14.1/npm 11.11.0 installed after official distribution checksum check.
  Locked production dependencies installed with lifecycle scripts disabled;
  installation advisory scan passed. Source/runtime are root-controlled.
- Fresh hosted SQLite migrations and baseline seed completed. Private hosted MFA
  and payment keys were generated on the VM; no local developer data was uploaded.
  Environment is root `0600`; payment key and data are service-private.
- Original source release `802fee4885e8bc402e6d0c54876994c47066ad97` preserved.
  Release `49074d773d42f521c3c74a0a3c1989acb88cd7c2` staged with source SHA-256,
  locked dependencies and manifest; integrity/schema ready check passed with zero
  pending migrations before atomic pointer activation while the app was stopped.
- Windows DPAPI token file decrypted only in memory; RSA-OAEP/SHA-256 expiring
  ciphertext transferred through IAP. Root-private VM receiver created token
  `0600`, refused overwrite and removed its one-time private transfer key. No
  plaintext token was uploaded as a file or exposed in command arguments/output.
- Actual systemd credential probe showed `0440` on a per-service read-only
  nosuid/nodev/noexec mount. Initial strict-mode rejection reproduced; focused
  compatibility checks added without accepting ordinary exposed files. Actual
  DNS updater then passed; its five-minute timer is enabled. Public A record
  matched the VM; no AAAA record was returned.
- Certbot issued a free Let's Encrypt certificate for
  `luigispizzeria.duckdns.org`, valid through January 22, 2027. Sponsor explicitly
  approved contact registration/agreement. Root-owned deploy hook corrected to
  execute the installer from the resolved release directory, avoiding a Node
  symlink CLI-entry no-op. Actual installation passed: private TLS directory
  service `0700`, both pair files service `0600`. Certbot renewal timer enabled.
- Certbot's non-interactive dry-run completed after its randomized scheduling
  delay: all simulated renewals succeeded and the corrected deploy hook installed
  the real certificate pair successfully. Application remained inactive as
  intended. The containing diagnostic command returned nonzero only because its
  final `systemctl is-active` check correctly reported that inactive state.

## Reused and new checks

Native Actions run [40075316128](https://github.com/perin1k/Luigis-Project/actions/runs/40075316128)
passed Windows, macOS and Ubuntu at source `802fee4`, including the real disposable
Ubuntu systemd/TLS/mount/release rehearsal. It does not include subsequent changes.
Windows focused `dns-transfer.test.js` and `duckdns.test.js` passed after the
credential fix. Actual Ubuntu DNS service and TLS installer passed as above.
No unrelated browser/manual/Lighthouse suites were repeated for these operator
changes. No source migration or customer-facing behavior changed.

## Actual-host completion

The subsequent QR release `7b627ef7116e9a3aaa2e46a2d11eb706c2256ae8` is active.
The application is running. Brody confirmed private replacement authenticator
enrollment, saving new recovery codes and successful hosted Owner sign-in.
[OPS-03 custody](ops-03-custody.md) records the accepted identity/key/log/copy
inspection and [QR evidence](ops-03-authenticator-qr.md) records required native
Windows/macOS/Ubuntu passes and the visible optional Windows WebKit diagnostic.

An additional actual-host graceful restart passed: the old process exited
normally with status 0 and systemd Result=success, a different new process started,
and trusted HTTPS readiness returned 200 after normal startup retries. Read-only
before/after comparison confirmed unchanged database inode and logical contents
of staff users/credentials/ownership, MFA factors, recovery codes and migration
history. SQLite integrity and foreign-key checks passed. No records, keys or
database files were replaced, seeded or migrated during this check. Private
digests were kept root-only under `/run`; no account values were printed.

Actual hostname public checks passed for `/`, `/order`, sign-in, recovery and
live/ready health endpoints. Menu/hours are the existing `/#menu` and `/#visit`
anchors; `/menu` is not an application route. Account/orders/menu pages redirect
anonymous users to sign-in; Owner analytics returns its designed 403 denial.
Staff/session/menu/analytics APIs return 401/403 without proof. Private and health
responses retain no-store/noindex policy. Public customer pages remain accessible
under the approved exposure model; indexing restrictions are not authorization.
The source, `.env`, setup script, node_modules, database and disposable fixture
paths checked all return 404. No blanket claim about every possible URL is made.

## Original acceptance criteria

| Criterion | Evidence |
| --- | --- |
| Provision only approved resources | Recorded approved VM/disks/network/host identity and stop deadline; no fallback, existing-resource deletion or attached service account |
| HTTPS/origin/network/storage/environment separation | Trusted live certificate, tested renewal hook/DNS updater, pinned direct HTTPS origin, IAP-only SSH and isolated fresh hosted keys/data |
| Retained restricted data across restart/redeploy | Compatible QR release switch plus the actual graceful restart/inode/table-integrity comparison above; private mount/file protections inspected |
| Access/indexing/preview exposure | Public customer entry, private no-store/noindex boundaries and actual authentication denials; private source/data/fixture paths inaccessible |
| Health/restart/entry point/ownership | Actual HTTPS live/ready/public endpoints, clean SIGTERM/systemd exit/restart, human Owner sign-in; Brody controls the verified GCP/DuckDNS operator accounts |
| Verify actual hosted target | All completion checks above used the approved GCP VM and real hostname, with valid trusted TLS |

OPS-02 may move Done. Hosted customer/employee/admin journey, accessibility,
Lighthouse, load/interruption, monitoring/cost and final publication/handoff gates
retain their original QA/OPS/DOC cards. No broad end-product acceptance, durable
backup guarantee or credit coverage is inferred from this card's completion.
