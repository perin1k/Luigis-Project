# DATA-02 storage verification — October 22, 2026

Card: https://trello.com/c/gO6MqjQ2. Existing contributor work is preserved;
this checkpoint adds verification documentation, not a new database implementation.

The current registry contains 13 additive, consecutive migrations: catalog;
orders/quotes; provider-test financial records; scheduling/fulfillment; access/audit;
credentials; MFA secrets; login controls; invitations; recovery; local demo
payments/encrypted secrets; local demo refunds/allocations; notification previews.
`src/data/migrations.js` verifies applied names/checksums and rejects unknown or
changed history. `database.js` enables foreign keys/recursive triggers and uses
synchronous immediate transactions. The seed and recovery rehearsal preserve
existing data. No applied SQL, seed, working database or key changed here.

The revised synthetic-payment scope uses genuine local adapter records and
separate ciphertext, not forged Stripe verification. Full refunds preserve original
financial history with exact item/tax/tip reversals. Read the
[payment decisions](../payment-security-decisions.md),
[refund design](../demo-refund-design.md) and
[retention decisions](../retention-decisions.md) for service boundaries.
Storage constraints do not themselves execute capacity, cleanup or authorization
services; those remain integrated through their respective implementation cards.

## Fresh verification

Environment: macOS arm64, Node 24.14.1, npm 11.11.0. All tests use isolated invented
data; none migrates, deletes or decrypts a working dataset.

```sh
node --test tests/unit/database.test.js tests/unit/order-storage.test.js tests/unit/payment-storage.test.js tests/unit/scheduling-storage.test.js tests/unit/access-storage.test.js tests/unit/demo-refund-storage.test.js tests/unit/disposable-recreation.test.js
node --test tests/unit/demo-payment.test.js tests/unit/demo-payment-concurrency.test.js tests/unit/notification-service.test.js
```

The first command passed **42 tests**, zero failures/skips. It exercises actual
constraints, rollback, upgrade/reopen, immutable histories, relationships, seed
preservation, and isolated recreation/process interruption. The second command
passed **14 tests**, zero failures/skips, covering local payment and
preview schema/service integration and competing payment writes.

Content/source-reference, local documentation links and diff checks apply to this
documentation checkpoint. No new UI/runtime change requires a new Lighthouse
audit here; existing application browser/manual gates are not waived.

## Remaining acceptance

Windows/Linux execution of these checks is not verified in this session. The human
retained cross-platform release gates for teammate verification. Keep DATA-02 open
for that evidence rather than infer support from macOS passes. Browser, accessibility,
complete journey and hosted acceptance remain on their related QA/integration/OPS
cards. No full-application or legal/security compliance claim follows from this
storage checkpoint.
