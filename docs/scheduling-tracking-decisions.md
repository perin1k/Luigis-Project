# TECH-05 — Scheduling, tracking and notification decisions

Decision scope: [TECH-05](https://trello.com/c/P0gOz9xZ), consolidated October 22,
2026. This maps the settled policies and technical contracts to existing services;
it does not replace feature or release acceptance, or claim another contributor's
work as new implementation.

## Scheduling and competing writes

[Scheduling design](scheduling-design.md) specifies America/Chicago service dates,
DST conversion, normal/special hours, cutoff and latest pickup, minimum 20-minute
lead, scheduled opening-based 20-minute spacing and off-grid ASAP promises. The
server offers the earliest eligible service day, not arbitrary future dates.

All pizza sizes count equally: six pizzas per order and per rolling half-open
20-minute window; ten drinks per order. Active unexpired holds and confirmed
bookings consume capacity. The scheduling service checks overlapping promises,
not just fixed clock buckets. Order acceptance reserves capacity within the same
synchronous immediate SQLite transaction as order/contact/quote writes. Competing
connections serialize their authoritative recheck and reservation; no transaction
is held across asynchronous work. Tests cover competing connections and boundaries.

Holds last 30 minutes; replay does not extend them. Expired/released holds cannot
silently confirm. [Payment design](demo-payment-design.md) rechecks hold, quote,
hours, capacity and availability before atomic confirmation; confirmed failure
releases capacity. The current synchronous local adapter has no delayed provider
callback. Any future asynchronous late success must enter staff review rather
than start preparation automatically.

[Menu management](menu-management-design.md) records explicit review of affected
paid bookings after hours/ingredient changes, without silently moving a pickup or
substituting ingredients. Preparation rechecks availability and cancellation/review
locks. No counted inventory or new notification provider is introduced.

## Protected tracking and operational decisions

[Tracking and exceptions](tracking-and-exceptions.md) defines random 256-bit guest
tokens, stored only as digests, with a fragment-based private link and bounded
same-origin POST contract. The public response contains only approved progress
fields, not contacts, payment totals, staff notes or secrets. Order numbers and
contact details never authorize lookup. An authorized administrator reviews link
replacement; replacement revokes the old grant and preserves retention limits.

Cancellation requests before Preparing hold the order for explicit review with
no automatic timeout decision. Customer requests stop at Preparing; authorized
restaurant cancellation remains possible. Prepared no-shows are marked Not
collected after closing, without an automatic refund. [Refund design](demo-refund-design.md)
keeps cancellation and genuine full demonstration refund outcomes distinct.
Current server permissions, revision checks, CSRF and transport guards govern
staff mutations; browser-supplied roles or review flags alone grant no authority.

## Preview generation, cleanup and browser contracts

[Notification preview design](notification-preview-design.md) uses transactionally
queued genuine confirmation, Ready, cancellation and refund events, deduplicated
by event/channel/template. A bounded synchronous worker creates internal text
previews; it never sends email/SMS or claims delivery. Failed rendering is recorded
without raw exceptions; authorized explicit retry cannot duplicate completed work.
Preview content excludes recipient addresses and raw tracking links. Original
tracking links appear at payment confirmation; lost links use reviewed replacement.

[Retention enforcement](retention-enforcement.md) supplies actual startup/minutely
cleanup, not just schema tables. Contacts, grants and previews expire seven days
after final outcome, extended for unresolved cancellation/refund cases until at
least seven days after resolution. Unpaid-checkout and independent ciphertext
deadlines follow their separately approved rules. Reads enforce access expiry
immediately; sanitized financial/audit history remains until teardown.

The linked file guides distinguish server policy/persistence from browser
presentation. Browsers display authoritative selection/hold/progress/preview
results, handle loading, conflicts and recoverable failures, and reject stale
responses. They do not establish capacity, authorization or payment success.
Sensitive tracking/payment/preview state is not persisted in browser storage.

## Completion boundary and verification

The required technical choices and service contracts are recorded. Detailed
implementation evidence remains with BE-10, BE-05 and BE-11 verification records
and their linked tests; this consolidation does not claim fresh runtime results.
Their related BE/FE, integration, security and QA cards retain delivery acceptance.
Firefox, Windows/Linux and manual screen-reader checks remain required teammate
verification. Hosting and external delivery remain separately controlled scope.

This documentation-only change requires content, source-reference, local-link and
diff review. It changes no application behavior, data, applied migration or key.
