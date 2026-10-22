# Hosting decision record — TECH-01

Decision date: October 22, 2026. Status: partially decided; configuration and
deployment remain separate approved increments. See [TECH-01](https://trello.com/c/rZWMmHQn).
This record changes no application behavior and provisions no cloud resources.

## Confirmed decisions

- Public hosting uses GCP and a DuckDNS hostname. Customer pages remain public;
  employee/admin functions retain individual authentication, permissions and MFA.
- The project sponsor owns the GCP project/billing and DuckDNS account and intends
  to fund hosting with existing GCP credits. No numerical spending ceiling,
  verified credit balance, eligibility or expiry has been recorded. Credit
  availability is not a guarantee of zero charges or unlimited spending approval.
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
| Region and OS | Ubuntu 24.04 LTS, x86-64, in `us-central1` | Select an available zone and pin the exact image during OPS-01/02; verify locked tooling on Linux. |
| Machine | `e2-small` Spot initially | Confirm offering/capacity and validate application load before hosted acceptance; resizing requires review. |
| Application | One Node process managed by `systemd`, running as a dedicated unprivileged identity | Preserve the current SQLite and in-process notification/retention workers; avoid duplicate workers. Review service shutdown/restart behavior. |
| Preemption | Termination action `STOP`, not `DELETE` | Keep the instance available for an operator restart when capacity permits. |
| Disks and database | 20 GB boot disk plus a separate 10 GB persistent data disk; retain disks | Confirm disk types and explicit auto-delete settings during provisioning. Preserve private SQLite files/journals across restarts and releases. No Local SSD or ephemeral container storage for SQLite. |
| Keys | Separately protected private key material outside source and database | Define host custody, access and lifecycle under OPS-03; retaining a database without its encryption keys is insufficient for recovery. |
| Public endpoint | Requested hostname `luigispizzeria.duckdns.org`; trusted HTTPS with automated renewal | Hostname availability/registration is unverified. Select IP lifecycle, DNS update mechanism and certificate tooling before deployment. Tokens must not appear in logs or shared commands. |
| TLS topology | Direct Node HTTPS on port 443 | Preserve origin/port checks and client-address throttling. Review least-privilege binding, certificate access and reload; do not run Node as root simply to bind port 443. Any proxy/forwarding change needs separate review. |
| Administration | SSH through GCP IAP; no public SSH access | Review IAM, OS Login and restricted IAP firewall rules. Application HTTPS remains publicly accessible. |
| Data lifecycle | Isolated hosted synthetic data; no required application-managed backups | Persistent storage is not a backup. Optional cloud snapshots require separate retention/key review. |

The approved `e2-small` starting size supersedes the earlier `e2-micro` candidate.
Assess memory/CPU under representative runtime load; approval is not evidence of
capacity or performance. Run browser and Lighthouse tooling separately from the
serving VM where practical.

The target hosting end date is **November 1, 2026**, interpreted in
America/Chicago. An exact shutdown time has not been selected. No scheduler,
automatic shutdown or deletion is created by this record. Agree any preservation
and explicitly authorized resource/data/key cleanup before teardown.

## Interruption and recovery contract

Google may preempt a Spot VM. A shutdown opportunity is best effort; do not rely
on a final callback to preserve already committed application data. Review and
test both graceful shutdown and abrupt process interruption before hosted acceptance.

For a standalone VM using `STOP`, an operator restarts it when capacity is
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

## Remaining decisions and delivery gates

- Confirm the project identifier, available zone, pinned Ubuntu image, approved
  machine availability, disk types, retain settings and network/IAP firewall
  configuration. Region, OS family, starting size and disk capacities are settled.
- Verify actual credit applicability/expiry and current estimated VM, disk, IP,
  network and logging costs. Select budget alerts and an escalation threshold;
  alerts are not a hard spending cap. Retained disks can still incur charges
  while the VM is stopped.
- Verify availability and registration of the requested DuckDNS hostname; select
  address-update/certificate-renewal tooling and safe secret provisioning. Public
  HTTPS port 443 is settled. Do not publish account tokens.
- Define restart responsibility and the exact November 1 shutdown time, plus
  separately authorized data/key deletion and retained-resource cleanup.
- Define separate local/test/hosted databases, keys and staff provisioning. Never
  upload developers' databases or reuse their private credentials.
- Rehearse setup, shutdown, restart, release rollback and disposable-data recreation
  under OPS-01/02/03/04/05/07 before public publication under OPS-06.
- Complete Linux/runtime/browser and manual accessibility acceptance, public HTTPS
  checks and customer/employee/admin integrated review under QA-01/02/03.
  See [platform evidence limits](cross-platform.md) and
  [operator security prerequisites](privacy-operator-review.md).

TECH-01 remains open until these concrete choices are resolved. Documentation
approval does not establish deployed availability, resource sizing, spending
authorization, filesystem security or recovery verification.

## Primary references

- [Google Cloud Spot VM behavior and storage lifecycle](https://docs.cloud.google.com/compute/docs/instances/spot)
- [Creating and restarting Spot VMs](https://docs.cloud.google.com/compute/docs/instances/create-use-spot)
- [DuckDNS update API](https://www.duckdns.org/spec.jsp)

Verify current product support and account-specific estimates during provisioning;
no price or free-tier promise is made here.
