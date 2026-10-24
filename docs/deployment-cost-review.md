# OPS-02 deployment review — provisional public-price comparison

October 23, 2026 (America/Chicago). The human authorized beginning deployment
review and a current cost estimate. **Creating billable resources is not yet
authorized.** Earlier preparation-only records remain historical; this increment
permits investigation, not account agreements, access changes or provisioning.

## Access result

The approved project URL for `capstone-510915` was opened in the authenticated
console. The console reported additional access was needed and then displayed
a first-use Google Cloud Terms of Service dialog for the signed-in account.
No terms were accepted, account switched, permission requested/granted or billing
changed. The human was asked to confirm the intended sponsor account and handle
any agreement personally. The local gcloud executable is unavailable.

Consequently project ownership/access, billing linkage, remaining credits,
quota/Spot availability, existing resources and project-specific prices remain
unverified. The October 22 credit screenshot in the hosting record is not a fresh
balance or evidence that new charges will be covered. Do not publish account,
billing or credit identifiers in this document or Trello.

## Public USD comparison

The selected resources remain one `e2-small` Spot VM in `us-central1-a`, Ubuntu
24.04 LTS amd64 (not Ubuntu Pro), 20 GiB balanced boot plus 10 GiB separate retained
balanced data disk, and one ephemeral external IPv4. No load balancer, Cloud NAT,
Cloud SQL, paid DNS zone, snapshot, reservation or committed-use contract is added.

| Component | Public price basis | 240 hours | 730 hours |
| --- | --- | ---: | ---: |
| Compute comparison | E2-small Iowa **on-demand** $0.016752855/hour | $4.02 | $12.23 |
| Both zonal balanced disks | 30 GiB × $0.000136986/GiB-hour | $0.99 | $3.00 |
| In-use Spot IPv4 | $0.0025/hour | $0.60 | $1.83 |
| Arithmetic subtotal, rounded after summing | See boundaries below | **$5.61** | **$17.05** |

Sources checked October 23: [Google general-purpose VM pricing](https://cloud.google.com/products/compute/pricing/general-purpose?hl=en)
(Iowa e2-small default/on-demand), [balanced disk pricing](https://cloud.google.com/compute/disks-image-pricing)
and [external IPv4 pricing](https://cloud.google.com/vpc/network-pricing).
Disk units are GiB; the hourly disk rate corresponds to approximately $0.10/GiB
per 730-hour month. Retained disks continue costing money after the VM stops.

**This is a comparison scenario, not a verified Spot quote or total bill.**
The current e2-small Spot compute rate was not reliably resolved from the public
Spot table; the on-demand compute price is used conservatively for planning only.
It does not authorize an on-demand fallback or guarantee an upper bound on future
pricing. Confirm the actual Spot SKU and region in the accessible project before
provisioning. [Spot prices](https://cloud.google.com/spot-vms/pricing) vary.

240 hours means ten continuously running days, not a promised start date or exact
remaining duration. 730 hours is a comparison month; actual billing follows usage.
The approved shutdown remains November 1, 2026, 11 PM Chicago (November 2 05:00 UTC).
Do not extend service because the comparison includes more hours.

These subtotals exclude internet egress, applicable taxes, optional telemetry,
extra storage/operations and any existing project charges. No free-tier or credit
offset is assumed. Local-only seven-day application logs are selected; verify
default cloud logging/monitoring agents and charges rather than enabling new
collectors. Traffic destination/volume must be entered in the final estimate;
the subtotal alone cannot establish compliance with the $25 monthly alert target.
Alerts do not enforce a spending cap.

## Exact review required before resource creation

Once the intended account can access the project:

1. Read existing resource inventory, billing linkage/credit eligibility and quota.
   Avoid duplicate resources or touching another teammate's running environment.
2. Resolve the approved Ubuntu family to its exact image; check Spot e2-small
   availability and actual compute/IP/disk pricing. Do not accept paid fallbacks.
3. Complete a dated project-specific estimate, including runtime until shutdown,
   retained-disk duration, expected egress/logging and any existing project usage.
   Present that estimate and the exact create/change operations for human approval.
4. Only after approval, execute the existing [deployment runbook](deployment-runbook.md)
   and [hosting record](hosting-design.md): private mounted storage/keys,
   least-privilege IAP/OS Login and targeted firewall, direct Node HTTPS,
   DuckDNS/certificate lifecycle, alert budget and isolated hosted identities.
   Any access grant, agreement, credential or public exposure retains its applicable
   action-time review; no broad Owner role for the Node process.
5. Rehearse actual host restart, persistence, DNS/TLS renewal, rollback, monitoring,
   privacy/access and shutdown controls. OPS-06 publication and final QA remain
   separate gates. Never infer readiness from this estimate or a running VM.

Validation: primary price/source review, independent subtotal arithmetic, local
document-link and diff review. No runtime tests apply to this documentation-only
estimate; no cloud account capability, billable resource or deployed pass was
fabricated. OPS-02 remains In Progress for review/access and later implementation.
