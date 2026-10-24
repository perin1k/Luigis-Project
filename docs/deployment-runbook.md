# GCP/DuckDNS deployment runbook — preparation only

OPS-01 now supplies [reviewable release/service tooling](../deploy/README.md).
Follow its manifest/preflight, exact schema compatibility and stopped atomic
release-switch procedure. The unit remains uninstalled on GCP; repository/CI
verification does not lift the cloud execution hold below. Current native
application acceptance is recorded in [the pre-OPS checkpoint](verification/preops-checkpoint.md),
superseding historical missing-browser notes only within its documented scope.

Prepared October 22, 2026 for OPS-01/02/03/04/05/06/07. The human explicitly
requested instructions only: **do not provision, publish, spend, change accounts,
install host software, schedule jobs or delete data under this document alone**.
This is a reviewed sequence to execute after separate authorization, not evidence
that a hosted environment exists. The team's [approved hosting record](hosting-design.md)
is authoritative; do not replace its choices with another architecture.

## Approved target and launch prerequisites

| Item | Target / prerequisite |
| --- | --- |
| Project / endpoint | `capstone-510915`; `https://luigispizzeria.duckdns.org` |
| VM | `e2-small` Spot, `us-central1-a`, Ubuntu 24.04 LTS amd64; resolve the approved image family to an exact image before installation |
| Interruption | STOP, not DELETE; sponsor restarts when Spot capacity permits; no automatic standard-VM fallback |
| Storage | 20 GB balanced boot disk and separate 10 GB balanced data disk; auto-delete disabled on both |
| Process | One unprivileged Node process managed by systemd, direct TLS on 443; no reverse proxy or cluster |
| Network | Dedicated custom VPC/subnet, targeted public TCP 443 and ACME-only TCP 80; SSH only through IAP/OS Login, TCP 22 from `35.235.240.0/20` |
| Address / DNS | Ephemeral external IPv4; DuckDNS update at boot and every five minutes |
| Budget | Approved $25/month project alerts-only budget: actual 50/90/100%, forecast 100%; billing owner monitors costs |
| End date | Stop hosting November 1, 2026, 11 PM America/Chicago = November 2, 05:00 UTC. Retain disks/keys pending separate cleanup authorization |

Before execution, the sponsor verifies authenticated project ownership, billing
linkage/credits, quota, Spot availability and a current estimate covering compute,
disks, external IPv4, egress and logs. No free-tier/credit-offset promise is made.
Alerts-only budgets do not enforce a spending ceiling; any proposed spend-cap
feature must be checked for eligible services and approved separately. See
[Google's alerts-only budget guide](https://docs.cloud.google.com/billing/docs/how-to/budgets).

## 1. Prepare a release without touching cloud resources

Choose the exact reviewed Git commit and record its full identifier, package-lock
hash, Node/npm versions and verification results. The currently tested local
Node version for deployment is 24.14.1. Follow
[cross-platform checks](cross-platform.md); validate the selected runtime on the
actual Ubuntu target before release acceptance. Do not silently update packages.

On a verification checkout:

```sh
npm ci
npm run test:unit
```

Run the applicable browser, accessibility and Lighthouse checks there; avoid
running browser tooling on the serving e2-small VM. Preserve OS-specific snapshots.
The pre-OPS checkpoint records native/manual application acceptance, including
working-runner Firefox verification. Actual hosted acceptance remains open;
a passing local unit suite does not clear those gates.

Prepare an immutable, root/deployer-owned release directory with the selected
source and lockfile. On the future host, production dependencies use
`npm ci --omit=dev`. The application has no separate bundle/build step. Start
`src/server.js`, never a test fixture, watcher or Playwright webServer command.
Do not expose repository roots, test controls, node_modules or private files as
static content. Actual installation and resource creation are still unauthorized.

## 2. Future host layout and configuration contract

Proposed paths below are Linux deployment paths, not existing local files:

| Path | Purpose / access |
| --- | --- |
| `/opt/luigis/releases/<commit>/` | Immutable application release; service user cannot modify source |
| `/opt/luigis/current` | Operator-managed release pointer; never contains SQLite or key material |
| `/var/lib/luigis-data/` | Required separate data-disk mount; private service-owned SQLite and journals |
| `/etc/luigis/runtime.env` | Root-owned private service-manager environment configuration |
| `/etc/luigis/payment-keys.json` | Hosted-only payment keys, outside source/data; owned by running service user, mode 0600, regular file, no symlink |
| `/etc/luigis/tls/` | Privately installed certificate/key pair, readable only by the service identity and authorized operator |

The payment-key file ownership requirement is enforced by
`src/payments/payment-config.js`; making it root-owned but only group-readable
would fail its current POSIX check. Keep MFA and payment keys distinct from each
other and from developer/test keys. Follow the existing
[private bootstrap](authentication-design.md#implemented-local-first-admin-setup)
and [payment-key format](demo-payment-design.md#key-custody-rotation-and-deletion).
Do not generate production keys in this chat or put them in arguments, logs or Git.

Non-secret runtime settings, to be placed by the authorized operator:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=443
AUTH_ORIGIN=https://luigispizzeria.duckdns.org
DATABASE_PATH=/var/lib/luigis-data/luigis-demo.sqlite
TLS_KEY_PATH=/etc/luigis/tls/privkey.pem
TLS_CERT_PATH=/etc/luigis/tls/fullchain.pem
DEMO_PAYMENT_KEYS_PATH=/etc/luigis/payment-keys.json
```

Separately inject `MFA_ENCRYPTION_KEY_HEX` through the protected configuration:
32 random bytes as 64 lowercase hex characters. It is intentionally omitted above.
Node does not automatically load a `.env` file. All five authentication settings
must be complete, and AUTH_ORIGIN's port must match PORT. Missing payment-key
configuration leaves checkout unavailable; a reachable home page is insufficient.

Before migration or application startup, verify the data disk is actually mounted.
Do not allow a missing mount to create a new database on the boot disk. With the
intended DATABASE_PATH and private service identity configured, initialize a new
hosted synthetic database using:

```sh
npm run db:migrate
npm run db:seed
npm run admin:setup
```

The final command creates the initial Owner and requires a private interactive terminal and MFA enrollment;
no shared/default password or unattended bypass exists. Brody Mensonides oversees
recovery. Follow the [staff role policy](staff-role-policy.md): the Owner creates
Admins or Employees, and Admins create Employees only. Existing installations
with no Owner require the private explicit designation procedure; migration 014
does not promote an existing admin automatically.
No developer database, saved guest link or existing test account is uploaded.

## 3. DNS and valid TLS, after authorization

Assign only the approved ephemeral address. Configure a protected updater to
submit the current external IPv4 to DuckDNS over HTTPS at boot/every five minutes;
verify its OK result and resolve the hostname independently. DuckDNS's API places
the account token in its request: keep token-bearing URLs out of arguments,
terminal history and logs. Do not publish a URL containing that token. The
[official API specification](https://www.duckdns.org/spec.jsp) defines the update
and success/failure responses. Updater configuration/timer implementation and
secret custody still require review and testing; none is installed here.

Use the selected Certbot standalone HTTP-01 flow. Port 80 is reserved for ACME
validation, not customer orders or authentication. Confirm DNS before requesting
issuance, use staging/dry-run verification appropriately, and never ask visitors
to bypass certificate warnings. HTTP-01 requires port 80; Node continues direct
HTTPS on 443. See [Let's Encrypt's challenge rules](https://letsencrypt.org/docs/challenge-types/)
and [Certbot standalone/renewal documentation](https://eff-certbot.readthedocs.io/en/stable/using.html).

A successful renewal hook must stage and validate the matching certificate/key,
install a complete pair with protected ownership/permissions and restart the
single Node service. Existing Node startup reads TLS files once: replacing files
does not reload certificates automatically. Test the hook and rollback of the
certificate pair before relying on unattended renewal. Do not copy partially
updated credentials into a running service's paths. No renewal timer is created.

## 4. Service supervision and first launch

Prepare and review a systemd service with a dedicated identity, fixed working
release directory, protected environment input and explicit data-mount dependency.
It must require the actual data mount, restart on application failure with backoff,
handle SIGTERM shutdown and run exactly one Node process. Grant only the narrowly
reviewed bind capability required for 443; do not run Node as root or modify the
Node binary globally. Restrict writable paths to required data/runtime locations.
Use the reviewed unit in `deploy/luigis.service`. Its disposable Ubuntu CI
rehearsal is recorded under OPS-01; it is not installed on GCP. Validate the actual
host's unit, disk identity and permissions before enabling it there.

Keep Node's direct-TLS/pinned-host checks and socket-peer throttling. A proxy or
TLS-terminating load balancer would require a new reviewed trust/address design.
Do not enable `trust proxy` or accept arbitrary forwarded addresses as a shortcut.
Use [IAP's restricted SSH guidance](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding)
for operator access; do not grant broad cloud API roles to the Node process.

Record redacted service events, DNS/certificate failures and restart outcomes
under the approved seven-day local log rotation policy. Do not enable request-body,
cookie, contact, guest-token or payment-plaintext logging. Local probes are now available at `/health/live` and `/health/ready`; see
[their precise readiness contract and incident procedures](operations-monitoring.md).
Also use controlled page/API smoke checks. A probe alone does not prove full
transactional recovery, worker freshness or hosted alert delivery.

## 5. Acceptance, interruption and release rollback

Before public publication, run through the actual hostname with a valid trusted
certificate and isolated hosted synthetic data:

- Carry-out and dine-in: build/edit/review, current price/tax/tip, schedule,
  demo disclosure, confirmed payment and safe retry without duplication.
- Guest tracking and cancellation boundaries; protected links reveal no contacts.
- Individual employee/admin sign-in, admin MFA, permission denial, session expiry.
- Owner price/availability/hours edits, review warnings, preserved purchased prices
  and ready times; cancellation/refund, previews and analytics use committed data.
- Private pages remain noindex/no-store; HTTP cannot expose staff functions;
  source, keys, database and fixture routes are inaccessible publicly.
- Actual configured startup/minute retention and preview workers, DB foreign-key/
  integrity checks, graceful restart and isolated abrupt-interruption recovery.
- Certificate renewal, DNS IP change, service/VM restart and restricted SSH;
  Ubuntu plus required browser/manual acceptance, not just macOS evidence.

Stop publication if any mandatory gate is unmet. Spot shutdown opportunities are
best effort and capacity-dependent restart is not continuous availability. After
an interruption, the sponsor restarts the stopped VM, verifies mount/key access,
checks database integrity and migrations, refreshes DNS/TLS, then checks original
order/payment retries and workers. Never fabricate a replacement payment because
a response was lost. See [Spot VM behavior](https://docs.cloud.google.com/compute/docs/instances/spot).

For an application rollback, stop the service, preserve the current database and
keys, select a previously verified release only if it supports the current applied
schema, reinstall its locked dependencies if necessary and re-run smoke checks.
No destructive SQL downgrade, database replacement or edit to an applied migration
is authorized. If schema compatibility is uncertain, keep service stopped and
prepare a reviewed forward fix. No automatic rollback mechanism is claimed.

Recreation is an explicitly disposable, separate test: use a new empty database
path and new demo identities. Do not overwrite the hosted database to demonstrate
recovery. Persistent disks are not backups; optional snapshots need separate
retention/key approval. At the approved end time, stop service/VM, verify the site
is unavailable, retain disks/keys and review continuing storage charges. Deletion
requires its own authorization; no shutdown automation has been scheduled here.

## Prepared versus executed

This document was checked against runtime, migration/seed, bootstrap and key-loader
code plus the linked current primary documentation. No cloud account was accessed,
resources provisioned, package installed, DNS changed, certificate issued, service
started on a host or job scheduled. No billable estimate or Linux deployment test
was invented. OPS cards remain open for configuration and live verification.
