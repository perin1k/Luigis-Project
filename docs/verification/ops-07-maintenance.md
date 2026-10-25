# OPS-07 maintenance and continuity acceptance — October 24, 2026

Brody approved the complete runtime/OS patch, active tooling pins, clean-checkout
deployment, patched-compatible rollback, maintenance guidance, controlled restarts
and GitHub/Trello synchronization. Existing group work, credentials, database,
migration history and historical evidence were preserved.

## Patched runtime and operating system

The approved baseline is Node 24.22.1 with bundled npm 11.19.1. Package engines,
version-manager files, active workflows and bootstrap agree. Dependency versions
were unchanged; advisory checks passed. Historical 24.14.1 evidence was not
rewritten. The unused older binary is retained root-only, not accepted as rollback.
The actual application executable resolves to the patched runtime directory.

The reviewed OS simulation and installation upgraded only cloud-init to
26.2-0ubuntu1~24.04.2 and zlib1g to 1:1.3.dfsg-3.1ubuntu2.3. No packages were added
or removed and no OS/kernel major upgrade occurred. A controlled guest reboot
loaded updated libraries; the post-boot needrestart check reported current kernel
state and no pending service restart entries in the inspected output.

## Clean checkout and immutable byte compatibility

The source builder refuses dirty checkouts/overwrite and includes only reviewed
source/package paths and public metadata. Private-root exclusion tests passed.
The host independently cloned the public GitHub repository and checked exact
commits; no developer node_modules, database, environment or credentials were used.

The first staged candidate bfbe0c4 failed schema readiness and was never activated:
Linux Git archive exported LF where the existing hosted migrations require their
original CRLF bytes. The fix uses explicit, archive-only migration attributes and
ignores personal auto-CRLF settings. No repository/worktree SQL, applied checksum,
database history or existing release manifest was edited. A new immutable release
was prepared; the failed candidate remained unaccepted.

Deployed commit `8ad900a2bbda07570c0df4fb7d1ebd6258986f2a` has source-archive SHA-256:

`6e7f1fba45a83adf1044c9d2f1f46e786b70e995245ec73998e15839a709170e`

Windows/macOS/Linux CI artifacts, local canonical build and the independently
built VM archive matched byte-for-byte. Downloads contained only source/public
metadata. Accepted application source aca76e7 was also rebuilt under Node 24.22.1
as the compatible fallback, preserving original directories/manifests. Both source
and retained-schema ready checks passed with zero pending migrations.

Actual activation, rollback to the patched-compatible fallback and forward
restoration all passed trusted HTTPS readiness. Before/after this sequence,
staff/credential/ownership/MFA/recovery/schema digests, DB inode and SQLite
integrity/foreign-key checks matched. No hosted seed, key/account replacement or
data reset occurred. The later helper layout guard in 2377910 supports legacy and
fresh-bootstrap directory layouts; syntax and final native CI passed.

## Reboot and private human acceptance

Guest boot identity changed; boot time was 18:25:53 UTC. Application, DNS,
log-retention and certificate timers started automatically. The data disk retained
its UUID and nodev/nosuid/noexec mount options. Public trusted live/ready/preview
probes returned 200. An early poll was not accepted as reboot proof; actual boot
identity, service state and later public health were verified.

After boot, SQLite integrity/foreign-key checks passed, the single Owner and all
15 migrations remained, private environment/payment/TLS/database modes were
correct, DNS updater Result=success and the real process used
`/opt/luigis/runtimes/node-v24.22.1/bin/node`. Brody explicitly confirmed successful
Owner sign-in with his existing password/authenticator after the update. No
credentials or codes were requested or recorded. This is intact-VM guest recovery,
not proof of Spot reallocation, backup restore or an availability guarantee.

## Verification

- Local patched-runtime release/host/auth/TLS/monitoring checks passed (39 tests),
  plus source-packaging/unchanged-SQL-byte tests.
- Clean-checkout/full-unit/advisory/source-artifact matrix passed three OSes in
  [40120195853](https://github.com/perin1k/Luigis-Project/actions/runs/40120195853).
  Final helper-layout matrix passed in
  [40120922592](https://github.com/perin1k/Luigis-Project/actions/runs/40120922592).
- Real disposable Ubuntu systemd/private-key/TLS/mount/release/schema-rollback
  rehearsal passed on the patched runtime in
  [40119827367](https://github.com/perin1k/Luigis-Project/actions/runs/40119827367).
  Its unchanged service contracts are reused; archive changes have direct native
  digest and retained-host evidence above.
- Required native storage jobs passed in
  [40120195859](https://github.com/perin1k/Luigis-Project/actions/runs/40120195859).
- Required Windows/macOS/Ubuntu staff services/browser/native-reference jobs passed
  in [40120195892](https://github.com/perin1k/Luigis-Project/actions/runs/40120195892).
  Optional Windows WebKit diagnostic failure remains visible under the approved
  platform policy. No real Safari claim or weaker cookie protection is implied.
- The superseded bfbe0c4 staff run was cancelled by existing concurrency rules and
  is not counted as a pass. No screenshot baseline was replaced or broad Lighthouse
  result invented; final hosted QA gates remain on their original cards.

## Original acceptance criteria

| Criterion | Accepted evidence |
| --- | --- |
| Supported versions and repeatable update/test/release/rollback | Patched pins, source builder, guarded maintenance procedure, native CI and actual rollback/forward rehearsal |
| Renewal/credential lifecycle and responsibility | Existing exercised Certbot/DuckDNS/custody controls and current operator responsibilities; no live provider credential fiction |
| Redeploy independent of a personal machine | Fresh GitHub checkouts on three OSes and VM, matching source digests, locked target install and actual redeploy without uploaded private state |
| Maintenance communication and escalation | Approved current-team/operator guide and safe incident/credential/payment escalation; future receiving-person acceptance stays DOC-01 |
| Cost/account/support exclusions | Sponsor/repository ownership, preview deadline/retained charges, non-cap budgets, unverified credit coverage and explicit support exclusions |

[Maintenance guide](../maintenance-continuity.md) provides commands and file
responsibilities. All original OPS-07 criteria are satisfied for the approved
preview/team; OPS-07 may move Done. OPS-06 publication, broader hosted QA and
DOC-01 receiving-person handoff retain their own original acceptance criteria.

References: [Node security release](https://nodejs.org/en/blog/release/v24.22.1),
[security advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases),
[orderly Compute Engine reboot](https://docs.cloud.google.com/compute/docs/instances/reset-instance).
