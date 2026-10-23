# SEC-02 internal demonstration data inventory

Scope: current repository implementation, October 22, 2026. This is an internal
engineering inventory, not a published privacy policy or a legal compliance claim.
Story: https://trello.com/c/ehrcmOun. Use invented contacts only. No real orders,
payments, provider delivery or durable business operation is approved.

| Data and purpose | Storage and access | Lifecycle |
| --- | --- | --- |
| Name, phone, optional email identify an order and support staff handling | `order_contacts`; server validation requires carry-out phone, or dine-in phone/email. Authorized staff order reads; browser ordering state stays in memory/DOM | Redacted seven days after final outcome, extended for unresolved cases. Unpaid checkout rule below |
| Purchased items, quote, tax/tip, schedule, order events and financial allocations preserve genuine demo history | SQLite snapshots and event/ledger tables; server services and permission-checked staff/analytics routes | Until project teardown; cleanup preserves history |
| Protected guest access | Tracking-token digests in SQLite; raw link returned in confirmation/replacement, browser fragment and memory | Final-outcome deadline and explicit grant caps; replacement revokes old grant without extending retention |
| Synthetic payment number | Generated server-side, encrypted with integrity protection in `demo_payment_secrets`; external versioned keys. Ordinary history contains masked details | Ciphertext removed seven days after attempt, independently of unresolved order cases. No security-code persistence or real card collection |
| Internal notification messages | Outbox and preview bodies; staff permissions and admin retry. No external sending/delivery, recipient address list or raw tracking grant in previews | Deleted with expired order contacts; reads enforce deadline |
| Staff identity, password verifier, MFA/recovery and session material | Staff/auth tables, hashed passwords and token/recovery digests, encrypted MFA material with separate key; protected account procedures | Separate account/session lifecycle; customer seven-day cleanup does not delete staff identities. Sessions idle-expire at 30 minutes and absolutely at eight hours |
| Login throttling | Digest buckets, timestamps and attempt counts in authentication storage | Authentication-specific lifecycle; not an order contact record |
| Sanitized audit evidence | Fixed allowlisted summaries, opaque record/actor IDs, timestamps and correlation IDs in audit storage; database/operator access remains privileged | Until teardown; no raw contact, card number, message body or guest token in retention audit events |
| Theme preference | Browser local storage only; no order/contact payload | Visitor-controlled preference; ordering must remain usable without storage |

Unpaid accepted checkouts expire seven days after checkout expiry or last confirmed
payment failure, whichever is later. Hold expiry and resolved-case times can extend
the baseline. Pending or successful payments, confirmed holds, open reviews and
unresolved cancellation/refund cases prevent this cleanup. Details and reproducible
tests: [retention enforcement](retention-enforcement.md).

The accepted quote identifier is a hash derived partly from contact input; retained
history therefore includes derived linkage. Redacting contact columns does not
establish full anonymization. SQLite deletion also does not guarantee physical
erasure of pages, filesystem snapshots, browser autofill or external copies.
No application-managed backups are promised for this disposable demonstration.

Server responsibilities are validation, persistence, permissions, deadline checks,
transactional cleanup and sanitized audit creation. Browser scripts handle forms,
in-memory selections and presentation; they do not authorize access or enforce
retention. `src/data/order-retention.js` owns shared deadlines;
`src/data/retention-service.js` performs cleanup, invoked by `src/server.js` on
startup and every minute. Existing auth, tracking and notification modules retain
their respective access controls. No dependency or database schema was added.

## Remaining acceptance work

- Admin-mediated contact correction/data-copy handling was approved October 22;
  no public lookup/export feature is authorized or implemented. A tracking link
  does not grant broader personal-data export permission.
- The human deferred public privacy-policy publication and the contact email for
  this class demonstration on October 22. No address is invented or published.
  Revisit accurate policy/contact information before future hosted or real use.
- Complete hosted verification of operator, proxy/log and external-copy/key controls
  before hosting. The [repository operator review](privacy-operator-review.md) records
  inspected controls and outstanding deployment checks.
- Complete the existing application browser/accessibility acceptance work, including
  the recorded Firefox startup blocker. Server retention tests do not waive it.

Stripe and outbound email/SMS remain future integrations. Hosting plans do not mean
a live deployment exists. Optional rewards/profile collection is outside this
inventory's implemented ordering scope. Keep SEC-02 open for the remaining work.
