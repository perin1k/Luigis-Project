# OPS-01 deployment templates — preparation only

These files are reviewable instructions for the approved Ubuntu/direct-HTTPS
architecture. They are not installed, validated on the host or enabled. They do
not authorize provisioning, packages, accounts, DNS/certificates, jobs, spending,
real data or service restart. Follow the [deployment runbook](../docs/deployment-runbook.md).

## Files and prerequisites

`luigis.service` runs one unprivileged `luigis` OS user/group process from the
operator-owned `/opt/luigis/current` release pointer. Verify the chosen Node
24.14.1 runtime actually resides at `/usr/bin/node`; this template does not install
or select a different runtime. Root/deployer owns releases and the pointer; the
service identity must not be able to edit application code or configuration.

The unit requires the separately mounted data path and an already initialized
database file. It must not silently initialize a new database on the boot disk
when the data mount is absent. The operator must verify the mount's actual device/
filesystem and that it is the intended retained disk; a mount-point assertion
alone cannot identify the correct disk or establish database integrity.

`runtime.env.example` contains non-secret approved paths/origin. Install private
configuration only after authorization; the required MFA key is deliberately
absent, so the template alone cannot start a complete configured runtime. Keep
the separately provisioned payment file service-owned, mode 0600, regular and not
a symlink as required by the existing loader. Root-private environment custody,
separate TLS/MFA/payment material and individual interactive Owner bootstrap are
operator work, not provided credentials. Never commit the populated environment.

The service has only the bind capability for direct port 443, filesystem writes
to the data path plus its private temporary area, private file creation defaults,
and a bounded failure-restart policy. It sends application output to the journal;
actual journal access/rotation and body/secret redaction remain OPS-03/04/07 checks.
No proxy, cluster, default password, automatic cloud restart or snapshot is added.

## Required target-side review, not performed here

After separate authorization and prerequisite setup on the actual Ubuntu host:

1. Verify runtime/lockfile/release, service identity, immutable source ownership,
   mounted disk, database/migration checksums, current seed and private key/TLS
   custody. Run migration/seed explicitly as the intended identity before service
   activation; schema changes are reviewed and additive. Never edit applied SQL.
2. Run `systemd-analyze verify deploy/luigis.service` on that host. Resolve missing
   identity/runtime/path or directive errors instead of removing safeguards.
   Review `systemd-analyze security` as supporting analysis, not a compliance pass.
3. Install only the reviewed unit/private environment after approval. Before
   enabling it, verify that a missing mount/database blocks startup in a disposable
   host rehearsal. Do not unmount or corrupt the working dataset for this test.
4. Verify direct trusted HTTPS, pinned origin, both health endpoints, real customer
   demo confirmation and protected Owner/Admin/Employee access. A running process
   or liveness 200 alone is not readiness or transactional acceptance.
5. Exercise authorized stop/start with retained database/keys and compatible
   release rollback. Record actual SIGTERM cleanup and duration; a 30-second
   systemd stop timeout is not proof of graceful shutdown or the approved ten-minute
   operator recovery target. Review [QA-03](../docs/verification/qa-03-concurrency-recovery.md).

None of these host operations was performed by adding these files. macOS cannot
validate Ubuntu systemd execution, mount namespaces, capability binding or actual
private-file permissions. Keep OPS-01 open until target-side rehearsal passes.

## Release caches and rollback

Choose an exact reviewed commit and lockfile; install locked dependencies without
silently upgrading packages. The application has no separate bundle step. Browser
tools belong on verification workers, not the serving e2-small VM. Startup loads
text assets into memory, and public asset responses can cache for one hour.
Restart on each release/certificate refresh as documented; old browser tabs may
retain old assets during that interval. Do not promise instant cache invalidation.
Before rollout, assess API compatibility and recoverable stale-tab behavior.

Rollback switches only to code compatible with every applied migration. Keep the
data disk, journals and external keys; do not reset data to make an older release
start. [Disposable recreation](../docs/disposable-data-recreation.md) is not restore.
The retained OPS-05 rehearsal proves local interruption/reopen limits; actual
release-pointer rollback, TLS reload and mounted-disk behavior need host evidence.

Directive semantics were reviewed against the primary
[systemd unit documentation](https://www.freedesktop.org/software/systemd/man/257/systemd.unit.html)
and [execution documentation](https://www.freedesktop.org/software/systemd/man/256/systemd.exec.html).
Check the actual Ubuntu systemd version during target validation. Documentation/
configuration review does not establish an installed service or legal/security
compliance, and no quality gate is waived.
