# Maintenance and continuity — OPS-07

> For developers and technical website support. Restaurant staff and owners using
> the website should start with [Using your website](handoff.md) and
> [Find the right guide](README.md). This technical reference is not an everyday user manual.

## Supported baseline and people

Current hosted transport is public Nginx HTTPS to authenticated loopback Node TLS.
Use [the proxy operator guide](nginx-proxy.md) and
[OPS-08 evidence](verification/ops-08-proxy.md) alongside this guide. Preserve both
services, private proxy configuration and the capability-removal drop-in during
maintenance. Current source includes customer migration 016; fallback source must
support that schema. The original direct-HTTPS source is not a compatible fallback.

The reviewed patched baseline is Node.js 24.22.1 with bundled npm 11.19.1 and the
committed lockfile, on the existing Windows/macOS/Linux development targets.
`package.json`, `.node-version`, `.nvmrc`, active CI and Ubuntu bootstrap agree.
The hosted target remains Ubuntu 24.04 amd64. Historical evidence for older
runtimes remains unchanged; it is not proof for a newer binary. No operating-system
major upgrade or framework/library replacement is part of routine patching.

Brody is the current preview operator and GCP/DuckDNS/Owner custodian. Perin owns
the repository; application roles do not grant cloud access. Team communication
uses the already established team channel/meeting arrangements; this guide does
not create a new meeting schedule or authorize automated teammate/customer messages.
Future receiving-person acceptance remains DOC-01.

## Repeatable patch, test, release and rollback

1. Review official runtime/OS advisories before a preview release and at least
   weekly while this preview runs. Triage urgent advisories promptly. Record exact
   candidate versions, compatibility, downtime, retention/key effects and a concrete
   plan. Get approval for dependency, runtime, infrastructure or consequential
   configuration changes; do not run unattended major upgrades or `npm audit fix`.
2. Begin on `dev` or an approved feature branch with unrelated work preserved.
   Pin the reviewed tools, install locked dependencies and inspect `npm audit`.
   An audit pass covers that dependency check, not the runtime/OS or all security.
   Applied migrations and existing accepted release manifests are immutable.
3. Verify affected auth/crypto/TLS/storage, source/release and connected flows.
   Runtime changes justify broader unit/native verification; unchanged visuals
   reuse valid evidence, with final hosted browser/manual/Lighthouse gates retained.
4. Build from a clean checkout using `node scripts/build-release.js`. This creates
   only canonical Git `src/`, `scripts/`, `deploy/` and package manifests, plus public
   commit/hash/tool metadata under ignored `reports/source-release/`. Dirty checkouts
   and overwrite are refused. No workstation node_modules, database, environment,
   credentials, private logs or test identities are copied into the artifact.
   Archive conversion is explicit: migrations retain the established hosted CRLF
   bytes through `deploy/archive-attributes`, while personal Git auto-CRLF settings
   are ignored. This changes only archive export, not repository/worktree SQL or
   database checksums. Local databases retain their own original file-byte contract;
   do not normalize applied migrations or overwrite a failed staged manifest.
5. On the approved Ubuntu host, stage the patched runtime using
   `sudo bash deploy/maintain-host.sh stage` from the reviewed source checkout.
   It verifies the official distribution checksum before extraction. Prepare each
   approved commit with `sudo bash deploy/maintain-host.sh prepare FULL_COMMIT_SHA`;
   the host independently clones
   the public repository, checks the exact commit, installs locked production
   dependencies without lifecycle scripts and creates a new integrity manifest
   under that runtime. No hosted migration, seed, data/key replacement or initial
   Owner creation is performed. Compare the source digest with clean CI metadata.
6. Prepare both the new release and a known compatible fallback under the patched
   runtime. Run read-only source/schema readiness checks first. Execute
   `sudo bash deploy/maintain-host.sh activate NEW_SHA FALLBACK_SHA` in a maintenance
   window. It stops the service, switches protected runtime/release pointers and
   requires trusted HTTPS readiness. Its failure fallback uses the patched runtime;
   failure to recover still requires operator investigation, not a data reset.
   Existing unversioned runtime directories are preserved without overwrite,
   including the fresh-bootstrap layout. An old unpatched binary is not an
   accepted recovery target; keep any retained copy root-only.
7. Rehearse rollback to that patched-compatible release and forward activation.
   Verify minimal probes, database integrity, retained staff/security records,
   real HTTPS and a private human sign-in. Restore the current reviewed release.
   Never edit old manifests or applied SQL to make rollback pass. A rollback cannot
   remove an already applied incompatible schema change; use a reviewed forward fix.
8. For OS packages, inspect a simulation and apply only reviewed updates. Check
   reboot/service-restart requirements and coordinate any needed restart. A normal
   guest restart is different from an abrupt reset or Spot stop/reallocation.
   Never silently resize or replace a Spot VM if capacity is unavailable.

File responsibilities: `scripts/build-release.js` is platform-neutral packaging;
`deploy/maintain-host.sh` is the explicitly Ubuntu-only operator procedure; the
maintenance CI verifies clean checkouts across three OSes. The original bootstrap
installs fresh systems and deliberately refuses unreviewed in-place runtime changes.
Its data-device safeguards and no-overwrite key setup remain intact.

## Lifecycle and continuity

- Certbot owns the free Let's Encrypt registration/renewal; its timer and matching
  private-pair deploy hook were exercised under OPS-02. Brody checks renewal timer,
  expiry and actual hostname after maintenance; never paste key material into logs.
  OPS-08 also exercised `renew --dry-run --run-deploy-hooks`: the installed hook
  updates Node's private TLS pair and checks/reloads active Nginx. An ordinary
  renewal must preserve that dual-service behavior. The proxy's status-only journal
  has the same retention bounds; use its process query from the proxy guide.
- DuckDNS ownership/token remains with Brody. Its separate private updater refreshes
  the ephemeral IPv4 at boot/every five minutes. After VM interruption, check the
  mounted data disk, key access, DNS result, certificate and all minimal probes.
  A changed IP is not recovered until the public hostname resolves and serves TLS.
- Authenticator/recovery codes stay private with the Owner; credentials and payment
  keys follow [custody](secret-custody.md). Application factor recovery cannot
  reconstruct a lost MFA encryption master key. Do not rotate it casually. There
  is no active merchant/provider key or webhook to renew in this demo.
- Monitoring emails go to the verified operator. An outage requires separating
  DNS/TLS/VM/process/readiness, preserving original order/payment identifiers and
  consulting [incident runbooks](operations-monitoring.md). A restored home page
  alone is not transaction recovery. Logs are private and bounded while their
  retention jobs run; stopped retained disks are not erased automatically.
- Clean redeploy restores application code/runtime, not lost business data or
  encryption keys. This approved disposable demo has no application-managed backups.
  Recreate only into a new empty path with fresh identities when explicitly desired;
  never seed over the existing hosted database to make a rehearsal pass.

## Communication, accounts, cost and support boundaries

Before planned maintenance, Brody tells the team which environment, expected
interruption, operator and fallback are involved through the existing channel.
Afterward he reports actual results and unresolved issues. For an unplanned incident,
the monitoring route alerts Brody; he coordinates team/client communication and
escalates credential/payment anomalies promptly with safe IDs/times only. No
automatic cancellation, refund, external customer message or destructive recovery
is authorized by an operational alert.

The sponsor controls project `capstone-510915` billing and DuckDNS; repository
ownership remains with Perin. Existing credits are not guaranteed bill coverage.
The USD 25 monthly alert and USD 10 preview planning allowance are not hard caps;
VM/disk/network and other project usage can still incur costs. Monitoring was
planned below its current free execution allowance without cloud log export.
Recheck prices/usage before extending or transferring the environment.

The approved VM STOP deadline is November 1, 2026 at 11 PM America/Chicago
(November 2 at 05:00 UTC). Retained disks/keys continue to exist and storage costs
continue after stop. Deletion, longer operation, snapshots, a production billing
account, personal credential transfer or a different service plan require separate
review. Handoff transfers responsibilities/access privately; it does not transfer
the sponsor's personal Google credentials or silently assign ongoing costs.

No paid support contract, 24/7 staffing, uptime SLA, measured kitchen capacity,
guaranteed Spot restart, lossless recovery, real merchant payment acceptance or
production regulatory compliance is included. Future business operations need
their own service/integration/support agreement and receiving-owner acceptance.
