# Maintenance and continuity — OPS-07

Prepared October 23, 2026. Hosting remains on hold. This procedure authorizes no
installation, upgrade, restart, notification, spending or credential change.
Use the [deployment runbook](deployment-runbook.md) for the approved target and
[secret custody guide](secrets-operations.md) for private operator handoff.

## Repeatable update procedure

1. Record the deployed commit, lockfile hash, actual Node/npm and Ubuntu versions,
   database migration state, certificate expiry and current operational health.
   `package.json` requires Node >=22.19; the rehearsed version is Node 24.14.1 /
   npm 11.11.0. A minimum engine declaration does not certify every later version.
   Dependencies resolve from `package-lock.json`, including transitive packages.
2. Review runtime, OS and dependency security notices before a release or proposed
   update. Record affected version, reachable feature, available mitigation and
   proposed fixed version. Do not run unattended `npm audit fix`, upgrade all
   dependencies, disable protections or silently normalize immutable migrations.
3. Propose a focused development-branch update with dependency/runtime purpose,
   compatibility impact, affected checks and rollback compatibility. Obtain the
   applicable review before changing versions or host software. Keep security
   findings visible even when a workaround is present.
4. Reproduce in a new checkout with `npm ci`; run relevant failure/boundary tests,
   then the affected TEST/QA browser/platform checkpoints. Preserve native visual
   references and record changed behavior. Security controls receive immediate
   focused verification. Reuse unaffected evidence after impact review.
5. Before an authorized maintenance window, have a reviewed immutable release,
   private mounted data/keys, schema-compatible previous release and operator
   available. Communicate expected interruption through the team's agreed channel;
   no channel/address, notification automation or support contract is established
   by this guide. Obtain the sponsor's maintenance-window agreement.
6. Apply only the reviewed release and additive migrations. Verify trusted HTTPS,
   readiness, a genuine synthetic checkout/retry, protected staff permissions,
   retained records and workers. Record durations and failures. A liveness response
   or package installation alone is not acceptance.
7. On failure, stop publication and use the runbook's schema-compatible rollback
   or reviewed forward fix. Keep the existing database and keys. Never downgrade
   SQL, replace data or generate replacement payments to hide failure.

## Lifecycle and responsibility

| Item | Operator action / boundary |
| --- | --- |
| GCP and billing | Sponsor-owned project; sponsor reviews alerts and continuing disk/IP/log costs. $25/month alerts do not cap spend. No new account ownership or cloud permissions are granted here. |
| Spot interruption | Sponsor restarts when capacity permits; verify mounted disk, keys, DNS, TLS, database and transactions. Ten-minute restart target applies only with VM/disk/keys intact; no continuous-availability promise. |
| DuckDNS | Authorized operator verifies hostname/account control, private token custody and successful boot/five-minute updates. Actual updater/timer and failure handling remain uninstalled and unverified. |
| Certificate | Authorized operator records issuer/expiry, validates renewal rehearsal and complete private certificate-pair installation, then Node restart. No renewal timer/hook has been installed or tested. |
| MFA/payment keys and staff access | Follow the custody guide and individual Owner/Admin/Employee permissions. Brody Mensonides oversees account recovery; no shared login, automatic ownership inference or blind MFA-key replacement. |
| Incidents | Follow [monitoring thresholds and incident response](operations-monitoring.md). Sponsor receives operator escalation after approved readiness/worker thresholds or immediately for a confirmed-payment/order mismatch. No external alert is configured or sent. |
| End of demonstration | Approved stop target: November 1, 2026, 11 PM America/Chicago (November 2, 05:00 UTC). Verify unavailability and ongoing storage charges; retain disks/keys pending separate deletion authorization. No shutdown job exists. |

The class team maintains a disposable synthetic demonstration. Real customers,
merchant transactions, provider delivery, durable business recovery, ongoing
support and business transfer are outside this acceptance. The receiving team
must acknowledge the private access handoff and remaining gates under DOC-01;
this document does not claim that acknowledgment occurred.

## Clean-checkout rehearsal and remaining acceptance

The verification record below covers repository reproducibility on the current
Mac only. It is neither a new hosted environment nor recovery of lost data.
OPS-07 remains open for actual Ubuntu redeploy, lifecycle rehearsal and receiving
team acknowledgment. OPS-01–05, SEC-01/02 and DOC-01 retain their own criteria.

On October 23, an archive of commit
`2d821bd067daccf2d95928288f91e4d70286feab` was extracted into a fresh temporary
directory with no developer database, populated environment, keys or node_modules.
Locked installation used `npm ci --ignore-scripts`; the intentional script
suppression means this is not evidence for arbitrary package lifecycle scripts.
On macOS arm64 with Node 24.14.1 / npm 11.11.0, `npm run test:storage`
passed 68 tests and `npm run test:staff:unit` passed 106 tests, with zero failures
or skipped tests in both runs. Install added 193 locked packages successfully.
Local logs are `/private/tmp/luigis-ops07-install.log`,
`/private/tmp/luigis-ops07-storage.log` and `/private/tmp/luigis-ops07-staff.log`;
they are temporary supporting artifacts, not committed release evidence.
Hosted source ownership,
mounts, systemd, trusted public TLS and deployment rollback were not exercised.

The fresh advisory query found **one high-severity runtime dependency finding**:
locked body-parser 2.3.0, [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828).
The publisher identifies 2.4.0 as patched and `inflate: false` as a workaround.
Source review found every project `express.json` parser explicitly disables
inflation, matching that workaround; this is exposure analysis, not a fresh attack
test or a clean audit. Earlier zero-advisory records remain historical. Keep this
finding in SEC-01/release review and review a focused lockfile update separately;
no dependency was changed during this documentation/reproducibility increment.

### Subsequent focused maintenance patch

The next approved increment updates only the locked body-parser package from
2.3.0 to the publisher's patched 2.4.0 within the existing Express dependency
range. Existing resolved child packages already satisfy its updated ranges;
no direct dependency or application parser setting changes. `npm ci
--ignore-scripts` completed; fresh full/runtime-only audits each returned zero
known advisories. See [security review](security-review-evidence.md) for the
advisory and verification boundaries. The original finding above describes the
clean-checkout baseline, not the patched lockfile.
