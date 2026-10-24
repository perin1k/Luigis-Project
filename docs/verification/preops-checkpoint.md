# Pre-OPS integration and acceptance checkpoint

October 23, 2026. In progress. Human-approved batch for the current In Progress /
Ready for Testing cards: INT-01, INT-02 and QA-01/02/03. No deployment, provisioning,
spending, real payment or external message delivery is authorized by this checkpoint.
Passing an application check does not satisfy an explicitly hosted acceptance gate.

## Scope and provenance

Baseline `de5b4f76dc02c3f232475a54bf48a667ef176c8e` preserves John's INT-01/02
implementation and tests, the team's QA work and accepted SEC/TEST evidence.
Recent OPS/DOC preparation remains reverted under the human's ownership decision;
this work does not restore it or claim authorship of the existing integration.
John retains INT implementation ownership, Perin retains QA ownership, and Brody
approved this automated checkpoint and bounded native Actions/synthetic-image review.

## Reusable files and validation

- `scripts/verify-preops.js` runs the union of the existing QA-02 file-backed
  payment/key/HTTP/refund/retention and QA-03 race/recreation/operations/runtime sets,
  plus the changed payment-retry contract. Explicit filenames avoid shell glob
  differences; failures propagate. No duplicate cases within that invocation.
- `playwright.preops-customer.config.js` runs only John's six customer journeys;
  `playwright.preops-staff.config.js` runs only his four shared-record scenarios.
  Each uses its existing isolated fixture, one worker, zero retries and no automatic
  trace/video/screenshot capture. Native engine/viewport settings are inherited.
- `customer-journey.spec.js` extends only the uncertain-result case with tagged axe,
  Light/Dark visual checks and 320px reflow. It still commits the real demonstration
  payment before substituting a 503 response, keeps editing locked and retries the
  original ID to assert exactly one payment. Only that newly changed error state
  receives new `preops-ci` references; accepted receipt/menu/staff images are reused.
- `.github/workflows/preops-verification.yml` uses the existing pinned setup and
  supported Windows 2022/macOS 15/Ubuntu 24.04 matrix. Collection runs the focused
  service set and connected journeys, uploading only synthetic new-state PNGs for
  two days. Comparison never updates images. The temporary dev-only path-scoped
  registration trigger will be removed after collection; no production secret,
  application database, trace or private key is uploaded.

Initial local Windows x64/Node 24.22.1 result: 31 backend checks pass, no failures
or skips. The extended uncertain-result case passes Chromium/Firefox desktop,
including unchanged same-request retry, axe and narrow layout assertions. Local
image generation is candidate evidence, not accepted strict visual comparison.
Native collection, complete reference review and comparison remain pending.

## Criteria and remaining gates

| Card | Applicable pre-OPS verification | Requirements that cannot be inferred from it |
| --- | --- | --- |
| INT-01 | Actual validated customer purchase, persisted confirmation/tracking, both services, menu reapproval/unavailability, isolation, lost order response and ambiguous payment recovery | Applicable current human/accessibility/visual/audit acceptance must be reconciled before card closure; final hosted release remains QA-01 |
| INT-02 | Separate Customer/Employee/Admin/Owner sessions share actual orders, progress, tracking, refunds, reports, published menu changes, account revocation and stale/conflicting refresh | Its original explicit hosted role/navigation/access criterion remains until OPS supplies the real environment |
| QA-02 | Real file-backed payment/externally loaded key, encryption/integrity/masking, rejected raw input, rollback/retry, retention and approved demo boundary | Actual hosted service/key/log/copy custody and applicable remaining manual acceptance are not file-fixture results |
| QA-03 | Real competing SQLite connections, cancellation vs Preparing, capacity/payment races, recreation limits, worker/readiness/error redaction | Six checkout/four staff viewers on the approved host, p95 read/write targets, actual ten-minute operator restart/rollback and mounted-key/runtime checks remain unmeasured |
| QA-01 | Current integrated native journeys plus accepted TEST-01–03/SEC evidence after impact review | Real public HTTPS Lighthouse, hosted operational checks, final receiving-team/manual acceptance and DOC-01 rehearsal remain before release |

The original cards retain their criteria and ownership. No card is marked Done
solely from list placement, candidate generation or partial tests. Resolved SEC
findings are recorded as resolved dependencies, not used to waive other gates.
The final result will distinguish application acceptance, remaining human review
and genuine hosting prerequisites without moving unfinished criteria elsewhere.

Reuse: [INT-01](int-01-customer-journey.md), [INT-02](int-02-shared-records.md),
[QA-02](qa-02-payment-privacy.md), [QA-03](qa-03-concurrency-recovery.md),
[QA-01](qa-01-integrated-review.md), [SEC](sec-acceptance.md),
[TEST-01](test-01-menu-acceptance.md), [TEST-02](test-02-checkout-acceptance.md),
[TEST-03](test-03-acceptance.md). New results do not certify native Safari,
live Stripe/Wallet, outgoing email/SMS, real data or general WCAG/legal compliance.
