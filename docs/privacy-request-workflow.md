# SEC-02 restricted customer privacy workflow

> For developers and technical website support. Restaurant staff and owners using
> the website should start with [Using your website](handoff.md) and
> [Find the right guide](README.md). This technical reference is not an everyday user manual.

Approved October 23, 2026. This implements the October 22 Admin-mediated contact
correction/limited-copy decision, with explicitly approved additive audit storage.
It is for invented demonstration contacts, not a general legal data-export service.
There is no public contact lookup, account profile, marketing or automated delivery.

## Staff procedure

1. Sign in individually as Admin or Owner, including authenticator MFA. Open the
   confirmed order in Order queue, choose **Customer privacy review** in Decision,
   then **Open privacy review**. Employees cannot open this page or its API.
2. Verify the requester in person or through an already known contact channel.
   An order number/name alone is insufficient. Do not request credentials, full
   payment details or authenticator codes. Uncertain requests stay with the Owner;
   do not release a copy or change the destination to an unverified new contact.
3. Check **I verified the requester and reviewed this order**. Correct the current
   name, phone/email with **Save contact correction**. Carry-out still requires
   phone; dine-in requires phone or email. Purchased quotes/prices and original
   request hashes are immutable and are not regenerated to match a correction.
4. **Show limited data copy** displays saved contact, reference, service/status and
   purchased item names/quantities in a readonly field. It excludes tracking grants,
   keys, ciphertext, credentials, raw audit/database rows and other customers.
   Unsaved edits are not the saved copy. Nothing is downloaded, sent or placed on
   the clipboard automatically. Review before any approved private handoff.
5. **Hide data copy** empties the field and restores focus. Changing tabs hides the
   copy; leaving the page clears private controls and aborts pending work. Return
   navigation reloads access. Denied/expired access removes contact controls; late
   responses cannot repopulate them. Do not screenshot, log or paste private copies
   into Trello/GitHub. Any separately authorized copy requires its own access and
   deletion handling; the application cannot erase external copies.
6. A stale revision requires reload. On an interrupted correction, reload to check
   the saved contact before retrying; never change the original checkout/payment
   request identity. This operation cannot cancel, refund or reprice an order.

## Files and contracts

- `src/staff/privacy-service.js`: server-only `privacy.manage` authorization,
  shared contact validation, shared retention deadline, order revision check,
  synchronous correction/copy and sanitized auditing in the session transaction.
  Redacted/expired data cannot be copied or resurrected, even before cleanup runs.
  Correction does not modify any retention timestamps, financial snapshots or grants.
- `src/staff/privacy-router.js`: pinned direct HTTPS/host, existing strict host
  cookies, origin/fetch checks and session-bound CSRF. Reads are not cacheable and
  use no-referrer/noindex. Bounded 1 KiB strict JSON, no compressed bodies; fixed
  fallback errors never include database/request details. Copy is reviewed POST.
- `/staff/privacy/:reference` renders the Admin/Owner page;
  `/api/staff/privacy/:reference/csrf` issues its CSRF proof;
  POST `.../correct` accepts exactly `intRevision`, `bReviewed:true`, `objContact`
  (`strName`, `strPhone`, `strEmail`); POST `.../copy` accepts exactly the first two.
  Responses do not expand authority based on claimed roles or record IDs in bodies.
- `src/views/pages/staff-privacy.ejs`: escaped server markup, labels/instructions,
  semantic fieldset, review checkbox and live status/error regions. Existing staff
  tokens/layout/themes are reused; no new CSS or dependency. With JavaScript off,
  current contact is readable but mutations/copy remain disabled.
- `src/public/js/staff-privacy.js`: in-memory editing, reviewed requests, disabled
  busy controls, focus and private-output clearing. It is not the authorization
  or retention authority. Existing order-detail JS adds only navigation to this page.
- `src/server.js` wires the service to configured database/session runtime;
  `src/app.js` exposes it only when that runtime/service are supplied.
- `015-privacy-actions.sql`: additive append-only evidence containing only opaque
  actor/order/action IDs, order revision and canonical time. No old/new contact
  values or free-form reason. Active administrative actors and fixed action names
  are constrained. Neither corrections nor copies expose this table through HTTP.
  Sanitized rows remain until teardown; contact/preview/ciphertext expiry is unchanged.

## Migration and recovery

Apply the normal reviewed migration command to the intended database; first follow
the existing operator change/rollback procedure. Migration 015 adds a table/index/
triggers and preserves migrations 001–014/checksums and existing records. A failed
migration is transactional. Old application versions correctly refuse an unknown
v15 database: do not roll back by deleting migration rows, editing SQL or downgrading
the schema. Restore compatible code or use a separately reviewed recovery plan.
Disposable recreation is a distinct database, not recovery of deleted data/keys.
No working developer or hosted database was migrated by verification.

## Scope and public information

The prior explicit human decision defers public privacy-policy publication and a
request-contact email for this class demonstration. No address, legal statement or
provider delivery is invented. Review accurate public policy/contact details and
actual hosting log/key/copy controls before public release under OPS/QA/handoff.
Do not accept real customer/payment data under the demonstration boundary.

Reusable checks: `node scripts/verify-security.js`,
`node node_modules/@playwright/test/cli.js test -c playwright.security.config.js`
(native references must first be reviewed), and `node tests/audit-privacy.js` with
the disposable HTTPS fixture running. See the SEC acceptance record for actual
environments/results; commands alone are not a pass.
