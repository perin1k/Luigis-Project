# TECH-03 — Review access and acceptance plan

Card: [TECH-03](https://trello.com/c/Hggeidgg). Prepared October 22, 2026.
Status: proposed review arrangement; professor access and review window await the
human's answer. This document does not create accounts, grant permissions, publish
the application or revise release acceptance.

## Recommended access arrangement

Use public customer ordering with invented contact details and generated synthetic
payment identities. Demonstrate employee and admin/owner screens through a team
member's own authorized session, rather than distribute a shared privileged login.
Do not expose credentials, MFA enrollment/recovery material, keys or raw data files.
The professor can observe distinct permission boundaries and denied operations
without receiving unnecessary administrative authority.

If independent staff access is required for grading, first confirm the individual
recipient, necessary role, access interval, MFA setup for privileged access and
revocation owner. Provision privately through the reviewed account lifecycle only
after approval; never publish passwords in this document, GitHub or Trello. Do not
promote an account to Owner merely to make a review convenient.

The professor's required date/time is pending. Public hosting remains on hold:
the instruction is preparation only, not provisioning. The approved hosted shutdown
target remains November 1, 2026, 11 PM America/Chicago; this does not establish a
deployment start date or promise availability. Follow [hosting decisions](hosting-design.md)
and [deployment instructions](deployment-runbook.md) after separate activation.

## Rehearsal and evidence checklist

Run against isolated synthetic data using the reviewed configured runtime. Record
the commit, environment, operator and actual result for every exercised scenario;
leave unrun scenarios unverified. Never claim the checklist itself is evidence.

- Customer: both service types, required contacts, editable choices, unavailable
  ingredients, authoritative prices/tax/tip, pickup capacity and recoverable errors.
- Demonstration payment: pre-submission no-charge disclosure, actual persisted
  confirmation, safe decline/retry and duplicate-submission handling. Show masked
  results only, with no real card entry or actual Apple Wallet/Stripe claim.
- Guest tracking: protected link, progress, rejected invalid/revoked access and
  administrator-reviewed replacement without contact/order-number lookup.
- Employee: permitted queue/detail and preparation transitions; denied privileged
  administration, including pending cancellation/inventory review locks.
- Authorized admin/owner: applicable role boundaries, cancellation review, full
  demonstration refund, menu/hours review, internal notification previews and
  purchased-record analytics. Reconcile the current role rollout before rehearsal.
- Operations: restart with retained state, readiness/worker failure handling and
  disposable recreation limits; do not destroy the working dataset to demonstrate.

Retain reproducible unit/integration results and per-flow Chromium, Firefox and
WebKit functional/visual evidence on the required platforms. Windows/Linux and
manual keyboard, zoom, contrast and representative screen-reader verification
remain required teammate work where unavailable in this Mac session. The recorded
Firefox startup failure is not a pass. Preserve Lighthouse 100-category gates and
only the page-specific SEO exceptions explicitly approved; do not infer new ones.

## Handoff and limitations

Provide reviewed source/commit, locked setup instructions, configuration names with
safe placeholders, [cross-platform prerequisites](cross-platform.md), migration/seed
procedures, deployment/rollback runbook and [recovery limits](disposable-data-recreation.md).
Record actual verification, remaining limitations and operator responsibilities;
source/setup/deployment handoff does not imply a continuing support obligation.

External-service substitutes must be explicit: payments/refunds are local demo
outcomes with committed records; notifications are internal previews, never sent
or delivered messages; native Wallet and real merchant settlement are unexercised.
Hosting plans are not a deployed endpoint. QA-01/02/03, OPS-06 and DOC-01 retain
their delivery scope and acceptance evidence.

TECH-03 remains open until the concrete access arrangement and review window are
settled. Account creation, hosted activation, actual rehearsal and release sign-off
must be recorded honestly on their implementation/acceptance cards.
