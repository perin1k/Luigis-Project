# Application and external-service boundaries

Current scope: [DECISION-07](https://trello.com/c/NKGL91hy), approved October 21,
2026. This supersedes mandatory live Stripe setup in older summaries. It does not
change applied migrations or claim an unfinished feature is implemented. Preserve
other members' reviewed work and dated decisions in the
[schema proposal](data-schema-proposal.md) and
[authentication design](authentication-design.md).

## Required experience and current status

Provide finished customer, employee and admin screens and a public GCP/DuckDNS
URL without a site-wide preview password gate. Staff/admin pages and endpoints
still need individual login and genuine server permissions; admins require
authenticator-app MFA. Public hosting does not grant staff access.

Data entry, validation, orders, availability, staff actions and analytics must
function against actual application records. Only approved external services may
use demonstration adapters, not application persistence or authorization.

| Area | Current implementation | Remaining delivery |
| --- | --- | --- |
| Customer UI | Homepage, database-backed menu/pricing review, themes, availability/errors, isolated confirmation preview | Persisted order/payment/tracking integration and remaining screens |
| Database | SQLite migrations, transactions, constraints and non-destructive menu seed | Reviewed services and additive schema changes |
| Staff access | Mounted HTTPS staff/MFA/enrollment/recovery/account-management screens and real permissions | Firefox/runtime and manual accessibility acceptance; operator-owned real setup |
| Payments | Local demo payments/full refunds, encrypted synthetic-number storage, committed order/hold confirmation and component accounting | Final acceptance; future remote-provider reconciliation remains separate |
| Notifications | Restricted event-driven internal previews, admin retry and preview/contact/grant expiry; no email/SMS sending | Firefox/manual accessibility and broader privacy acceptance remain open |
| Hosting | GCP/DuckDNS direction selected; no deployment claimed | Public HTTPS deployment, protected staff functions and reviewed costs |
| Stripe/Apple Pay | Future provider/native Wallet integration | Separately authorized replacement and verification before live money |

## Public demonstration checkout

Before submission, visibly disclose:

> Demonstration checkout—use test payment details. No charge will be made.

Keep the finished design and realistic method choices. Do not claim the Apple
Pay choice opens a real Wallet sheet. This specific disclosure is necessary for
public access; generic coming-soon/project-status copy is unnecessary.

The intended success flow must validate the order/contact/quote, current
availability and capacity server-side, process an approved demonstration outcome,
and commit genuine order/payment records safely. Preserve retry/idempotency and
failure recovery. Only then render “Payment successful,” receipt and tracking
from the committed result. No actual authorization, charge, settlement, payout
or refund occurs. Do not accept a browser price/outcome or invent an order.

The approved generated-identity BE-03 increment now records local demo payments
and confirms orders/holds atomically; see [payment design](demo-payment-design.md).
It accepts no browser card numbers. `/preview/confirmation` remains a labelled,
isolated design reference, not proof of an order. The actual checkout receipt is
built from committed application records.

## Synthetic payment-data safeguards and current design

The user approved generated synthetic identities after TECH-06 review. Full
server-generated numbers are encrypted; only masked details are returned. This
resolves public-input exposure without a tiny fixed allowlist. The following
original review requirements remain relevant to future public card entry or
hosted operations; current details and limitations are in the payment design:

- Server validation and public-input safeguards. The user rejected silently
  requiring a tiny predefined-number list. Generated identities resolve the
  current flow; any future public number entry needs a separate reviewed policy.
- Authenticated encryption, fresh per-record randomness, integrity verification,
  external key custody, key/version metadata, rotation and failure handling.
  Never commit keys or put them alongside ciphertext in the database.
- Masked normal views and redacted logs. No full numbers in browser storage,
  URLs, analytics, notifications, screenshots or command lines. Never persist
  security codes, PINs or real payment-card data.
- Ciphertext/key retention and deletion, including optional hosted copies. Do
  not assume indefinite retention because sanitized accounting survives teardown.
- Additive migrations and tests for invalid input, persistence failure,
  ciphertext tampering, missing/wrong keys, retries and unauthorized access.

Migration 003 currently constrains provider references to Stripe test mode and
requires event/confirmation evidence. It does not implement Stripe or a demo
processor. Migration 012 adds separate local demo refunds and component
allocations with an immutable-history backfill; see [BE-09](demo-refund-design.md).
BE-11 now processes confirmation, Ready, cancellation and refund events into
restricted internal previews, with admin retry and preview retention; it never
sends externally. See [the notification guide](notification-preview-design.md).
Migration 011 adds the local demo payment records;
no Stripe events or signatures are forged. Applied SQL/checksums stay unchanged. Existing password hashing is not reversible card
encryption, and no current module establishes secure card collection.

## Approved refinements recorded by the group

The dated schema/authentication documents record these approved policies:

- Six pizzas per order and six equivalents per rolling 20-minute capacity
  window, all sizes equal; ten drinks per order. Active holds/bookings consume
  capacity. Holds last at most 30 minutes; late payment success enters review.
- Full demo refunds including tax/tip, no fee deduction. There is no actual
  Stripe expense. Distinguish persisted pending/failed/succeeded refunds without
  claiming a real transfer. This resolves the earlier fee-deduction preference
  for the demo; it does not authorize live-money refund policies.
- Follow the documented fictional Cookeville tax/rounding policy for demo
  quotes, not invented rates or a claim of real tax filing/compliance.
- Internal notification previews only, never sent/delivered claims. Guest
  tracking uses protected links and admin-reviewed grant replacement, not
  automatic order-number/contact lookup.
- Contacts, grants and previews expire seven days after a final outcome,
  extended until at least seven days after pending cases resolve. Keep sanitized
  history until teardown. The [retention worker](retention-enforcement.md) now
  enforces disposable-demo contact/grant/preview and ciphertext expiry; broader
  privacy/operational acceptance remains open.
- No application-managed backups are required for this disposable demo; data
  may be lost/recreated. Optional hosted backups need explicit lifecycle/security
  decisions. Do not erase data or promise business recovery because of this policy.
- Individual local usernames/passwords and admin authenticator-app MFA are
  approved. Idle expiry is 30 minutes, absolute expiry eight hours. The existing
  primitives do not constitute completed login, MFA, bootstrap or recovery.

Older provider-specific statements in the schema proposal describe the original
storage design; DECISION-07 changes the service target without rewriting history.

## Future provider replacement and handoff

[PAY-01](https://trello.com/c/864iZOKQ) is future work, not a delivery gate. Use a
replaceable server contract for starting/querying/recording payment and refund
outcomes; keep internal demonstration mode explicit.

Actual Stripe use replaces local synthetic entry/storage with hosted or secure
embedded collection and provider references/tokens. It requires real merchant
ownership/configuration, secrets, verified webhooks, idempotency/reconciliation,
eligible Apple Pay setup and approved real-money policies. Adding an API key
alone is not sufficient. Do not forward stored synthetic numbers to a live
provider or reuse the synthetic store for real cards.

Keep fixtures private to tests. Handoff identifies actual versus demonstrated
services, deployment prerequisites and outstanding checks. Hosting/spending,
messages and live financial actions still need applicable authorization; this
document performs none of them.
