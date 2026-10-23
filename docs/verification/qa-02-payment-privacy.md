# QA-02 consolidated payment/privacy verification

October 23, 2026. Card: https://trello.com/c/51DKth51.
Status: In Progress, not final acceptance. Existing accepted TEST-02/03 and
contributor integration work are preserved and reused with the limits below.

## Criteria and evidence map

| QA-02 criterion | Evidence and disposition |
| --- | --- |
| Committed success, decline, interruption, retry, association and rollback | Accepted [TEST-02](test-02-checkout-acceptance.md), [payment service evidence](be-03-payments.md), and newer [INT-01](int-01-customer-journey.md) uncertain-payment recovery. The local focused set below passes actual service/HTTP and rollback behavior. No browser redirect establishes payment success. |
| Disclosure before submission, no real collection | TEST-02 includes both service types, demo method presentation, no card/expiry/CVV inputs and human disclosure review. The new HTTP test rejects extra card/CVV fields before any payment attempt. Generated-only identities remain the approved boundary, not arbitrary card input or a tiny fixed allowlist. |
| Encryption, key separation, masking, integrity and access | `demo-payment.test.js` covers authenticated encryption identity/key binding, modified records and version rotation; `payment-config.test.js` covers explicit external config and POSIX private-mode/symlink protections. The new file-backed test verifies successful offline decryption while full identity/key bytes are absent from the persisted database, receipt and operational events. Windows ACL and hosted custody remain unverified here. |
| No sensitive browser persistence or screenshot exposure | INT-01's focused verification record checks tested contact/order/tracking storage isolation and in-memory retry IDs; TEST-02/03 retain reviewed native references. This new server test does not inspect browser storage or make a fresh screenshot claim. It adds no UI; existing images mask opaque references/generated masked identities and contain synthetic data only. |
| Cancellation/refund accounting | Accepted [TEST-03](test-03-acceptance.md), [refund design](../demo-refund-design.md), connected inventory/refund/preview/reporting and focused refund tests. Preserve exact full item/tax/tip reversals, idempotency and separate cancellation/refund outcomes; no processor-fee deduction or actual money transfer. |
| Retention and privacy boundary | Focused retention tests pass expiry, unresolved-case, transactional rollback and batch protections. [Retention enforcement](../retention-enforcement.md) and [privacy inventory](../privacy-data-inventory.md) distinguish ciphertext from contact history and physical-erasure limits. Current SEC-01/02 privacy-control acceptance remains a dependency, not claimed complete by this card. |
| Future provider replacement | [Integration contract](../integrations.md) keeps demo identity/evidence explicit; real Stripe replaces synthetic collection/storage with secure provider references and verified events. No fabricated provider events exist in the new committed demo test. Merchant/webhook/native Wallet activation remains future PAY-01. |
| Native/manual/hosted quality | Reuse accepted TEST-02/03 native matrix, manual observations and audit exceptions only for unchanged behavior. Newer INT-01/02 records explicitly retain current integrated native/manual/hosted acceptance. No new native run, Lighthouse score, hosted key inspection or global WCAG certificate is inferred here. |

## New file-backed acceptance scenario

`tests/unit/payment-privacy-acceptance.test.js` creates its own temporary directory,
with separate database and private external key subdirectories. It loads the key
through the real configuration loader, creates a genuine order/hold through the
mounted HTTP app, rejects extra card/CVV fields, then commits an actual local demo
payment. Operational events are captured through the production recorder seam.

The test decrypts only its own generated identity through the offline vault,
checks responses/events without printing the identity or key, closes the database,
and scans the actual SQLite file bytes. Full number, external key and rejected
input markers are absent. It verifies a successful operational event, zero fake
provider events and database integrity. Cleanup touches only its own temporary
fixture. No working dataset, real key/account, external payment or cloud resource
is used. A failed assertion reports booleans/statuses rather than secret values.

This is field-encryption and bounded leakage evidence, not whole-database encryption,
secure physical erasure, guaranteed JavaScript-memory erasure or inspection of all
OS logs, journals, backups, hosted exports and external copies. The test does not
provision actual operator keys or prove a hosted key's ownership/access controls.

## Reproduction and results

```sh
node --test tests/unit/payment-privacy-acceptance.test.js tests/unit/demo-payment.test.js tests/unit/demo-payment-http.test.js tests/unit/payment-config.test.js tests/unit/demo-refund-service.test.js tests/unit/retention-service.test.js
```

**22 passed**, zero failures/skips, macOS arm64, Node 24.14.1/npm 11.11.0,
repository base `be24de4`. The initial new test expected malformed-body status
400, while the existing validated schema correctly returns 422; the test was
corrected to the established contract. No product/security behavior was weakened.
The recorder callback was aligned with its documented JSON-line interface.
Content, source-reference, local-link, naming and diff review apply to this
test/documentation increment. Unaffected broad suites/audits were not repeated.

## Remaining acceptance and handoff

- Reconcile final SEC-01/02 privacy/access findings; those cards are active in
  another team task and are not closed or modified by this work.
- Supply current integrated native/browser/manual evidence where INT-01/02 and
  this new file-backed scenario lack it. Accepted older checkpoint results remain
  scoped to their recorded commits and unaffected behavior.
- Inspect actual deployed key separation, POSIX permissions or Windows ACLs,
  HTTPS/service identity, redacted host logs and any external-copy behavior after
  separate hosting authorization. Hosting remains preparation-only/on hold.
- Final hosted journey acceptance stays with QA-01; provider/live Wallet behavior
  is deferred rather than recorded as an unexercised pass.

QA-02 remains In Progress for these concrete dependencies. Do not mark it Done
from the 22 local passes or move unfinished acceptance elsewhere to close it.
