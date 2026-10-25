# Luigi's Pizza developer and hosting reference

> For developers and technical website support. Restaurant staff and owners using
> the website should start with [Using your website](handoff.md) and
> [Find the right guide](README.md). This technical reference is not an everyday user manual.

Prepared October 24, 2026 for [DOC-01](https://trello.com/c/9ldFFK0U).
Status: receiving-team review package; independent rehearsal and final QA pending.
This guide does not transfer accounts, authorize spending or establish acceptance.

## Delivery and current environment

The public preview is [luigispizzeria.duckdns.org](https://luigispizzeria.duckdns.org).
Customer ordering is public; staff functions require individual accounts, with
authenticator MFA for Owner/Admin. Use invented contact details only. Checkout
generates synthetic payment identities and moves no money; no real card/CVV input
is required. Email/SMS are internal previews, not sent messages. Stripe/native
Apple Pay and rewards/student deals remain future scope, not delivered integrations.

The observed hosted application source is
`da2a2bdbe3ef0beb06f0e96dd0e07d64ef60140a` on Ubuntu 24.04, Node 24.22.1/npm
11.19.1. Documentation and acceptance tooling have later commits on `dev`.
Record both the delivered repository commit and actual deployed release in the
receiving record; do not assume a documentation push deploys application code.
The October 25 release includes the accepted cleanup, versioned public JavaScript
and bundled public CSS; Nginx negotiates HTTP/2. See
[deployment evidence](verification/cleanup-deployment.md). For the approved course
deliverable (source ZIP plus class presentation), see [submission guide](submission.md).

Public HTTPS now passes through Nginx to authenticated loopback Node TLS, with
customer migration 016 applied. Same-release direct HTTPS recovery, renewal and
Owner sign-in were exercised. Read the [proxy operator guide](nginx-proxy.md) and
[current execution record](verification/ops-08-proxy.md) before maintenance; do not
restore the older application against the newer schema. Restaurant users still
use the same public/customer/staff links and contact designated website support
for outages; they do not need proxy commands or additional account setup.

Read [publication evidence](verification/ops-06-publication.md),
[hosted integration acceptance](verification/int-02-hosted.md) and
[maintenance acceptance](verification/ops-07-maintenance.md) for exercised scope.
QA-01/02/03 remain final acceptance gates, including hosted Lighthouse,
payment/privacy, load/recovery and applicable human/device review.

## Setup, architecture and data guide

1. Obtain the repository from its owner, record the exact commit, and follow
   [AGENTS.md](../AGENTS.md) and [cross-platform setup](cross-platform.md).
   Install the declared Node version and use `npm ci` with the committed lockfile.
2. `npm start` alone serves the unconfigured presentation at
   `http://127.0.0.1:3000`; it does not configure integrated staff/payment/storage.
   Follow [authentication](authentication-design.md),
   [payment configuration](demo-payment-design.md) and the
   [deployment runbook](deployment-runbook.md) for the integrated environment.
3. For a new authorized environment, use the reviewed migrations and menu seed
   (`npm run db:migrate`, `npm run db:seed`) with its explicit database path.
   Never seed over a hosted database for a demo or edit an applied migration.
   Initial Owner creation is private, one-time setup with verified MFA; use the
   [custody guide](secret-custody.md), not a shared/default password.

| Layer or contract | Guide and responsibility |
| --- | --- |
| Express/Node server, EJS templates, Bootstrap/browser modules | [README file guide](../README.md#file-guide); server owns validation/prices/permissions, browser owns interactions |
| SQLite schema, migrations, cents/timestamps | [Data design](data-schema-proposal.md); preserve immutable migration bytes/checksums and purchased snapshots |
| Menu/pricing and authoritative order submission | [Pricing](pricing-design.md), [order service/API](order-submission-design.md) |
| Chicago scheduling, cutoff/capacity/holds | [Scheduling API and rules](scheduling-design.md) |
| Staff sessions, invitations, roles and recovery | [Authentication](authentication-design.md), [role policy](staff-role-policy.md) |
| Queue/detail/status, private guest grants | [Staff API](staff-orders-design.md), [progress](order-progress-design.md), [tracking](tracking-and-exceptions.md) |
| Demo payments/refunds and future provider seam | [Payments](demo-payment-design.md), [refunds](demo-refund-design.md), [integration boundaries](integrations.md) |
| Owner catalog/hours and analytics | [Menu](menu-management-design.md), [sales metrics](sales-analytics-design.md) |
| Contact handling, retention and notification previews | [Privacy](privacy-request-workflow.md), [retention jobs](retention-enforcement.md), [previews](notification-preview-design.md) |

Configuration names and non-secret paths are in
[`deploy/runtime.env.example`](../deploy/runtime.env.example). Its historical
runtime comment is superseded by the current package/maintenance pin above.
Key values must be privately provisioned; the template intentionally omits them.
`AUTH_ORIGIN`, HTTPS files, database path and payment/MFA keys must belong to the
same reviewed environment. No keys, local databases, browser profiles or gcloud
credentials belong in the source handoff. Runtime flags and permission checks
are documented in the linked guides; disabling them is not setup troubleshooting.

## Everyday workflows

| Person | Workflow and boundary |
| --- | --- |
| Customer | Select carry-out/dine-in, build/review items, supply required contact, choose ready time and confirm no-charge demo checkout. Save the private tracking link. Request cancellation before Preparing; requests require staff review |
| Employee | Sign in individually; read queue/details, advance permitted preparation states and manage ingredient availability. No Owner analytics, menu-price edits or refund authority |
| Admin | Complete MFA; manage Employees only, review cancellations/fulfillment exceptions and approve full demo refunds. Use internal notification previews without claiming delivery |
| Owner | Complete MFA; manage Admin/Employee roles, menu/prices/hours and sales analytics. Review existing bookings affected by changes; never silently substitute or rewrite purchased totals |

Every order needs usable contact information; carry-out needs a phone. The server
enforces America/Chicago scheduling, capacity and authoritative totals. Customer
cancellation is blocked at Preparing; restaurant inability to fulfill requires an
authorized review. No automatic refund for prepared no-shows. Private tracking
links are bearer access: do not put them in public evidence. Staff verify identity
before contact correction/limited-copy access or tracking-link replacement.

On a payment interruption, keep the original operation identifiers and use the
same-operation retry/check result path. Do not create another payment merely
because a response was lost. Refresh stale staff records before resubmitting.
For suspected credential exposure, preserve safe incident times/IDs and follow
private recovery/revocation instructions; never send setup secrets or recovery
codes to chat, logs or a third-party QR service.

## Operations, recovery and cost

Use [release tooling](../deploy/README.md) and
[maintenance](maintenance-continuity.md) for canonical source packaging, target
installation, compatible rollback and forward recovery. An accepted older source
may require the patched runtime; do not reactivate a vulnerable runtime or change
SQL bytes/checksums to force compatibility. Existing actual-host redeploy/restart
and rollback evidence is linked above; no outage rehearsal is authorized here.

Check public live/ready/preview probes and [monitoring](operations-monitoring.md)
before diagnosing DNS, certificate, VM, process or worker failures. A working
homepage alone does not prove order recovery. Read private logs only as an
authorized operator, with redaction and bounded retention. Authenticator recovery
requires the [reviewed recovery procedures](authentication-design.md), not a
permission bypass. Root and the running service can read required keys.

There is **no application-managed backup** for this disposable demonstration.
Retained disks are not backups; lost keys/data cannot be reconstructed from source.
[Recreation](disposable-data-recreation.md) uses a separate empty database with
fresh identities and is not restoration of existing orders. Any future business
backup/restore plan requires approved retention, encryption/key custody and a
tested restoration procedure before a durability promise.

Brody controls GCP project `capstone-510915`, billing and DuckDNS; Perin controls
the GitHub repository. The VM is `luigis-preview`, e2-small Spot, us-central1-a.
Spot interruption/restart depends on capacity. The approved stop is November 1,
2026 at 11 PM America/Chicago (November 2 at 05:00 UTC). Retain disks/keys; deletion
requires separate authorization. Storage charges continue after stop. The $25
monthly alerts budget and $10 planning allowance are not caps; credit coverage
is unverified. No ongoing support, uptime SLA or personal-account transfer is included.

## Account and responsibility transfer checklist

- Repository owner grants approved individual access; identify the receiving
  maintainer and record the delivered commit. Agree source redistribution terms;
  no root project license has been selected. See [notices](third-party-notices.md).
- Receiving organization establishes its own cloud/billing and DNS responsibility.
  Review resource quotas, prices, budget alerts, support and stop/deletion policy.
  Do not hand over the sponsor's personal Google password or DuckDNS token in docs.
- Operator and recipient privately agree least-privilege GCP/IAP access, key/TLS
  custody, monitoring recipients and renewal responsibilities. Review rotations
  and any data transfer before execution; this checklist executes none of them.
- Application accounts use genuine individual invitations and role policies.
  Owner/Admin enroll MFA and retain recovery codes privately. Owner succession
  needs a separately reviewed procedure; do not demote the single Owner or infer
  that a cloud operator is automatically the application Owner.
- SQLite/data and key custody transfer together only through approved private
  procedures. Identify required retention and external copies. Do not export
  customer details or decrypt synthetic card records for a handoff demonstration.
- Future payment/notification providers require receiving-business accounts and
  reviewed live integration. There are no current Stripe settlement or customer
  messaging credentials to transfer. Certbot/Let's Encrypt and DuckDNS lifecycle
  remain operator duties; see the deployment/custody guides.

## Reusable verification commands

From a configured clean checkout with the supported runtime:

```sh
npm ci
npm run test:unit
npm run test:storage
npm run test:staff:unit
npx --no-install playwright install
npm run test:staff:functional
```

Browser OS dependencies and native reference rules are in the cross-platform
guide. These commands are options for the affected scope, not a request to repeat
every suite for documentation edits. Existing accepted checkpoint evidence may be
reused after impact review. Never run fixture controls on a public deployment.
The private hosted verifier requires separate real Owner participation and creates
a labeled demo order; do not rerun it merely to read the accepted result.

## Technical receiving-person rehearsal — pending

For technical transfer, the receiving technical maintainer must use this package and record their name,
date, delivered/deployed commits, environment and actual pass/fail/gaps. Coordinate
privileged operations with the authorized operator; do not share staff logins.

1. Locate the public customer entry and explain no-charge/internal-preview limits.
2. Locate setup/configuration/migration/test instructions and explain presentation
   startup versus integrated runtime. Prefer an isolated checkout/data path for
   any execution; no hosted data reset or new resource creation is implied.
3. Walk through customer, Employee, Admin and Owner permissions using the approved
   team-led [review access arrangement](review-access-plan.md).
4. Find incident, compatible rollback, private MFA recovery and shutdown procedures;
   explain loss/recreation limits and continuing costs. A walkthrough does not
   count as executing a rollback or infrastructure transfer.
5. Identify ownership, secrets that must not be copied, notices and unresolved QA.
6. Record accepted delivery scope, failed steps, responsible follow-up and client
   sign-off separately. Leave unperformed checks unverified.

The restaurant-facing reader walkthrough is in [the demonstration guide](review-access-plan.md)
and may be performed by Brody. It does not require server commands or technical
account transfer. This technical checklist applies to the receiving maintainer's
responsibilities and must not be substituted for the end-user walkthrough.

Current technical transfer record: **not performed; technical receiver not yet identified**. DOC-01 remains
unfinished until the independent rehearsal, required notice/source-term review
and final QA acceptance are recorded. This document is not client sign-off.
