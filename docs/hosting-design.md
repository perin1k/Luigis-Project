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

## Recommended implementation baseline

These are design recommendations, not provisioned settings or verified outcomes.

| Area | Proposed baseline | Reason / remaining review |
| --- | --- | --- |
| Region and OS | Supported Linux image in `us-central1` | Select exact image, zone and available Spot machine type during OPS-01/02; verify locked tooling on Linux. |
| Application | One Node process managed by `systemd`, running as a dedicated unprivileged identity | Preserve the current SQLite and in-process notification/retention workers; avoid duplicate workers. Review service shutdown/restart behavior. |
| Preemption | Termination action `STOP`, not `DELETE` | Keep the instance available for an operator restart when capacity permits. |
| Database | Private persistent disk storage, with explicit retain/auto-delete settings | Preserve database files and journals across stops/restarts; exclude application release replacement from data deletion. No Local SSD or ephemeral container storage for SQLite. |
| Keys | Separately protected private key material outside source and database | Define host custody, access and lifecycle under OPS-03; retaining a database without its encryption keys is insufficient for recovery. |
| Public endpoint | DuckDNS record and trusted HTTPS certificate with renewal procedure | Select hostname, IP lifecycle, DNS update mechanism and certificate tooling before deployment. Tokens must not appear in logs or shared commands. |
| TLS topology | Preserve current direct Node HTTPS boundary initially | Any proxy or port-forwarding design needs explicit review of origin/port checks, client-address throttling, cookies and certificate reload. |
| Data lifecycle | Isolated hosted synthetic data; no required application-managed backups | Persistent storage is not a backup. Optional cloud snapshots require separate retention/key review. |

Machine sizing is unresolved. The earlier `e2-micro` suggestion was a candidate,
not an approved or verified Spot configuration. Select from actual supported
offerings and assess memory/CPU under representative runtime load. Run browser
and Lighthouse tooling separately from the serving VM where practical.

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

- Confirm exact project identifier, region/zone, Linux image, machine type, disk
  allocation, retained resources and network/firewall configuration.
- Verify actual credit applicability/expiry and current estimated VM, disk, IP,
  network and logging costs. Select budget alerts and an escalation threshold;
  alerts are not a hard spending cap. Retained disks can still incur charges
  while the VM is stopped.
- Select the DuckDNS hostname, address-update and certificate-renewal mechanism,
  public origin/port and safe secret provisioning. Do not publish account tokens.
- Define preview duration, restart responsibility, shutdown/teardown timing and
  explicitly authorized data/key deletion. No teardown date has been selected.
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
