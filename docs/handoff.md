# Luigi's Pizza — receiving-team handoff

DOC-01 preparation, October 23, 2026. This is the entry point for the class
demonstration's existing guides, not an accepted production deployment. Hosting
remains on hold; no receiving-person rehearsal or final release acceptance is
claimed. Baseline reviewed: `618e1772c5409a5c1e8bf3c87c45a6e7b9b6a72b`.

## Start here

1. Obtain the repository and select an exact reviewed development commit. Follow
   [cross-platform prerequisites](cross-platform.md), install locked dependencies
   with `npm ci`, and record actual Node/npm/OS versions. `npm start` alone serves
   an unconfigured presentation; it is not the integrated demonstration.
2. For integrated operation, follow [authentication/bootstrap](authentication-design.md),
   [payment configuration](demo-payment-design.md) and the
   [deployment configuration contract](deployment-runbook.md#2-future-host-layout-and-configuration-contract).
   Use a separate disposable database and private keys. Run the reviewed migration
   and menu seed commands before individual interactive Owner setup. There is no
   default password, shared privileged account or automatic Owner promotion.
3. Read [role permissions](staff-role-policy.md), [integration boundaries](integrations.md)
   and the workflow table below before demonstrating. Use only invented contacts
   and the server-generated synthetic payment identities; no real card entry.
4. Use the [deployment runbook](deployment-runbook.md), [service templates](../deploy/README.md),
   [custody guide](secrets-operations.md), [monitoring](operations-monitoring.md)
   and [maintenance procedure](maintenance-procedure.md) for future operator work.
   Actual installation, public activation and spending need separate authorization.

## Demonstration workflows

| Perspective | Rehearsal and governing guide |
| --- | --- |
| Customer | Open `/order`; choose dine-in/carry-out, pizza/drinks, pickup and contact details; edit review, optional tip and disclosed demonstration payment. Confirm a committed receipt, refresh protected tracking and exercise safe retry. [Orders](order-submission-design.md), [pricing](pricing-design.md), [scheduling](scheduling-design.md), [payment](demo-payment-design.md). |
| Employee | Sign in individually, open order queue/detail, advance supported preparation states and manage ingredient availability. Verify changes reach the customer's protected tracking link. Employee cannot read Owner analytics or perform privileged refunds. [Staff orders](staff-orders-design.md), [progress](order-progress-design.md). |
| Admin | Use MFA and authorized order exception/refund/review and employee-account operations. Review cancellation before Preparing, ingredient exceptions and preserved purchased prices; confirm full test refunds. [Exceptions](tracking-and-exceptions.md), [refunds](demo-refund-design.md), [accounts](staff-role-policy.md). |
| Owner | Use MFA; manage Admin/Employee roles and accounts, menu/prices/hours and sales reporting. Review affected bookings explicitly. [Menu](menu-management-design.md), [analytics](sales-analytics-design.md). |
| Privacy operator | Authorized Admin/Owner reviews synthetic contact corrections and limited copies; preserve financial history, retention deadlines and sanitized audit. [Workflow](privacy-request-workflow.md), [inventory](privacy-data-inventory.md), [retention](retention-enforcement.md). Public privacy-policy/contact publication was explicitly deferred and remains a release consideration. |
| Professor | Public customer view and team-led privileged demonstration through individual authorized sessions; no shared professor administrator login. [Review access plan](review-access-plan.md). |

Cancellation, refund and notification-preview states are distinct. Preview records
are internal; the app does not send email/SMS. A payment redirect alone is not
confirmation. Never substitute a new payment after an ambiguous result; preserve
the original request identity and follow the existing retry flow. For incidents,
use the monitoring guide rather than changing database rows manually.

## Architecture and maintenance map

| Location | Responsibility |
| --- | --- |
| `src/server.js`, `src/app.js` | Configured single-process Node/Express composition, HTTPS, workers, middleware and mounting; no reverse-proxy trust. |
| `src/views/`, `src/public/` | Server-rendered EJS and browser CSS/JavaScript; browser previews and navigation never authorize roles or authoritative totals. |
| `src/ordering/`, `src/payments/` | Server validation, integer-cent prices, scheduling, persisted orders, generated encrypted synthetic payments and demo refunds. |
| `src/auth/`, `src/staff/`, `src/tracking/` | Individual identity/MFA/session lifecycle, permission-protected operations, reporting and minimal protected guest tracking. |
| `src/data/`, `src/notifications/`, `src/operations/` | Reviewed immutable migrations, SQLite transactions, retention, internal previews and redacted operational health. |
| `tests/`, `scripts/`, `docs/verification/` | Isolated synthetic fixtures, reusable verification commands and dated evidence; fixture routes are absent from the production entry point. |

The [schema proposal](data-schema-proposal.md) and linked domain guides describe
persisted/API contracts. [Environment/custody](secrets-operations.md) identifies
required configuration, access and key-loss limits. SQLite data/journals and keys
remain outside source/releases. Never edit an applied migration. Roll back code
only when it supports the current schema; otherwise stop and prepare a forward fix.
There are no application-managed backups: [recreation](disposable-data-recreation.md)
uses fresh disposable data and is not restoration of lost records or keys.

Reusable commands: `npm run test:storage`, `npm run test:staff:unit`,
`node scripts/verify-security.js`, and affected Playwright commands documented in
the [platform guide](cross-platform.md) and checkpoint records. Run broad native,
browser, manual accessibility and Lighthouse checks at the approved checkpoints;
do not accept another platform's visual references or infer a pass from a local run.

## Accounts, costs and private transfer

| Resource | Current boundary / handoff step |
| --- | --- |
| GitHub `perin1k/Luigis-Project` and Trello | Existing team resources. Receiving person verifies intended repository/board access and branch/review workflow privately; no ownership transfer performed here. |
| GCP `capstone-510915` / billing | Sponsor-owned approved direction; actual operator verifies account, credits, IAM, estimate and budget before provisioning. $25/month alerts are not a spend cap. |
| `luigispizzeria.duckdns.org` | Approved hostname; operator verifies current account control, protected update token and DNS. No transfer or DNS change performed here. |
| SQLite / TLS / MFA / payment material | New hosted-only private configuration and individual identities; secure operator handoff under the custody guide. Never transfer a developer database, publish secrets or send credentials through Trello. Brody Mensonides oversees privileged recovery. |
| Stripe / Wallet / email / SMS | Future external integrations; no live merchant or sending account is required for this demonstration. No provider ownership, live processing or native Wallet capability is claimed. |

Spot interruption, retained disk charges and the approved November 1, 2026, 11 PM
Chicago stop target are in the hosting record. Stopping is distinct from deleting
retained disks/keys. No ongoing hosting/support agreement or business recovery
guarantee is supplied by the class project.

## Dependency and asset inventory review

At the reviewed lockfile: Bootstrap 5.3.8 (MIT), Express 5.3.0 (MIT), EJS 3.1.10
(Apache-2.0) and OTPAuth 9.5.2 (MIT). The 193 dependency entries record MIT 141,
Apache-2.0 27, ISC 13, BSD-3-Clause 7, BSD-2-Clause 1, 0BSD 1,
`(MIT OR CC0-1.0)` 1 and MPL-2.0 2. Both MPL entries are development accessibility
tools (`@axe-core/playwright`, `axe-core`). This is a lockfile metadata inventory,
not a legal clearance or exhaustive review of every upstream file.

Bootstrap CSS is served locally; preserve its upstream notice. The pinned SecLists
password blocklist includes its MIT license at `src/auth/blocklists/LICENSE-SecLists`
and provenance/checksum in the authentication guide. Current CSS uses system/Georgia
font stacks; no `src/public/fonts` or `src/public/images` collection is present.
Before redistribution, the receiving team reviews upstream license/notice files
for shipped packages and tooling artifacts and settles project-source licensing;
no root project license or new redistribution grant was added here.

## Acceptance and receiving-person rehearsal

Reuse accepted [TEST-01](verification/test-01-menu-acceptance.md),
[TEST-02](verification/test-02-checkout-acceptance.md) and
[TEST-03](verification/test-03-acceptance.md) after change-impact review. Follow
[INT-01](verification/int-01-customer-journey.md),
[INT-02](verification/int-02-shared-records.md), [SEC](verification/sec-acceptance.md),
[QA-02](verification/qa-02-payment-privacy.md) and
[QA-03](verification/qa-03-concurrency-recovery.md) for current scope and gaps.
The focused parser patch passed 82 cases and fresh full/runtime advisory audits;
it does not establish a fresh full-platform release pass.

**Not yet performed:** someone other than the implementer follows this guide from
a clean checkout, identifies required private configuration without receiving
shared credentials, rehearses each applicable perspective and recovery procedure,
and reports missing steps. Record reviewer, date, exact commit, OS/runtime/browser,
steps/outcomes and unresolved issues on DOC-01. The operator subsequently verifies
the real Ubuntu target, trusted public HTTPS, persistence/redeploy, DNS/certificate
lifecycle, monitoring, permissions and teardown plan under OPS. QA-01 retains final
integrated acceptance. Record actual receiving-team acceptance only after review;
this document and its checklist do not constitute it.
