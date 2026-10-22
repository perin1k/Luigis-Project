# Customer checkout acceptance checkpoint — October 22, 2026

Scope: BE-02/BE-03 customer integration and existing FE-03 receipt presentation.
This preserves contributor implementations and updates their verification, not
claiming the application or external services fully accepted.

At `d6d554f`, the complete existing database-backed payment browser suite ran in
Chromium/WebKit desktop/mobile. **16 functional cases passed**: carry-out and
dine-in email contact, both demo payment presentations, real committed confirmation
and private tracking, lost-response replay without repricing/duplicates, declined
and expired checkout recovery, and rate-limited payment retry identity retention.
The other eight cases failed only visual reference checks: missing macOS recovery
images and stale receipt layouts predating approved FE-03 commits `a133834` and
`7ee0490`. These failures were reviewed rather than reported as passes.

Reviewed differences correspond to the existing item/tax/tip summary and protected
tracking/recovery guidance. Representative desktop light and mobile dark receipts
were inspected at readable scale, alongside all 16 light/dark receipt images.
No real contact/card data, raw tracking token or credentials enter these images;
opaque references and masked generated identities are visually masked by the tests.

Automatic approval rejected the initial broad snapshot-update command because of
cross-platform overwrite risk. The accepted safer alternative used a temporary
configuration that refuses non-macOS execution, explicitly fixes output filenames
to `*-darwin.png`, and includes only Chromium/WebKit desktop/mobile projects.
It passed **8 cases (37.2s)**, adding eight missing recovery images and updating
eight receipt images. No Windows/Linux/Firefox reference was changed. Normal
non-updating comparison is recorded below; generation alone is not acceptance.

Final normal comparison passed **8 cases (35.3s)** with zero failures. Combined
with the 16 functional passes, all 24 selected local-engine scenarios now have
passing evidence. The prior failed run remains disclosed above.

Reproduce normal receipt comparison:

```sh
npx playwright test --config=playwright.payments.config.js --project=chromium-desktop --project=chromium-mobile --project=webkit-desktop --project=webkit-mobile --grep 'receipt .*visual capture'
```

Complete suite (same projects, without `--grep`) reproduces the functional paths
as well. Fixtures use an isolated in-memory database, generated identities and
local adapters. No working data, real account, external payment or hosted resource
is changed. Runtime/templates/tests are unchanged in this checkpoint; no new
Lighthouse pass is claimed. Environment: macOS arm64, Node 24.14.1/npm 11.11.0.

## Current integration versus historical notes

The older BE-02 persistence record's missing scheduling/payment/tracking sections
describe its original unpaid-order increment. Current services now reserve holds,
confirm actual demo payment and issue protected tracking in committed transactions.
The older BE-03 record's absent scheduled cleanup/refund/notification list is also
historical: see [retention enforcement](../retention-enforcement.md),
[refund processing](../demo-refund-design.md),
[notification previews](../notification-preview-design.md) and
[connected guest status](fe-10-connected-status.md). Do not recreate these services
or mistake this checkpoint for new implementation of them.

Keep the full cards open for retained Firefox, current Windows/Linux, manual
keyboard/zoom/contrast and representative screen-reader acceptance. Hosted key
custody/HTTPS and release activation remain separately reviewed operations work.
No native Wallet, Stripe settlement, real money or delivered-notification claim.
