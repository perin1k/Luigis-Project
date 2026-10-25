# Approved one-time test-order removal

October 25, 2026, America/Chicago. Brody explicitly approved permanent removal of
one identified disposable demonstration order after an oversized invented tip
distorted Sales. Its cancellation and full demonstration refund had already
completed. This exception does not change ordinary order-retention policy or
authorize deleting other orders.

## Implementation and safeguards

- `scripts/remove-disposable-order.js` is offline maintenance, not a web route.
  Its CLI pins the approved reference and exact creation timestamp; no name-based
  lookup, arbitrary order selector or general delete button is introduced.
- Preview requires the exact Cancelled order, one successful demonstration payment
  and a matching full successful demonstration refund. Provider payment records
  cause refusal. It discovers dependent rows through inbound foreign keys and
  matches associated polymorphic audit entities; shared accounts/menu/service-day
  rows are not followed in the opposite direction.
- Apply runs inside one immediate transaction with foreign keys enabled/deferred.
  Affected table triggers are temporarily removed and restored from their exact
  original SQL before commit. The complete schema and every unrelated row are
  compared before committing. Failure rolls back data and trigger changes together.
  Applied migrations/checksums remain untouched. This is deliberately exceptional
  handling of existing history guards, not a migration or ordinary business action.
- `scripts/remove-disposable-order.sh` stops the application, invokes the fixed
  cleanup, and always attempts restart, including on failure. It waits for real
  public readiness. Existing Nginx stays running during the brief app interruption.

## Actual results

Three focused maintenance tests passed, including no-change preview, exact removal,
preservation of a second order and deletion guards, refusal cases, and injected
failure rolling back both data and schema. Ten existing analytics tests also
passed: **13 focused tests total**. No application UI behavior changed in this task.

The actual hosted preview matched exactly one order. Apply removed that order and
its dependent contacts, recipe snapshots, booking/hold, events, tracking grant,
demo payment secret/payment/refund/allocations, internal notification previews and
associated audit entries. The maintenance result confirmed unrelated rows unchanged,
schema restored and integrity checks passed. Public readiness returned 200.

A separate read-only inspection confirmed the reference is absent, SQLite integrity
and foreign-key checks pass, and both luigis/nginx are active and enabled. Removing
the source order and allocations removes its contribution from all Sales date
ranges, including refund totals. No broader financial-history rewrite or real-money
operation occurred. Permanent here means removal from the application database;
this does not claim forensic erasure of disk blocks or external copies.

The one-time command refuses a second run because its target no longer exists.
Personal contact details and private tracking links are intentionally omitted.
