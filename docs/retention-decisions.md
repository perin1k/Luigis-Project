# TECH-02 — Retention and disposable-data lifecycle decisions

Decision scope: [TECH-02](https://trello.com/c/loOzXS4f), consolidated October 22,
2026. These choices apply to the synthetic class demonstration. They do not claim
legal/business retention compliance or authorize destruction of a working dataset.

| Required decision | Settled design and evidence |
| --- | --- |
| Contacts, guest grants and previews | Seven elapsed days after final outcome, extended for unresolved cancellation/refund cases until at least seven days after resolution. Failed refunds do not resolve a case. Guest replacement revokes prior access without extending the order deadline or explicit grant cap. |
| Abandoned unpaid checkouts | Seven days after accepted checkout expiry or latest confirmed payment failure, whichever is later; hold expiry and resolved cases can extend the baseline. Pending/successful payments, confirmed holds, open reviews and unresolved cases protect records. Missing accepted quotes fail conservatively. |
| Actual purge execution | Configured server startup and minutely worker runs; synchronous transactional redaction of contact fields, grant/outbox deletion and preview cascade. At most 50 orders and independently 50 expired ciphertext rows per invocation. Audit failure rolls back the batch; retries are safe. Read-time expiry hides private data even if cleanup is delayed. No public cleanup endpoint or browser-controlled cutoff. |
| Audit and retained history | Cleanup uses a system actor, opaque order ID and fixed sanitized reason/correlation fields, without raw contacts, tokens, message text or card data. Purchased order/quote/line, payment/refund/allocation and sanitized event/audit history remain until teardown. This is not guaranteed physical erasure of SQLite pages, journals or external copies. |
| Full synthetic ciphertext | Separate seven-day lifetime from the payment attempt, even when a contact/refund case remains unresolved. Cleanup does not decrypt full identities. Masked financial history remains; no real card data or CVV collection is authorized. |
| External key lifetime | Dedicated versioned payment keys remain outside source/database and separate from MFA keys. Retain old versions until dependent ciphertext is purged or reviewed offline re-encryption occurs. The retention worker neither rotates nor deletes operator keys. Lost keys cannot be reconstructed by fresh keys or seeded data. |
| Backups and hosting copies | No application-managed backups are required for disposable demo data. No backup/snapshot service is enabled by these decisions. Any future hosted copy/export requires reviewed scope, access, encryption/key custody, retention, restore testing and deletion; do not silently create indefinite copies. Persistent disks are not backups. |
| Recreation and teardown | Recreate into a distinct new database using reviewed migrations/seed; preserve the working database and keys. Recreation does not restore orders, accounts, grants or lost secrets. Hosted shutdown retains disks/keys pending separately authorized cleanup; shutdown is not deletion and retained storage can still cost money. |

## Integration and completion boundary

[Retention enforcement](retention-enforcement.md) maps the shared deadline,
transactional worker, read-time suppression and actual isolated tests, including
boundary, unresolved-case, retry, rollback and batch behavior.
[The internal data inventory](privacy-data-inventory.md) describes field purposes,
access and remaining privacy work. [Payment decisions](payment-security-decisions.md)
and [payment design](demo-payment-design.md) record encryption/key boundaries.
[Disposable recreation](disposable-data-recreation.md) records the completed local
rehearsal, preserved history and accurate recovery limits.
[Deployment instructions](deployment-runbook.md) preserve the hosting hold and
operator responsibilities; no hosted copy, deletion or provisioning is performed.

TECH-02's requested lifecycle decisions and design are recorded. SEC-02 retains
broader privacy/access/operator acceptance, including the separately deferred
public privacy/contact-policy work. Implementation, integration, operations and
QA cards retain their own acceptance scope. Firefox, Windows/Linux and manual
screen-reader verification remain required; none is waived here.

This documentation-only consolidation changes no worker, data, migration, key or
infrastructure. Verification is content/source-reference, local-link and diff
review, not a new runtime, browser, Lighthouse or legal-compliance result.
