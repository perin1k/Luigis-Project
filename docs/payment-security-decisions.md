# TECH-06 — Demonstration payment security and accounting decisions

Decision scope: [TECH-06](https://trello.com/c/OnDLg8gB), consolidated October 22,
2026. These approved choices close the design scope, not release acceptance or
authorization to collect real cards, activate a merchant or provision hosting.

| Required decision | Approved design |
| --- | --- |
| Public-input safeguard | Generate fresh synthetic 16-digit identities beginning `0000` on the server. Accept no customer card number, expiry, CVV or PIN. This approved generated-identity approach is not a tiny fixed test-number allowlist. |
| Authenticated encryption | AES-256-GCM; fresh random 12-byte nonce and 16-byte tag; associated data binds payment, order, quote and key version. Persist full generated identities only as ciphertext. Ordinary views show masked last four; no HTTP plaintext-decryption route. |
| Key custody and rotation | Dedicated external key-ring file separate from source, database and MFA keys, with no default key. Up to eight versions: add a fresh active version for new writes; keep old keys until dependent ciphertext is purged or reviewed offline re-encryption occurs. No automatic lost-key recovery. POSIX ownership/modes are enforced; Windows ACL verification remains a platform gate. |
| Explicit deletion | Purge encrypted full identities seven days after the attempt, independently of unresolved contact/refund cases. The retention worker schedules cleanup. Masked financial history remains until project teardown. No application-managed backups or durable recovery guarantee. |
| Genuine demo evidence | Adapter `luigis-demo-v1` and local evidence records. Server-committed payment/order state confirms success, never a redirect alone. No invented Stripe signature, event, transaction ID, settlement or cost. Card/Apple Pay choices are demo presentation, not native Wallet integration. |
| Additive schema | Reviewed migrations `011-demo-payments.sql` and `012-demo-refunds.sql` add local attempts/secrets and refunds/allocations. Preserve existing Stripe-test tables and immutable applied SQL. Recover with compatible code and retained database/keys, not destructive rollback. |
| Accounting and retries | Authoritative integer-cent quotes; exact request schemas and idempotency keys. Recheck hold, expiry, hours, capacity, availability and unpaid prices before atomic payment/order confirmation. Replay stored outcomes; reject client amounts, roles and success flags. |
| Tax and tips | Preserve the approved fictional Cookeville demo policy: 9.75% item tax, invoice-level half-up rounding; voluntary tips excluded from taxable subtotal, percentage tips based on items plus tax. This is not a legal-compliance claim; reverify Tennessee/address-specific requirements before real use. |
| Refund discrepancy | Full demo refunds include purchased items, tax and tip, with no processor-fee deduction. Preserve original payments and append exact reversals; distinguish pending, failed and succeeded attempts. No actual money moves. |

## Integration and acceptance boundaries

[Payment design](demo-payment-design.md) maps the vault, configuration loader,
server service/router, browser retry behavior and migration responsibilities.
[Refund design](demo-refund-design.md) maps cancellation review, authorized refunds
and append-only allocations. [Retention enforcement](retention-enforcement.md)
records scheduled deletion and unresolved-case protections.
[Payment verification](verification/be-03-payments.md) retains implementation
evidence and limitations; this record does not broaden that evidence.

TECH-06's requested decisions are settled. BE-03, BE-09, SEC-02 and related
frontend, integration, QA and operations cards retain their delivery scope.
Firefox, Windows/Linux execution and manual screen-reader checks remain required
teammate verification. Hosted key setup, deployment and future real-provider
activation remain separate work. No acceptance gate is waived here.

This documentation-only consolidation changes no executable behavior, applied
schema, key material or data. Validation consists of content, source-reference,
local-link and diff review; no new runtime, browser or Lighthouse pass is claimed.
