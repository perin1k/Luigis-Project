# OPS-02 / OPS-03 actual-host checkpoint — October 24, 2026

Status: In Progress. Brody's approved hosting/custody work; this does not replace
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

## Still required before acceptance

- Human-only initial Owner password/authenticator/recovery enrollment and actual
  HTTPS sign-in; confirm sponsor custody without recording credentials.
- Actual application startup/health/public entry/access/robots verification and
  graceful restart with retained data; inspect hosted service/key isolation.
- Preserve the linked hosted QA requirements; a valid certificate and provisioned
  VM do not establish customer/employee/admin acceptance or Lighthouse scores.

The app remains stopped until the private initial Owner enrollment succeeds.
No card is marked Done from this intermediate checkpoint.
