# BE-11 internal notification previews

Story: https://trello.com/c/7V9PKfRN. This uses the team's existing outbox schema
and BE-03/05/09 application events. It never sends email/SMS, calls a delivery
provider, or records sent/delivered claims. No sender account or new dependency
is needed. Future external delivery requires separate authorization and design.

## Behavior and file guide

- `src/notifications/outbox.js` centralizes event/channel/template deduplication.
  Confirmed demo payment, Ready, cancellation and confirmed demo refund services
  queue notices in the same transaction as their actual event. Missing/redacted
  contacts produce no notice. A failed payment/refund produces no success notice.
  Existing channel uniqueness preserves one preview per event/channel/template.
- `src/notifications/notification-service.js` processes at most 50 pending notices
  per transaction, validates the persisted source against its template and
  confirmed payment/refund, and generates plain-text content. Order confirmation
  includes service/ready time in America/Chicago; Ready distinguishes dine-in and
  pickup. Cancellation and refund remain separate. A recorded inventory-change
  review adds an apology to the cancellation message. A cancellation never claims
  refund completion. Text stores no recipient address, card identity, credentials
  or raw private tracking link. Confirmation reminds the recipient to retain the
  original protected link; hashes cannot reconstruct it. Original link display
  remains in payment confirmation, with admin-reviewed replacement available.
- Successful generation records `previewed`, timestamp, attempts, text and a
  sanitized audit in one transaction. A renderer failure records `failed` and
  `render_failed`, never its raw exception/contact data. A database/audit failure
  rolls the transaction back, leaving work retryable. No asynchronous work occurs
  under a SQLite lock. `fnRender` is a trusted synchronous test/renderer boundary,
  not a public input or delivery adapter.
- Staff with `orders.read` can view previews. Only authenticated MFA admins with
  the new `notifications.retry` permission can return a failed notice to pending.
  Repeated retry of pending/previewed work does not duplicate it or regenerate
  completed content. Failures require an explicit admin retry; no hidden loop
  repeatedly retries failed generation.
- `src/staff/orders-router.js` adds GET
  `/api/staff/orders/:reference/notifications` and POST
  `/api/staff/orders/:reference/notifications/retry`. Both inherit direct TLS,
  pinned origin/host, no-store/noindex and server session checks. Retry requires
  CSRF, JSON at most 1 KiB, and exactly `{strNotificationId}` on the matching
  order. Neither grants public tracking or financial authority.
- `src/views/pages/staff-orders.ejs` adds a native expandable panel on existing
  detail pages. `src/public/js/staff-notifications.js` loads previews only when
  opened, renders text safely, preserves natural keyboard controls and handles
  loading/empty/failure/expired states. Retry queues generation; refresh checks
  the committed result. Generation counters are checked after response parsing
  so a closed/denied view cannot be repainted by an old response. Session denial
  clears both preview and order data through a shared browser event in
  `staff-orders.js`. No data goes into browser storage. Old storage-only
  `previewed` rows without saved text display unavailable content honestly.
- `src/server.js` runs processing on startup and every second for configured
  database runtimes, using an unref'ed timer stopped before database shutdown.
  Errors log only a fixed message; persisted pending work remains. Public HTTP
  can process local records but does not mount staff APIs. The fixture exposes
  separate test-only processing/failure controls; none are mounted in production.

Existing notices pending before this increment are processed. Historical payment
or Ready events that never queued a notice are not silently backfilled. Preview
content reflects its persisted event and generation-time booking information;
it is not an external delivery record. Large installations would need a separately
reviewed worker strategy; the cleanup scan currently checks notice-bearing demo
orders while generation batches are bounded to 50.

## Storage, retention and recovery

`src/data/migrations/013-notification-previews.sql` adds ephemeral plain-text
`notification_previews`, referenced by outbox ID with cascading deletion. Content
is immutable after generation and requires a matching recorded preview outcome.
The registered migration leaves existing outbox/payment/audit records and applied
SQL/checksums untouched. The v12 upgrade test checks preservation, safe rerun,
integrity, foreign keys and cascade cleanup. Recovery is forward-only through a
reviewed additive correction; do not rewrite old migrations or financial history.
Old code can still queue records but will not run the new processor. Stop the
processor before a code rollback; preserve records and resolve forward.

`src/data/order-retention.js` extracts the unchanged shared deadline previously
inside tracking. Both tracking and previews now use the same seven-day final
outcome/resolution policy. Pending cancellation/refund cases extend availability;
successful refund confirmation starts the resolution interval. Read authorization
enforces expiry immediately. The worker deletes outbox rows and preview text at
expiry or once contacts are absent/redacted; sanitized audit history remains.
This does not implement the broader contact/grant deletion job (SEC-02), real card
retention, or any backup promise. No live database is migrated by verification.

The existing explicit private staff detail SEO-only exception still applies;
there is no new page/indexing exception. See [verification](verification/be-11-notifications.md).
