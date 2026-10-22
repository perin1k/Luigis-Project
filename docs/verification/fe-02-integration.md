# FE-02 persisted availability checkpoint

October 22, 2026. Card: https://trello.com/c/5gk80esm. Existing presentation and
catalog integration are contributor work already present in dev. This increment
adds a regression test, not a replacement availability source or UI feature.

`tests/unit/pricing-http.test.js` now exercises the mounted application with a
real isolated SQLite catalog. After an ingredient change it verifies:

- `/order` renders the current unavailable-topping contract with no-store.
- A previously read fingerprint receives 409 and the updated catalog.
- Reviewing that catalog does not authorize the now-unavailable recipe (422).
- An unaffected onion recipe remains purchasable through authoritative pricing.
- A missing required cheese ingredient reaches the rendered base warning and
  blocks pricing; restoring ingredients permits the original recipe again.

Reproduce:

```sh
node --test tests/unit/pricing-http.test.js tests/unit/catalog-pricing.test.js
```

Result: **11 passed**, zero failures/skips, macOS arm64, Node 24.14.1/npm 11.11.0.
The initial restricted run passed eight catalog tests but could not bind loopback
for three HTTP tests (`EPERM`). Rerunning with loopback permission passed all 11;
no application or security control was weakened. Fixtures use in-memory synthetic
data and an ephemeral local port, not the working application database.

This covers server-rendered integration and authoritative revalidation. It does
not prove browser draft/focus behavior, live updates on an already-open page or
manual screen-reader acceptance. Existing visual/browser coverage is separate;
Firefox, Windows/Linux and retained manual quality gates remain unverified here.
FE-02 stays open for those acceptance checks. No new UI or runtime behavior changed,
so this test-only checkpoint does not claim a fresh Lighthouse/browser audit.
