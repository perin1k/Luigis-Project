# OPS-06 public deployment verification

October 24, 2026. Scope: the approved public GCP/DuckDNS preview, not final
product release acceptance. No new infrastructure, spending, dependencies,
deployment, credential changes, orders or destructive operations in this increment.

## Current observed deployment

Read-only GCP CLI inspection confirms the service is active as unprivileged
`luigis:luigis`, with `ProtectSystem=strict` and `NoNewPrivileges=yes`.
The retained `/var/lib/luigis-data` mount has `nosuid,nodev,noexec` options.
The current source is `8ad900a2bbda07570c0df4fb7d1ebd6258986f2a` at
`/opt/luigis/releases/8ad900a2bbda07570c0df4fb7d1ebd6258986f2a-node-24.22.1`;
the active Node runtime reports 24.22.1. Later documentation/verifier commits
are not claimed as deployed application code.

Trusted HTTPS requests used normal certificate verification, no authentication,
and no redirect following against `https://luigispizzeria.duckdns.org`:

| Boundary | Observed result |
| --- | --- |
| `/`, `/order` | 200, no site-wide password gate; order HTML includes “No charge will be made” and uses no-store |
| `/health/live`, `/health/ready`, `/health/previews` | 200, no-store/noindex |
| `/staff/sign-in` | 200, no-store/noindex |
| `/staff/account`, `/staff/orders` | 303 to staff sign-in, no-store/noindex |
| `/staff/analytics` | 403, no-store/noindex |
| `/api/staff/orders` | 401, no-store/noindex |
| `/.env`, `/src/server.js`, `/src/views/pages/home.ejs` | 404, no-store/noindex |
| `/data/luigis-demo.sqlite`, `/node_modules/express/package.json` | 404, no-store/noindex |
| `/__test/code`, `/__test/reset` | 404, no-store/noindex |

These are sampled boundary checks, not exhaustive URL discovery. HSTS was absent
from these responses; no HSTS claim is made. Direct trusted HTTPS is the reviewed
architecture; no reverse proxy was added. Existing TLS/session/network security
evidence below remains distinct from these anonymous HTTP checks.

## Reused acceptance evidence

| OPS-06 requirement | Evidence |
| --- | --- |
| Genuine public customer/staff access and MFA | [INT-02 hosted acceptance](int-02-hosted.md): private operator run `64fae18a01e1`, all eight stages passed, order resolved and temporary staff cleaned |
| TLS, firewall, storage and secret separation | [OPS-02](ops-02-hosted.md), [custody](ops-03-custody.md), [maintenance](ops-07-maintenance.md), plus current read-only host observations above |
| Genuine demo checkout, not live financial processing | Existing explicit no-charge public disclosure and actual persisted hosted Customer → Employee → Admin refund → Owner reporting journey |
| No public fixture/source/data exposure | Sampled 404 results above; prior source/security review; protected permissions verified by INT-02 |
| Record preservation and lifecycle | Actual retained-data restart/redeploy/compatible rollback evidence in OPS-02/07; disposable data requires no app-managed backup. No teardown or data deletion was performed |
| Repeatable deployment and operator instructions | [Runbook](../deployment-runbook.md), [release tooling](../../deploy/README.md), [maintenance](../maintenance-continuity.md), [custody](../secret-custody.md), [monitoring](../operations-monitoring.md) |

The approved host is project `capstone-510915`, `e2-small` Spot in
`us-central1-a`; Brody controls GCP/DuckDNS operations. Budget alerts are not a
spending cap, credit coverage remains unverified, and retained disks incur costs.
The existing stop deadline is November 1, 2026 at 11 PM America/Chicago
(November 2 at 05:00 UTC); it retains disks/keys. No deletion is authorized.
Certificate/DNS/alert drills and cost boundaries retain their accepted OPS records.

## Publication status and remaining dependencies

The public preview is deployed and its focused publication checks pass. OPS-06
is **Ready for Testing, not Done**: the card explicitly requires preview deployment
followed by final acceptance. QA-01 retains trusted hosted Lighthouse and final
integrated/manual/device acceptance; QA-02 retains final actual-host payment/privacy
review; QA-03 retains hosted load/recovery/performance acceptance. Existing OPS
evidence can support those reviews without silently closing them. DOC-01 retains
the receiving-person handoff rehearsal and accepted delivery package.

No broad browser/Lighthouse suite was repeated for this documentation/boundary
increment. All original card criteria remain; final publication cannot be inferred
from a healthy preview or completed INT-02 alone. QA ownership remains with Perin;
John's implementation is preserved. Any new defect or changed configuration needs
impact review and appropriate focused verification.
