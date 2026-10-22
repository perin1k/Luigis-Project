# BE-03 — local demonstration payments

Approved scope: generated synthetic identities, encrypted full-number storage,
server-owned demonstration outcomes and committed order/hold confirmation.
No external authorization, charge, settlement or native Apple Wallet sheet occurs.
This implements the generated-identity approach approved after TECH-06 review;
it does not silently replace public card entry with a tiny fixed number allowlist.

## Design and file guide

- `src/data/migrations/011-demo-payments.sql` adds `demo_payment_attempts` and
  `demo_payment_secrets`. Existing migrations and Stripe-test tables are unchanged.
  The local adapter identity is `luigis-demo-v1`, never Stripe. Terminal financial
  records are immutable, quote/amount-linked, and unique for successful payment
  per order. Success requires the matching confirmed, unexpired capacity hold.
- `src/payments/synthetic-vault.js` generates 16-digit test identifiers beginning
  `0000` inside the server. No card number, CVV, expiry or PIN is collected from a
  browser. AES-256-GCM uses a fresh random 12-byte nonce and 16-byte authentication
  tag per record; associated data binds payment, order, quote and key version.
  Normal application responses contain only masked last four digits. Decryption
  exists only as a non-HTTP primitive for offline integrity/rotation work.
- `src/payments/payment-config.js` loads an explicit external JSON key ring from
  `DEMO_PAYMENT_KEYS_PATH`. There is no default or automatic key replacement.
  On POSIX, the file must be owned by the running user and inaccessible to group
  and other users; symlinks are rejected. Windows operators must separately secure
  its ACL. Missing configuration leaves payment unavailable; invalid configured
  files fail startup safely without printing key data.
- `src/payments/demo-payment-service.js` owns the immediate SQLite transaction.
  It rechecks accepted quote/expiry, active hold and future promise, current hours,
  rolling capacity, pending cancellation, ingredient availability and current
  item/tax prices. Changed prices require a new review, not a silent charge.
  Optional tip stays the immutable accepted quote amount. The injected local
  adapter defaults to approval; failure injection is a server-only test seam.
- Approval atomically stores generated ciphertext and local evidence, confirms
  the hold, marks the order Received and appends its event. Failure stores the
  declined result, releases capacity and leaves fulfillment unpaid. Unexpected
  adapter/encryption/write errors roll back the complete transaction. Expiry or
  changed availability rejects before processing and releases an active hold.
- `src/payments/demo-payment-router.js`: same-origin, no-store JSON POST, 1 KiB
  maximum, no compression, HTTPS or loopback HTTP. Exact input fields are
  `strOrderId`, `strRequestId` (random UUID v4) and `strMethod` (`card`/`apple-pay`).
  Client prices, card numbers and claimed outcomes are rejected. The secret,
  unguessable order request UUID is the checkout capability; there is no public
  payment lookup by reference/contact. Protect it as private retry state.
- `src/app.js` and `src/server.js` wire the service into the configured database
  runtime. `src/public/js/checkout/payment.js` performs the demo POST and handles
  safe errors. The wizard, order/payment templates and inline receipt display
  only committed results, purchased item descriptions/totals and masked identities.
  All dynamic receipt content is inserted as text. Native Wallet support is not
  claimed. Guest tracking and notifications remain separate stories.

## Retry, expiry and failure behavior

An identical payment request returns its stored outcome, even after inventory or
hold expiry changes. Reusing that request UUID for a different order/method is a
conflict. A different request for an already paid order returns the original
receipt rather than creating another payment. Immediate transactions serialize
competing connections. No pending external operation exists in this synchronous
local adapter; asynchronous providers/late-event review remain future work.

On a lost browser response, retain the same request and offer “Check demo payment
result.” Disable back/method changes until the response is resolved; skip repricing
and order recreation on that recovery path. A known decline or stale checkout
returns to review and requires a new ready-time selection. Browser state is only
in memory; refreshing loses the cart/retry capability. A future recovery feature
must use protected grants, never contact/order-reference guessing.

Responses contain the persisted quote's items/tax/tip/total, ready-time/hold state,
method, local-adapter identity and masked synthetic identity. No contacts,
ciphertext, encryption metadata or full generated number are returned. There is
no route to decrypt stored numbers. No real card data is accepted or processed.
This design does not establish PCI, legal or production-security compliance.

## Key custody, rotation and deletion

Use a private file outside the repository and database directory, with a dedicated
key that is not reused for MFA, sessions or other purposes. Format:

```json
{"strActiveKeyId":"demo-v1","mapKeys":{"demo-v1":"<64 lowercase hex characters from 32 random bytes>"}}
```

The placeholder is intentionally invalid. Provision through the operator's secure
setup, never paste a key into Trello, logs, a command argument, browser or Git.
Set only the file path in `DEMO_PAYMENT_KEYS_PATH`. Up to eight versions can be
loaded: add a fresh key/version, set it active and restart; new records use it,
while old versions remain available for offline decryption until their records
are purged. Never remove an old key before its ciphertext is deleted or deliberately
re-encrypted through the reviewed offline primitive. There is no rotation UI or
automatic recovery of a lost key. JavaScript strings/buffers have garbage-collected
lifetimes; this is not a guarantee of zero plaintext residue in server memory.

Full generated numbers serve only demonstration encryption verification. Their
ciphertext expires seven days after the attempt; it is independent of contact,
tracking and financial-history retention. Successful new payment processing
purges elapsed secret rows; internal `purgeExpiredSecrets()` can also be invoked
by the later retention worker. No public cleanup route exists. Immutable masked
financial history remains until project teardown. SEC-02 now schedules expiry
cleanup through [the retention worker](retention-enforcement.md). No hosted backup
copy is created here; any future hosted copy needs the same explicit
key/retention plan. Losing the external key makes its ciphertext unrecoverable.

## Schema/recovery and remaining work

Migrations are checksum-verified and additive. Test upgrade/reopen and foreign-key
integrity; never edit old SQL or roll back by dropping financial records. To recover
from a deployment issue, retain compatible application/migration code and the
private database/key files. Older ten-migration code correctly refuses a database
with migration 11; do not force it open or erase its schema history. No backup or
deployment action is authorized by this implementation.

Staff payment/refund analytics must explicitly read the local demo tables; they
must not pretend these are Stripe captures or actual revenue/processor costs.
Refunds, cancellation/reconciliation, tracking, internal notification previews,
operator key setup on each hosted environment and final acceptance remain
separate work. The default adapter approves generated identities; decline testing
uses disposable server fixtures, not a browser-supplied success/failure flag.

Crypto references: [Node.js authenticated encryption](https://nodejs.org/docs/latest-v24.x/api/crypto.html)
and [OWASP cryptographic storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).
