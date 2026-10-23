# TEST-03 fulfillment, tracking, exceptions and reporting

Accepted October 23, 2026 for the scoped fulfillment, tracking, exception, preview
and reporting checkpoint. This record retains earlier failures and their verified
corrections. Story: https://trello.com/c/WOZ38Ufw. Final release gates remain separate.

## Scope and reusable files

- `playwright.test03.config.js` reuses queue/detail, employee presentation, private
  tracking, exceptions, notification preview and analytics suites on the disposable
  HTTPS fixture. It keeps native `test03-ci/` references separate from contributors'
  existing local references. No comparison tolerance is changed.
- `.github/workflows/test03-verification.yml` uses Windows Server 2022 with
  Chromium/Firefox and macOS 15/Ubuntu 24.04 with Chromium/Firefox/WebKit, desktop
  1440×1000 and mobile 390×844. Existing 320px checks remain. Locked Node 24.14.1,
  npm lockfile and Playwright 1.64.1 use Chromium 156.0.8078.4, Firefox 157.0 and
  WebKit 27.2. Browser-engine coverage is not native Safari certification.
- Candidate collection is distinct from reviewed no-update comparison. Synthetic
  candidate artifacts have two-day retention; only reviewed reusable references
  belong in Git. The existing macOS WebKit keyboard-navigation prerequisite stays
  enabled; unsupported Windows WebKit is not substituted for Safari.
- `tracking-presentation.spec.js` adds a connected scheduled paid-order journey:
  Admin marks Pepperoni unavailable, preparation is blocked, private tracking
  explains review without revealing ingredients, Admin approves cancellation then
  refund, actual preview generation gives confirmation/cancellation/refund email/SMS
  previews, and an independent MFA Owner session observes the exact ledger reversal.
  No external notification or transfer occurs.
- `src/public/css/staff.css` extends the existing closed-details transition rule
  to hidden notification content. Firefox otherwise suspends five border/color
  transitions on the hidden Refresh previews button indefinitely. Visible content
  still transitions normally. `notifications.spec.js` verifies theme settling,
  keyboard opening and functioning refresh after reopening. No assertion, timeout,
  security setting or visual tolerance is weakened.
- Order decision/refund approval rows use a scoped flex layout and normal checkbox
  dimensions with a 44px clickable label area. The previous generic staff input
  minimum made checkboxes extend about 22px beyond a one-line row and into its
  explanation. `exceptions-presentation.spec.js` reproduces that failure before
  the fix, then verifies containment, separation and label target height at 1440px
  and 320px. Existing explicit approval/pending controls remain mandatory.
- Existing refund/notification audit helpers now record actual OS/architecture/Node
  rather than a hardcoded historical macOS profile. Audit settings are unchanged.
- Opaque reference spans now use character wrapping without ligatures and one-pixel
  inline padding. Firefox's natural UUID line-break opportunities otherwise depend
  on the hex characters: a diagnostic cycling 100 equal-length UUIDs reproduced
  45.63px/66.75px queue heading heights despite masked text. Padding keeps glyph ink
  inside the existing masked reference bounds. `employee-presentation.spec.js`
  verifies equal height for four deterministic same-length references in actual
  queue/tracking containers at 390px and 320px, restoring the original DOM text.
  No persisted reference, tracking grant, business record or mask tolerance changes.

## Source and evidence reuse

Application baseline `8359d101145ad90b1f1f7cc0a47c25c041c368ab` includes the team's
existing implementation, with FE-06 presentation integrated. Configuration commits
`2598d3c` and `c1a1719` do not alter application behavior. Preserve Perin's and other
contributors' work; checkpoint verification is not authorship of those features.

Existing focused service/HTTPS security, accounting, retention, migration and
concurrency evidence remains valid on unchanged implementation:
[BE-04](be-04-staff-orders.md), [BE-05](be-05-follow-up.md),
[FE-05](fe-05-tracking.md), [BE-09](be-09-refunds.md),
[FE-09](fe-09-exceptions.md), [BE-11](be-11-notifications.md),
[BE-06](be-06-dashboard.md), [FE-06](fe-06-analytics.md).
Accepted [TEST-02](test-02-checkout-acceptance.md) retains scheduling, checkout,
receipts, payment-cutoff/replay and required-time selection evidence. Its BE-10/
FE-10 inventory/refund integration remainder is exercised here against real records.
Unchanged accepted staff authentication and menu gates are retained, not rerun.

## Focused local results and corrections

Windows x64, Node 24.22.1 and locked Chromium/Firefox desktop: 60 functional/axe
checks passed in the initial local selection. Two inventory-review cases stopped
at missing new checkpoint image references; these are not application failures or
visual passes. Native candidate collection and strict review must resolve them.

The additional connected scheduled-inventory journey passed in both local browsers.
Its first assertion incorrectly forbade the word `delivered`, which also matched
the correct disclosure “Nothing was sent or delivered.” The corrected assertion
requires all six generated channel/event previews to retain that disclosure and
the previewed-generation label. No application change was needed.

```sh
npx playwright test -c playwright.test03.config.js --project=chromium-desktop --project=firefox-desktop --grep-invert 'visual|lost refund response' --update-snapshots=none
npx playwright test -c playwright.test03.config.js --project=chromium-desktop --project=firefox-desktop --grep 'scheduled inventory review connects' --update-snapshots=none
```

## Native collection and reviewed comparison

[Candidate run 40005306930](https://github.com/perin1k/Luigis-Project/actions/runs/40005306930)
tests `c1a1719bf9e3f2d261c3d294b2f90402ca7b0cc4`. Initial Windows results: 160
passed, eight Firefox visual cases failed waiting for theme transitions. Initial
Linux and macOS results: 244 passed each, the same eight cases failed on each OS.
All initial projects completed; no functional journey was skipped. The failure is retained:
no candidate was visually accepted merely because collection generated it.

Local Firefox diagnostic reproduced exactly five suspended transitions on the
closed notification refresh button. After the scoped hidden-content CSS fix,
Chromium/Firefox regression checks passed. New connected scheduled/refund coverage
was published in `3d50047`; fix/regression and bounded follow-up selection are in
`77f9f69d1a38b078736b6930f8b804dde26adbb9`.
[Follow-up collection 40007469961](https://github.com/perin1k/Luigis-Project/actions/runs/40007469961)
reruns visual cases and the two new cases, reusing unchanged successful native
functional evidence. All three jobs passed: Windows 56, Linux/macOS 84 each,
without skipped or flaky cases. All 384 synthetic candidates were inspected in
native contact sheets, plus full-size Windows Firefox mobile analytics, Linux
WebKit mobile failed refund and macOS Firefox desktop notification views.

The full-size notification view exposed crowded approval checkboxes that were not
clear at contact-sheet scale. Initial references in `498b333` therefore require
correction for affected Admin detail/refund/preview layouts; they are not final
acceptance for those views. Failing-first geometry reproduced the 22px protrusion;
the scoped fix and six local consent/geometry/pending checks pass in `fdf9060`.
Other reviewed queue/tracking/reporting references remain unchanged.

[Strict run 40008852190](https://github.com/perin1k/Luigis-Project/actions/runs/40008852190)
tests `498b3339faa32e914865d0ce890338a3ded404aa` without image updates. Its unaffected
results may be retained; affected approval images require the subsequent correction.
[Approval collection 40009259152](https://github.com/perin1k/Luigis-Project/actions/runs/40009259152)
tests `fdf9060c42b40010daba01c6be3298ec622ef456`, selecting only affected Admin detail,
refund and preview visuals, approval geometry and consent/pending controls.
These approval-only candidates are superseded by the subsequently reviewed final
reference-wrap collection and passing strict comparison below.

Approval collection passed on all three platforms. Subsequent strict comparison
against the initial references recorded Windows 45 passes/11 failures, Linux
78/6 and macOS 75/9. Every failure was a screenshot difference; analytics and the
new connected/refreshed-control cases passed. Mobile Firefox showed one-line
height changes in masked UUID references, and two Windows Chromium dark captures
differed by one pixel. These failures are retained rather
than treating candidate generation as acceptance or increasing tolerances.

The deterministic-reference fix is published at
`5b234f9fb1f334e2ee43877fba2df62ddc60e3f6`. Its local Chromium/Firefox queue/tracking
geometry checks pass. [Reference collection 40010688191](https://github.com/perin1k/Luigis-Project/actions/runs/40010688191)
targets only affected operational/tracking visuals and new reference geometry.
Already reviewed/strictly passing analytics references are unchanged. This also
collects the corrected approval layout; superseded approval-only candidates are
not blindly copied into the repository. Final review/comparison is recorded below.

Reference collection completed all visual cases: Windows/Linux passed, macOS had
65 passes and one new geometry-test timeout while `page.setViewportSize` waited;
no geometry assertion failed there. Keep that failure distinct from the earlier
layout mismatches. The geometry test now uses separate fixed 390px/320px contexts
with the same deterministic assertions; four local Chromium/Firefox cases pass.
Final native follow-up must verify this correction without a timeout increase.

All 320 updated operational/tracking images were reviewed in native contact sheets,
supplemented by full-size corrected macOS Firefox desktop consent/previews, Windows
Firefox mobile approval and Linux WebKit mobile inventory review. Rows/labels are
clear, wrapping is consistent and no unexpected clipping/overlap remains. The 64
strictly passing analytics references are retained. Their acceptance is combined
with the final strict no-update result below.

[Final strict run 40012360351](https://github.com/perin1k/Luigis-Project/actions/runs/40012360351)
tests reviewed references and fixed-width geometry at
`75164cea284b4cd0fd38f2f264ee7f274abea5d2`. All three native jobs passed:
Windows 48, Linux 72 and macOS 72; no failures, retries, skips or flaky cases were
reported. No images were updated. This verifies the previously failed Firefox
mobile layouts and fixed-width macOS Firefox regression at unchanged comparison
tolerances. Combined with unchanged analytics strict passes and the initial
functional/service evidence, all scoped checkpoint gates pass.

The final workflow is manually dispatched; the temporary initial dev-only
push registration is removed to prevent repeated collection on routine edits.

## Human accessibility and audits

The human reports **all passed** for the grouped Chrome/Windows Narrator review:
employee queue filters, timing/review warnings, genuine Preparing→Completed actions;
Admin cancellation/full-refund controls; internal previews and private refunded
tracking; Owner quick/custom date filters, table headings, separate financial labels
and timing coverage. Keyboard focus/announcements and 200%/400% zoom were checked
in both themes. Local executable metadata records installed Chrome 155.0.8059.85,
Narrator 10.0.26100.8972 and Windows-reported build 10.0.26300.0; the human did not
independently report the running About-screen versions. The disposable preview processor is explicitly triggered through its
test-only endpoint rather than claiming fixture background processing.

After the approval-row correction, the human separately reports both rows passed
Chrome/Narrator, label-click/Space toggling, focus and 200%/400% reflow in both
themes, including cancellation followed by the refund approval row. The rest of
the earlier manual review remains valid; no full repeat was requested.

The changed Owner analytics page was freshly audited with Lighthouse 13.5.0,
unchanged default mobile simulated throttling, production HTTPS fixture, Windows
x64/Node 24.22.1: Performance 100, Accessibility 100, Best Practices 100, SEO 60
under the already approved private-page noindex exception. Sanitized configuration
and scores are retained alongside this record. No audit setting was weakened.

After approval-row and reference-wrap correction, fresh audits of Admin refunded detail, refunded/
Received private tracking, and queue/detail with notification preview states all
passed 100 Performance/Accessibility/Best Practices, SEO 60 under the existing
private-page exception. These use the same Lighthouse version/default mobile
profile and actual Windows/Node metadata. Sanitized results are in
`test-03-refunds-lighthouse.json` and `test-03-notifications-lighthouse.json`;
`test-03-analytics-lighthouse.json` retains the analytics result above. Reproduce
using `node tests/audit-refunds.js`, `node tests/audit-notifications.js` and
`node tests/audit-analytics.js` against the production disposable fixture.
Historical tracking 99 is retained, not overwritten. Final real hosted HTTPS
performance and integrated QA remain open.

## Acceptance boundary

Source-card coverage is mapped rather than inferred from list placement:

| Source cards | Connected acceptance and retained focused evidence |
| --- | --- |
| BE-04 / FE-04 | Authorized queue/detail, final filters, hold warnings, stale/network/session recovery, preparation detail and no-JavaScript presentation; `orders.spec.js`, `employee-presentation.spec.js`, BE-04 record |
| BE-05 / FE-05 | Genuine progress to Completed, conflicts, cancellation/preparation holds, Not collected without automatic refund, private-grant replacement/revocation and late-response protection; orders/tracking suites and BE-05 record |
| BE-09 / FE-09 | Explicit Admin approval, exact full reversal, interrupted-response replay, failed retry, persisted pending versus completed, receipts and denied-session clearing; exception/orders/tracking suites, BE-09/FE-09 records and accepted TEST-02 receipt evidence |
| BE-11 | Actual event/channel preview generation, inventory apology, no sending, role restrictions, deduplication, failed generation/retry and expiry; notification/connected suites and retained service/runtime/retention evidence |
| BE-06 / FE-06 | Owner-only actual ledger, period/cohort accounting, Central/DST ranges, date/weekday/hour trends, missing timing coverage and zero/error states; analytics suite, BE-06/FE-06 service/HTTPS evidence and fresh audit |
| BE-10 / FE-10 | Accepted TEST-02 scheduling/checkout portion plus real scheduled inventory block → Admin cancellation/full refund → guest outcome/internal previews/Owner reversal; new connected tracking case and retained scheduling/capacity/lifecycle tests |

TEST-03 and its eleven linked feature cards satisfy scoped checkpoint acceptance,
including the remaining BE-10/FE-10 inventory/refund integration criteria. Ready
for Testing may now become Done for these cards, with this evidence linked.
Final hosted QA-01, payment/privacy QA-02, recovery/performance QA-03, INT and OPS
remain separate. This checkpoint does not claim a deployed site, live Stripe,
native Apple Pay, external email/SMS delivery, real customer/card data, durable
business operations or complete WCAG conformance from automation alone.
