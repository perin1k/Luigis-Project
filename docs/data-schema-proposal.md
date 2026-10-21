# DATA-01 — Storage schema proposal

Status: schema proposal approved by the user, October 21, 2026. No database, migration,
dependency, public API, or application behavior is implemented by this document.
Story: [DATA-01](https://trello.com/c/qEievdfN).

## Scope and decisions

Design durable records for the approved menu, guest ordering, immediate payment,
fulfillment, cancellation/refund review, staff access, and reporting. Customer
accounts, rewards, marketing, delivery, and counted stock are outside this model.

The user approved a relational proposal with `snake_case` table/column names on
October 21. JavaScript continues to use Hungarian notation. This approval does
not select a database product or authorize migrations. A relational model makes
financial constraints, relationships, and transactional updates explicit. A
document store could hold an order snapshot conveniently, but would require more
application-managed cross-record consistency for reservations and reconciliation.

The user also confirmed that DECISION-05 governs contact requirements for this
schema: carry-out needs name and usable phone; dine-in needs name and usable
phone OR email. This supersedes the older name-only dine-in rule in AGENTS.md
for this approved increment. Existing browser behavior is unchanged here.

## Requirement sources

### Follow-up decisions approved October 21, 2026

- Scope is a class demonstration using synthetic customer data and Stripe test
  payments only. No live customer processing is approved.
- Delete synthetic customer contact details and expire guest tracking grants seven
  days after the order reaches a final outcome. Pending cancellation/refund cases
  remain available until resolved; the deletion deadline must not precede seven
  days after that resolution. Keep synthetic order/payment history until project
  teardown. Backup, audit and provider-copy lifecycles still need explicit design.
- Checkout capacity holds last 30 minutes, with earlier release on checkout
  expiry or confirmed payment failure. A successful payment received after release
  enters staff review rather than automatically starting preparation. This is a
  reservation lifetime, not a pickup estimate or capacity formula.
- The team initially owns admin access. Brody Mensonides is the designated admin
  recovery owner. Each team member uses an individual identity, not a shared login.
  Authentication, MFA enrollment and recovery mechanics remain to be selected.

These decisions refine the open items below; they do not implement deletion,
reservation jobs, provider configuration, accounts or access permissions.

Additional demo decisions approved October 21:

- Use configurable conservative capacity, counting each pizza size as one large
  pizza equivalent. The rolling preparation-window length and numeric limit
  are resolved by the subsequent six-per-20-minute decision. This is a demo assumption, not measured throughput.
- Use clearly labeled simulated tax and full test-payment refunds. Disable the
  processing-fee deduction for the demonstration, superseding DECISION-03's
  deduction preference within this demo scope. The simulated rate and rounding
  convention were superseded by the Tennessee-based research below.
- Email/SMS notifications remain internal previews. Do not send messages to
  customers or team recipients. The outbox models preview generation and status;
  a preview must not claim that an email or SMS was sent or delivered.

The broader provider-delivery and fee-allocation descriptions below preserve
future integration requirements; they do not enable those behaviors in the demo.

Further decisions approved October 21:

- Capacity is six pizzas in any rolling 20-minute window, all sizes counted
  equally. Active checkout holds and confirmed bookings both consume capacity.
  The existing per-order ceiling of ten pizzas does not guarantee that a
  ten-pizza order can fit this demo scheduling policy; oversized bookings need
  rejection or a separately approved multi-window preparation design.
- Delete internal notification previews alongside contacts. Retain sanitized
  audit history until project teardown. No application-managed backups are
  required for this disposable demo; data may be lost and recreated. Any later
  hosted backup service requires a separate lifecycle decision.
- The user rejected an arbitrary 10% simulated tax rate in favor of following
  Tennessee tax rules. Stripe remains test-only. Full test refunds and no
  processing-fee deduction remain the approved demo refund policy.

### Tennessee tax research — October 21, 2026

[Tennessee Revenue SUT-54](https://revenue.support.tn.gov/hc/en-us/articles/360058231192-SUT-54-Prepared-Food-Definition-and-Tax-Rate)
states that prepared food uses the standard 7% state rate plus applicable local
sales tax, rather than the reduced grocery-food rate.
[TNECD's Putnam profile](https://tnecd.com/counties/putnam/) lists Cookeville's
local option rate as 2.75%. Together these support a 9.75% prepared-food rate
for the fictional Cookeville setting; the local rate is not added twice.
No actual restaurant address exists for address-specific verification.

Fountain drinks served in seller-provided cups fall within the prepared-food
definition in SUT-54; use the same combined rate for this menu. Under
[Rule 1320-05-01-.76](https://regulations.justia.com/states/tennessee/title-1320/subtitle-1320-05/chapter-1320-05-01/section-1320-05-01-76/),
voluntary tips are excluded when returned to service staff. The user confirmed
that all demo tips are modeled as going to service staff; no actual payouts occur.
[T.C.A. 67-6-504(h)–(i)](https://law.justia.com/codes/tennessee/title-67/chapter-6/part-5/section-67-6-504/)
provides cent rounding using the third decimal place and allows invoice-level
calculation on combined state/local tax. Use invoice-level half-up cent rounding
on the taxable item subtotal, excluding voluntary tips. Percentage tips retain
the approved items-plus-tax basis, rounded half-up to cents. Use integer/rational
arithmetic, not binary floating-point dollars. A $10 item subtotal yields $0.98
tax and $10.98 before tip; a 10% optional tip is $1.10, total $12.08.

Research limitation: the official archived rule PDF was indexed but its full
fetch returned 403; the rule text and statute were checked through Justia's
reproductions (rule current through June 26, 2025). Recheck effective law and
address-specific rates before any future live use. Store tax
jurisdiction, effective policy/rates, taxable basis and computed cents with the
accepted quote so later changes do not alter paid receipts. No claim of complete
tax compliance or real filing/remittance is made by this research note.

### Final demo refinements approved October 21

- Online demo orders are limited to six pizzas total; drinks remain limited to
  ten. This expressly revises DECISION-05's ten-pizza ceiling for the demo.
  Do not split a larger order silently across bookings.
- Individual staff logins; authenticator-app MFA required for admins. Sessions
  expire after 30 minutes idle or eight hours absolute, whichever comes first.
  Store `last_activity_at` and absolute expiry; activity cannot extend the latter.
  Brody oversees audited recovery. Authentication provider/library, secure secret
  custody and exact recovery procedure require a BE-08 implementation review.
- Guest tracking links appear in demo confirmation and restricted internal
  notification previews. No automated lookup by order number/contact. An admin
  reviews the synthetic order, revokes the old grant and creates a replacement;
  replacement cannot extend the order's retention deadline. Audit replacement
  without recording the bearer secret.

## DATA-01 review boundary

This proposal defines the demo data model and approved policies. Earlier
source-summary references to open capacity/retention/tax choices are historical;
the dated decisions above govern the demo. Database/provider selection and
implementation mechanisms remain separate stories, not permission to invent
additional policy. The user approved this consolidated revision on October 21,
2026, completing DATA-01's documentation/design increment. This is not approval
of database implementation, deployment or live payment/customer processing.

DATA-02 must add concrete column types, foreign/check/unique constraints and
transaction tests for the selected database. BE-08 owns authentication, encrypted
MFA secret handling if local, recovery challenges and session enforcement.
Payment integration owns webhook verification and provider reconciliation.
These implementation choices must preserve the policies approved here.

| Source | Design consequence |
| --- | --- |
| [DECISION-02](https://trello.com/c/vjtCAKoD) | America/Chicago service dates; hours exceptions; reservations; cancellation holds; no-shows distinct from collection. |
| [DECISION-03](https://trello.com/c/ZbdYJC4o) | Stripe hosted checkout; immediate collection; separate payment/refund states; tax/tip/fee allocations. Fee deduction is a preference awaiting verification, not an executable rule. |
| [DECISION-04](https://trello.com/c/o8aVMLIw) | Protected guest tracking; notification delivery; payment/refund-date accounting; pickup-date workload reporting. |
| [DECISION-05](https://trello.com/c/FlmtzGlR) | Approved catalog; manual availability; aggregate limits of 10 pizzas and 10 drinks; purchased-price preservation; contact requirements. |
| [DECISION-06](https://trello.com/c/85noQnOR) | Employee/admin separation; required admin MFA; server authorization; auditable staff actions. |
| [TECH-01](https://trello.com/c/rZWMmHQn) | Database, hosting, region, ownership and budget remain open. |
| [TECH-02](https://trello.com/c/loOzXS4f) | Retention, deletion/export/correction, backups and recovery targets require a researched policy. No retention duration is invented here. |
| [TECH-05](https://trello.com/c/P0gOz9xZ) | Capacity units, hold expiry, timing races, tracking recovery, notification providers and rounding remain technical decisions. |

## Shared representation and invariants

- Primary keys are opaque identifiers; foreign keys reference existing records.
  Their concrete database representation remains part of DATA-02 review.
- Money uses nonnegative integer cents with a currency code. Arithmetic must stay
  within JavaScript safe-integer bounds. Do not store floating-point dollar values.
  Signed accounting entries are permitted only in the allocation ledger below.
- Event timestamps represent UTC instants. `service_date` is the restaurant's
  local calendar date in America/Chicago, not a date derived from the host timezone.
  Preserve the selected timezone and resolved instant for fulfillment bookings.
- Mutable records carry a revision number for compare-and-update operations.
  Concurrent edits must fail visibly rather than silently overwrite one another.
- Purchased descriptions and prices are snapshots. Retiring a catalog option
  must not erase or reprice a paid order. Restrict deletion of referenced records.
- Application validation and database constraints both protect critical values.
  Cross-row totals and state transitions require a transaction or equivalent
  serialization; a foreign key alone does not enforce business behavior.

## Catalog and availability

| Table | Key fields and constraints |
| --- | --- |
| `catalog_versions` | `id`, `revision`, `published_at`, `published_by`; identifies a reviewed pricing/menu version. |
| `pizza_sizes` | `id`, `catalog_version_id`, `code`, `display_name`, `diameter_inches`, `base_price_cents`, `topping_price_cents`, `marinara_quarter_cups`, `is_active`; unique code within version. |
| `crust_options` | `id`, `catalog_version_id`, `code`, `display_name`, `is_active`; regular/New York, no invented surcharge. |
| `toppings` | `id`, `catalog_version_id`, `code`, `display_name`, `is_active`; approved nine options. |
| `beverages` | `id`, `catalog_version_id`, `code`, `display_name`, `is_active`; approved six drinks. |
| `drink_sizes` | `id`, `catalog_version_id`, `code`, `price_cents`, `is_active`; small/medium/large. |
| `ingredients` | `id`, `code`, `display_name`, `is_available`, `revision`, `updated_at`, `updated_by`; manual flags only, no quantity/decrement fields. |
| `catalog_ingredient_requirements` | `id`, `catalog_version_id`, one of `pizza_size_id` / `crust_option_id` / `topping_id` / `beverage_id`, `ingredient_id`; exactly one option reference per row, unique option/ingredient pair. |

Base sauce/cheese requirements apply to every affected pizza size. Crust/topping
and drink dependencies allow precise blocking without disabling unrelated items.
Availability changes are audited; paid orders are never silently substituted.
The versioned catalog is the server authority; browser prices remain previews.
Seed facts come from DECISION-05 and AGENTS.md, not customer submissions.

## Orders and purchased snapshots

| Table | Key fields and constraints |
| --- | --- |
| `orders` | `id`, `public_reference`, `service_type`, `fulfillment_status`, `catalog_version_id`, `accepted_quote_id`, `created_at`, `received_at`, `preparing_at`, `baking_at`, `ready_at`, `completed_at`, `cancelled_at`, `not_collected_at`, `revision`; unique public reference is not tracking authorization. |
| `order_contacts` | `order_id` (unique), `customer_name`, `phone`, `email`, `redacted_at`; phone is text. Keep contact data separate to support later minimization without deleting financial history. |
| `order_lines` | `id`, `order_id`, `line_number`, `item_type`, `quantity`, `display_name_snapshot`, `unit_price_cents`, `line_subtotal_cents`; unique order/line number, positive integer quantity. |
| `pizza_line_details` | `order_line_id` (unique), `pizza_size_id`, `crust_option_id`, `size_name_snapshot`, `crust_name_snapshot`, `base_price_cents`, `topping_price_cents`; pizza lines only. |
| `pizza_line_toppings` | `order_line_id`, `topping_id`, `name_snapshot`, `unit_price_cents`; unique line/topping pair; topping price is per pizza. |
| `drink_line_details` | `order_line_id` (unique), `beverage_id`, `drink_size_id`, `beverage_name_snapshot`, `size_name_snapshot`; drink lines only. |
| `order_quotes` | `id`, `order_id`, `catalog_version_id`, `item_subtotal_cents`, `tax_cents`, `tip_cents`, `total_cents`, `currency`, `tax_policy_reference`, `rounding_policy_reference`, `created_at`, `expires_at`, `accepted_at`; immutable once accepted. |

Every line has exactly one matching pizza/drink detail record. Sum quantities
across all pizza lines <= 6 for the demo and across all drink lines <= 10. Minimum-order
policy is unresolved; do not infer a new policy from these upper limits.
Server computes each line and quote total. Total = items + tax + tip, with no
checkout surcharge. Tax and rounding policy must be approved before calculation.
Default tip is zero; percentages use items plus tax, excluding tip.

Quote acceptance records the reviewed price. A stale unpaid quote must be
recalculated and shown for approval before checkout. Paid snapshots are immutable;
corrections use explicit financial adjustments and audit records.

An accepted quote freezes its associated lines until the checkout attempt is
resolved. Editing afterward requires a new quote and explicit invalidation of
the old checkout; an old provider session must not purchase newly edited lines.
Enforce matching order IDs across quotes, attempts, refunds and allocations, and
matching catalog versions across size/crust/topping references. Keep unpaid
orders out of the operational Received queue; set `received_at` only when verified
payment accepts fulfillment. Only one successful collection may fund an order;
an unexpected additional success requires reconciliation/refund review.

## Fulfillment and concurrency

| Table | Key fields and constraints |
| --- | --- |
| `service_days` | `id`, `service_date`, `timezone`, `opens_at`, `closes_at`, `cutoff_at`, `latest_pickup_at`, `is_closed`, `revision`, `changed_by`; one effective schedule per service date. |
| `fulfillment_bookings` | `id`, `order_id` (unique), `service_day_id`, `selection_type` (ASAP/scheduled), `promised_at`, `minimum_lead_minutes`, `capacity_policy_reference`, `revision`; persist the promised instant, including off-grid ASAP times. |
| `capacity_windows` | `id`, `service_day_id`, `starts_at`, `ends_at`, `capacity_units`, `policy_reference`, `revision`; demo policy: six pizzas per rolling 20 minutes, all sizes equal. |
| `capacity_holds` | `id`, `booking_id`, `capacity_window_id`, `reserved_units`, `state`, `expires_at`, `confirmed_at`, `released_at`; positive units, explicit active/confirmed/released/expired state. |
| `order_events` | `id`, `order_id`, `sequence`, `event_type`, `from_status`, `to_status`, `occurred_at`, `actor_id`, `reason_code`; unique order/sequence, append-only. |
| `fulfillment_reviews` | `id`, `order_id`, `trigger_type`, `trigger_reference`, `state`, `opened_at`, `resolved_at`, `resolved_by`, `resolution`; hours changes and unavailable ingredients trigger visible reviews of affected paid bookings. |

Normal local hours are 10:00–23:00; cutoff 22:30; latest pickup 22:50.
Scheduled slots run 10:00–22:40 at 20-minute intervals and still require lead
and capacity checks. ASAP need not align with slots. Before opening allows the
same service day; after cutoff offers the next open day only. Special schedules
derive cutoff/last pickup from closing minus 30/10 minutes. No silent rescheduling.

Fulfillment transitions: Received -> Preparing -> Baking -> Ready -> Completed.
Cancelled and Not collected are distinct outcomes. Only verified payment may
release an order to fulfillment. Prepared no-shows are marked Not collected at
closing; this does not imply an automatic refund.

For the rolling demo rule, test every affected 20-minute span of promised pickup
instants, using half-open intervals so bookings exactly 20 minutes apart do not
overlap. A fixed clock-aligned bucket alone is insufficient. Serialize competing
reservations across overlapping spans, including active holds and confirmed
bookings; a per-window constraint alone cannot protect a rolling limit.

Reserve capacity and accept the quote atomically against current revisions;
never allocate more active/confirmed units than the capacity window permits.
Inventory recheck, cancellation-hold check and transition to Preparing must
serialize on the order. Multiple windows may be needed for one booking; no
assumption equates a 20-minute pickup slot to a single oven batch. The oven's
12-large/eight-minute facts do not determine prep throughput or mixed-size units.
Late payment after an expired hold requires a recorded recovery/review decision,
not automatic fulfillment without capacity or a discarded successful payment.

## Cancellation, payment and accounting

| Table | Key fields and constraints |
| --- | --- |
| `cancellation_requests` | `id`, `order_id`, `source`, `reason_code`, `state`, `requested_at`, `decided_at`, `decided_by`, `decision_reason`; at most one pending request per order. |
| `payment_attempts` | `id`, `order_id`, `quote_id`, `provider`, `provider_checkout_id`, `provider_payment_id`, `idempotency_key`, `state`, `amount_cents`, `currency`, `created_at`, `paid_at`, `failed_at`; unique non-null provider identifiers and scoped idempotency key. |
| `provider_events` | `id`, `provider`, `provider_event_id`, `event_type`, `occurred_at`, `received_at`, `processed_at`, `processing_state`, `attempt_count`, `sanitized_error_code`; unique provider/event pair; no unfiltered payload archive. |
| `refunds` | `id`, `payment_attempt_id`, `cancellation_request_id`, `provider_refund_id`, `idempotency_key`, `state`, `requested_cents`, `confirmed_cents`, `requested_at`, `confirmed_at`, `failed_at`, `approved_by`, `policy_reference`; unique provider refund and scoped retry key. |
| `financial_allocations` | `id`, `order_id`, `payment_attempt_id`, `refund_id`, `order_line_id` (nullable), `component`, `signed_cents`, `effective_at`, `source_reference`, `reversal_of_id`; append-only components: item, tax, tip, processor_cost, retained_fee_recovery. |

Pending customer cancellation before Preparing holds preparation until an admin
approves or denies; there is no automatic timeout result. After Preparing,
customer requests are blocked; an admin can record a restaurant-caused exception.
Inventory cancellation reviews concern the whole order, with an apology and
refund review. Approval, fulfillment cancellation, and provider refund success
are separate facts. Refund failure must remain visible and retryable.

Only verified provider evidence establishes payment/refund success. Persist the
provider event and its state mutation in one transaction; duplicate delivery must
not duplicate a charge, refund, allocation, or notification. Webhook signature
verification occurs before processing. Never infer success from a redirect.
Guard cumulative refunds against the captured amount under concurrent requests.

Refund allocations separate item reversal, tax, refundable tip and any permitted
fee recovery. Record actual nonreturned processor fee evidence rather than a
hard-coded fee. DECISION-03's deduction preference remains blocked by TECH-06
verification; this proposal does not authorize or assert legality of deductions.
Do not subtract a fee twice or report retained cancellation recovery as item sales.
Payment/refund component sums must reconcile to verified provider amounts;
processor cost is a separate expense, not extra customer consideration.

## Identity, private tracking, notifications and audit

| Table | Key fields and constraints |
| --- | --- |
| `staff_users` | `id`, `identity_subject`, `role`, `state`, `created_at`, `disabled_at`, `revision`; employee/admin only; unique identity subject. Credential ownership awaits TECH-04. |
| `staff_sessions` | `id`, `user_id`, `session_token_digest`, `authenticated_at`, `last_activity_at`, `mfa_verified_at`, `expires_at`, `revoked_at`; unique digest, never a raw bearer token; enforce approved idle/absolute limits. |
| `mfa_references` | `id`, `user_id`, `provider_reference`, `state`, `enrolled_at`, `revoked_at`; store references, not raw recovery codes or authentication secrets. |
| `tracking_grants` | `id`, `order_id`, `token_digest`, `created_at`, `expires_at`, `revoked_at`; random bearer secret shown in protected demo confirmation/preview, only digest persisted; apply approved seven-day/manual-recovery policy. |
| `notification_outbox` | `id`, `order_id`, `source_event_id`, `channel`, `template_key`, `state`, `attempt_count`, `next_attempt_at`, `provider_message_id`, `sent_at`, `delivered_at`, `sanitized_error_code`; unique source-event/channel/template key. |
| `audit_events` | `id`, `actor_id`, `action`, `entity_type`, `entity_id`, `occurred_at`, `correlation_id`, `reason_code`, `safe_change_summary`; append-only, allowlisted summaries excluding customer contacts/tokens/raw provider payloads. |

Admin-only actions include menu/price changes, employee management, special
hours, cancellation/refund approvals and analytics. Employees/admins may update
availability and authorized preparation status. Admin sessions require verified
MFA. Employee management cannot grant admin creation rights. Provisioning,
recovery and session lifetimes remain TECH-04 decisions; do not invent passwords
or create an administrator through seed data.

Guest tracking authorizes access to one order through a protected grant; an
order number alone is insufficient. Rate limits and safe recovery belong to the
implementation security review. Logs and analytics must redact token-bearing URLs.

Create outbox records in the same transaction as verified confirmation, Ready,
and cancellation/refund events. Use email when supplied, SMS for usable phones,
both when both exist. Resolve destinations from restricted contact records;
do not duplicate contacts into ordinary logs. Workers retry with provider-aware
deduplication and expose exhausted failures. Sender/provider selection is open.

## Reporting support

- Period item sales: payment-date item allocations minus refund-date item
  reversals, including refunds of older purchases. Preserve both event dates.
- Tax, tips, processor costs and retained cancellation recovery remain separate.
  Cancelled items are not pizza revenue; cancellation item reversal treatment
  must not depend on the amount of cash retained for processor-fee recovery.
- AOV: non-cancelled paid orders whose payment dates fall in the cohort range;
  item revenue after refunds / eligible count. Include paid no-shows; exclude
  cancellations from numerator and denominator. No eligible orders -> no average.
  Later refunds may revise prior-cohort AOV.
- Best-selling quantities use purchased line snapshots with explicit reversal
  treatment, not current menu prices. Final metric query details require review.
- Busy periods use promised pickup instants grouped in America/Chicago, with
  cancellation/no-show outcomes separate. Received-to-Ready uses event timestamps
  and is elapsed waiting/preparation time, including overnight waiting.
- Ready-by-pickup compares `ready_at` to the preserved promised instant. Missing
  timestamps must be surfaced/excluded with explicit coverage counts, not zeros.
- Candidate indexes: order status/service date, booking promised time, pending
  cancellation/review state, active holds per window, provider event key,
  payment/refund effective date, allocation order/date, outbox due state and token
  digests. Final index selection follows actual queries and chosen database.

## Retention, migration and acceptance

Contact separation supports redaction after the approved retention period while
preserving required financial records. Token/session expiry, outbox content,
audit retention, backup expiration, legal holds and export/correction rules must
be researched and approved in TECH-02/SEC-02. Redaction must account for backups
and delivery-provider copies; a nullable contact column alone is not deletion
compliance. No automatic deletion schedule is selected here.

DATA-02 must translate this reviewed model into database-specific constraints,
migrations and tests after TECH-01 selection. Use synthetic fixtures only.
Introduce schema/version tracking, a clean-install test, upgrade test, and
rollback or forward-recovery procedure. Before destructive migrations, prove
restore from a verified backup; never drop purchased history for convenience.

Acceptance scenarios for the later implementation:

1. Preserve a paid pizza's prices after catalog edits; reject stale unpaid quotes.
2. Reject unsupported options, duplicate toppings, fractional/negative quantities,
aggregate counts over six pizzas/ten drinks, invalid contacts, and unsafe monetary values.
3. Concurrent final-slot requests cannot both reserve excess capacity; payment
   after expiry and cutoff races enter explicit recovery paths.
4. Race cancellation against Preparing: one serialized decision wins; a pending
   request blocks preparation until admin decision. No-show is not Completed.
5. Duplicate/out-of-order provider callbacks and retries produce one financial
   effect; failed/pending refunds never appear complete; allocation sums reconcile.
6. Verify partial/composite refunds and historical reporting across service-day,
   payment-date, refund-date and DST boundaries with synthetic records.
7. Employee sessions cannot edit prices, approve refunds, create admins or read
   analytics; disabled/revoked sessions and invalid tracking grants fail access.
8. Notifications are emitted after verified events, survive worker retries and
   expose failures without logging customer data or secrets.

This increment requires documentation content/diff review only; no executable
behavior changed. Browser, accessibility and Lighthouse gates apply to later
application changes. The user approved DATA-01 on October 21, 2026; the card is
to move to In Progress under the requested board workflow. DATA-02 requires its
own implementation plan and approval; open technical choices remain unresolved.
