# Hosting decision record — TECH-01

Decision date: October 22, 2026. Status: design decisions complete; configuration
and deployment remain separate OPS increments. See [TECH-01](https://trello.com/c/rZWMmHQn).
This record changes no application behavior and provisions no cloud resources.

## Confirmed decisions

- Public hosting uses GCP and a DuckDNS hostname. Customer pages remain public;
  employee/admin functions retain individual authentication, permissions and MFA.
- The project sponsor confirmed ownership of GCP project `capstone-510915` and
  the DuckDNS hostname `luigispizzeria.duckdns.org`. Funding uses existing GCP
  credits. The supplied October 22 screenshot shows $43.59 available, expiring
  September 10, 2027, with usage scope described as any service on that billing
  account. This is screenshot evidence, not an authenticated check that the project
  is linked to that account or that every proposed charge qualifies. Do not commit
  billing account identifiers, credit identifiers or the screenshot.
- Use a project-scoped $25 USD monthly alerts-only budget, with actual-spend
  thresholds at 50%, 90% and 100%, plus forecast 100%, delivered to the billing
  owner. Monitor usage before credit offsets where supported. The owner reviews
  unexpected costs at the first alert and pauses optional work before exceeding
  the threshold. This monitoring threshold is not a hard spending cap or approval
  to consume unlimited credits. Actual billing setup/estimate validation is OPS work.
- Use a Compute Engine **Spot VM**. Interruptions and capacity-dependent restart
  must be reflected in the operating procedure; continuous availability is not
  promised by this choice.
- Preserve the existing SQLite database architecture and reviewed migrations.
  External-service behavior remains governed by [the integration boundary](integrations.md):
  no real payment processing or external notification delivery is implied.

## Approved implementation baseline

The following defaults were explicitly approved on October 22, 2026. They are
design choices, not provisioned settings or verified outcomes.

| Area | Approved baseline | Reason / remaining review |
| --- | --- | --- |
| Region and OS | Ubuntu 24.04 LTS, x86-64, in `us-central1-a` | Resolve the supported `ubuntu-2404-lts-amd64` family to an exact image during OPS-01/02. If Spot capacity is unavailable, report it rather than silently change region, size or provisioning model. |
| Machine | `e2-small` Spot initially | Confirm offering/capacity and validate application load before hosted acceptance; resizing requires review. |
| Application | One Node process managed by `systemd`, running as a dedicated unprivileged identity | Preserve the current SQLite and in-process notification/retention workers; avoid duplicate workers. Review service shutdown/restart behavior. |
| Preemption | Termination action `STOP`, not `DELETE` | Keep the instance available for an operator restart when capacity permits. |
| Disks and database | 20 GB `pd-balanced` boot disk plus separate 10 GB `pd-balanced` data disk; auto-delete disabled on both | Mount private SQLite storage on the data disk and require the mount before starting Node. Preserve files/journals across restarts/releases. No Local SSD or ephemeral container storage for SQLite. |
| Keys | Separately protected private key material outside source and database | Define host custody, access and lifecycle under OPS-03; retaining a database without its encryption keys is insufficient for recovery. |
| Public endpoint | Owner-confirmed `luigispizzeria.duckdns.org`, ephemeral external IPv4 | No reserved static address. Update DuckDNS through its HTTPS API at boot and every five minutes; verify DNS after an IP change before declaring recovery. Store token in a protected operator file and suppress request URLs/tokens from output. |
| Certificates | Certbot standalone HTTP-01 on port 80; automated renewal timer | Port 80 serves ACME challenges only, no customer data or sign-in. Node serves HTTPS on 443. A successful renewal deploy hook installs private service-readable certificate material atomically and restarts the service; test dry-run renewal under OPS-02. |
| TLS topology | Direct Node HTTPS on port 443 | Preserve origin/port checks and client-address throttling. Review least-privilege binding, certificate access and reload; do not run Node as root simply to bind port 443. Any proxy/forwarding change needs separate review. |
| Administration | SSH through GCP IAP with OS Login; no public SSH access | Dedicated custom VPC/subnet; target firewall rules to the application VM: public TCP 443 and ACME TCP 80, TCP 22 only from `35.235.240.0/20`. No default broad SSH rule. Grant required IAP/OS Login access to the owner, not all project users. |
| Data lifecycle | Isolated hosted synthetic data; no required application-managed backups | Persistent storage is not a backup. Optional cloud snapshots require separate retention/key review. |

The approved `e2-small` starting size supersedes the earlier `e2-micro` candidate.
Assess memory/CPU under representative runtime load; approval is not evidence of
capacity or performance. Run browser and Lighthouse tooling separately from the
serving VM where practical.

The approved hosting shutdown target is **November 1, 2026 at 11:00 PM
America/Chicago** (November 2 at 05:00 UTC, after the daylight-saving transition).
The sponsor is the restart/shutdown operator. OPS must implement and verify the
shutdown procedure; no scheduler is created here. Stop service/VM at the target,
retain disks and keys pending separately authorized cleanup, and review continuing
storage charges. The end date does not authorize automatic resource/data deletion.

## Interruption and recovery contract

Google may preempt a Spot VM. A shutdown opportunity is best effort; do not rely
on a final callback to preserve already committed application data. Review and
test both graceful shutdown and abrupt process interruption before hosted acceptance.

For a standalone VM using `STOP`, the sponsor restarts it when capacity is
available. `systemd` can restart a failed application or start it after boot;
it cannot start a stopped cloud VM. Automatic cloud restart orchestration is not
selected or implemented by this record.

Before restoring public service, verify the retained disk mount and key access,
database integrity/migrations, pending payment/order retries, expired capacity
holds, retention cleanup and notification-preview processing. Preserve existing
idempotency protections; never create replacement payments merely because a
response was interrupted. Recheck DNS, TLS and authenticated role access.

During an interruption the site can be unreachable. A reliable demonstration
window, fallback if Spot capacity is unavailable, and any temporary standard-VM
option require explicit agreement; no automatic paid fallback is authorized.

## Implementation handoff and verification gates

- OPS-01: implement reproducible runtime/configuration and release/rollback
  procedures. Pin the exact Ubuntu image and tested Node version when preparing
  the deployment; keep project/zone and the other approved settings explicit.
- OPS-03: provision private hosted-only MFA/payment keys and individual staff
  identities. Keep database on the data disk and keys in separate protected host
  paths, outside source/SQLite; use root-owned configuration and narrowly scoped
  service-readable files. Do not attach broad cloud API permissions to Node.
  Use an unprivileged service with only the binding capability needed for 443.
  Keep local, test and hosted databases/keys distinct; no developer database upload.
- OPS-02: verify project billing linkage, credits, quota/capacity and a current
  estimate including VM, disks, IP, network and logs before provisioning; create
  approved network/disks, mount checks, DNS/TLS and budget configuration. Verify
  ownership/configuration through the authenticated account, not DNS alone.
- OPS-04/07: keep request bodies, cookies, contacts and guest tokens out of logs;
  use fixed redacted operational events with a seven-day local rotation policy.
  Do not enable cloud request/body logging or optional snapshots by default.
  Implement DNS/certificate timers, owner restart instructions and shutdown target.
- Rehearse setup, shutdown, restart, release rollback and disposable-data recreation
  under OPS-01/02/03/04/05/07 before public publication under OPS-06.
- Complete Linux/runtime/browser and manual accessibility acceptance, public HTTPS
  checks and customer/employee/admin integrated review under QA-01/02/03.
  See [platform evidence limits](cross-platform.md) and
  [operator security prerequisites](privacy-operator-review.md).

TECH-01 selects the architecture, funding/ownership, data lifecycle and operating
policy; those decisions are complete. The OPS/QA cards above own implementation
and live verification. TECH-01 closure does not certify deployed availability,
account access, billing linkage, resource performance, filesystem security or
recovery. Unexpected account restrictions/capacity/cost findings must be raised
before changing the approved design or provisioning resources.

## Primary references

- [Google Cloud Spot VM behavior and storage lifecycle](https://docs.cloud.google.com/compute/docs/instances/spot)
- [Creating and restarting Spot VMs](https://docs.cloud.google.com/compute/docs/instances/create-use-spot)
- [DuckDNS update API](https://www.duckdns.org/spec.jsp)
- [IAP TCP forwarding and restricted SSH](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding)
- [Certbot standalone issuance, renewal and hooks](https://eff-certbot.readthedocs.io/en/stable/using.html)
- [Budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)

Verify current product support and account-specific estimates during provisioning;
no price or free-tier promise is made here.
