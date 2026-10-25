# OPS-04 hosted monitoring acceptance — October 24, 2026

Brody approved the complete reviewed increment, including real operational emails
to the active GCP operator and the controlled outage/recovery drill. This record
does not certify whole-project readiness or claim another member's QA work.

## Implemented scope

The original redacted worker/request recorder and probes are reused. The preview
worker now has a minimal ready/not_ready HTTPS probe with the same independent
120/minute health budget, no-store/noindex/no-referrer policy and no private details.
No template, browser code, provider integration, database migration or new library
was added. The approved field/ID vocabulary and generic safe errors are preserved.

The installer configures only approved named GCP resources using the existing
operator login, capturing OAuth credentials in memory. Two HTTPS checks validate
certificates/status200/ready content every minute from Oregon/Iowa/Virginia.
Readiness alerts after at least two failed locations sustain three minutes;
preview-worker alerts use ten minutes. Both notify on open and closure to the
enabled operator email channel. Missing samples are not treated as recovery proof.
Repeated configuration verifies scope/thresholds/regions/TLS/contact and refuses
conflicting resources instead of overwriting them. No VM service account, cloud
log agent/export or custom metric-ingestion credential was added.

## Verification

- Focused local tests passed for probes, fail-closed/redacted worker failures,
  recovery/reset, safe request correlation, guard/idempotence/conflict rejection,
  rate limits, timing and planned execution volume. Sandbox loopback restrictions
  initially prevented local HTTP tests; the authorized external-sandbox run passed.
- Required Windows/macOS/Ubuntu focused jobs all passed at `aca76e7` in
  [40118100308](https://github.com/perin1k/Luigis-Project/actions/runs/40118100308).
  Earlier focused runs 40117632037 and 40117923189 also passed. Initial manual
  dispatch returned404 for an unregistered new workflow; its narrow dev push
  trigger registered and ran it. No main-branch change or gate waiver was used.
- Source archive SHA-256, immutable-release manifest and retained-schema readiness
  checks passed before activating `aca76e7d402b36da9e84a85c7f99b97e4282acc0`.
  Existing data/keys were preserved and compatible prior releases retained.
- Trusted public live/ready/preview probes returned 200 with only the minimal
  fixed JSON and no-store metadata. Empty synthetic order/payment requests
  returned their designed 422 validation denial with fresh server-generated IDs;
  actual journal events matched those IDs and contained only approved fields.
  No order/payment was created and no real transaction/provider was invoked.
- The dedicated VM journal uses persistent 64 MiB/runtime 16 MiB limits, seven-day
  retention, hourly file rotation and compression. Ubuntu's vendor syslog override
  was detected and corrected by installing `zz-luigis-retention.conf`; effective
  configuration confirms no syslog/console/kernel forwarding. Journal use measured
  11.5M. Private Certbot logs measured 88 KiB; its daily cleanup timer is enabled.
- Actual root-private rotated-log rehearsal removed an eight-day-old empty
  synthetic log and preserved the fresh counterpart, then cleaned only the test
  files. Active log, TLS keys, accounts and certificates were untouched. Retention
  cleanup is scheduled, not an exact deletion deadline; it cannot run while a VM
  is stopped, and retained disks are not erased by the approved stop deadline.
- The two checks plan 267,840 executions in a 31-day month, below the current
  project free allowance of 1,000,000. Existing inventory and actual resource
  configuration were checked; no cloud log storage or new compute was purchased.
  This is a planned usage bound, not a bill/credit guarantee. Existing traffic,
  disks, project costs and alert-budget limitations remain documented.

## Actual incident and private recipient acceptance

The app was deliberately stopped at 17:47:52UTC with an eight-minute automatic
recovery safeguard. GCP samples showed all three locations failing and the exact
policy aggregation exceeded its threshold. Incident `0.oe7ctlyswdir` opened
at 17:53:15UTC. Google evaluation/notification lag is included in this observed
result; a three-minute condition is not a three-minute email guarantee.

The operator restored trusted readiness at 17:54:12UTC, six minutes 20 seconds after
the controlled stop, and cancelled the safeguard only after readiness succeeded.
The final compatible release then started successfully. The incident closed
at 17:56:05UTC after healthy measurements. Brody explicitly confirmed receiving
both the outage and recovery emails; no email contents/private links were collected.

After the drill, service/retention/journald status was healthy. SQLite integrity
and foreign-key checks passed; existing staff/credential/ownership/MFA/recovery/
migration contents and database inode matched the prior protected baseline.
This demonstrates a representative app incident on an intact VM/data/key setup,
not a Spot capacity/VM restart, backup restore or general uptime guarantee.

## Original acceptance map

| Criterion | Accepted evidence |
| --- | --- |
| Structured/redacted logs and correlation | Existing fixed event recorder plus actual rejected order/payment ID matching and focused privacy/failure tests; no active merchant webhook is fabricated |
| Health/error/payment-review monitoring routes and agreed thresholds | External ready/preview checks and actual alert policy; failed-request events and protected review queue remain operator-reviewed; mismatches escalate immediately with safe IDs |
| Recipient and permitted actions | Brody's active operator email verified against enabled channel, both real notices confirmed; inspect/restart compatible app/intact Spot VM and preserve state under runbooks, no automatic payment/destructive action |
| Incident runbooks | Current guide covers app/database outage, absent/deferred provider webhook and actual demo backlog, failed release, compromised credentials, and recovery proof |
| Representative drill and telemetry retention/cost | Real open/recovery incident and emails, restored health/data integrity, effective bounded private logging and actual expiry test; planned free-allowance check volume |

All original OPS-04 criteria are satisfied for the approved hosted demo. OPS-04
may move Done. OPS-07 maintenance/continuity, final publication, receiving-person
handoff and broader hosted QA/performance/Lighthouse retain their original cards.
No unrelated visual/manual/Lighthouse suite was repeated for these JSON/operations
changes. Guide/file responsibilities: [operations monitoring](../operations-monitoring.md).
