# FE-10 connected guest status — October 22, 2026

Card: https://trello.com/c/f8yQT7qN. This extends existing protected guest tracking
instead of rebuilding the completed payment/refund/notification services or
pretending the isolated EJS status examples are actual order data.

## Behavior and integration

- `src/tracking/tracking-service.js` derives the latest persisted cancellation
  state and a generic inventory-review flag under the existing grant, deadline
  and transaction boundary. An active order's resolved inventory review clears
  the issue; cancelled orders can retain its recorded context. No ingredient
  identity, reason, actor, contact or financial detail is added to the response.
- `src/public/js/tracking.js` renders text nodes for pending, approved and denied
  cancellation separately from the already persisted refund result. Inventory
  issues show an apology and whole-order review boundary, never a silent
  substitution, automatic cancellation or automatic refund claim. Completed
  refunds still explicitly state that no money was transferred.
- Existing link secrecy, expiry/replacement, no-store/noindex, status-refresh
  recovery and client response-generation protection remain unchanged. The
  documented read-only scheduled-order EJS partial remains reusable; tracking
  uses its existing browser renderer rather than inserting untrusted HTML.

## Verification

The full server suite passed **256 tests**, zero failures/skips, after the final
server change. Focused tracking/refund tests verify `none`, `pending`, `denied`,
`approved`, separate pre-refund review, inventory review/resolution and existing
private-response exclusions.

The existing HTTPS fixture exercises genuine persisted demo orders and staff
decisions. Expanded browser stories cover ingredient change to private inventory
warning, pending request to admin denial, and confirmed cancellation to a safely
replayed refund and guest receipt. No real accounts, messages or funds are used.

```sh
npx playwright test --config=playwright.staff-orders.config.js --project=chromium-desktop --project=chromium-mobile --project=webkit-desktop --project=webkit-mobile --grep 'private customer cancellation|lost refund response|private tracking explains'
```

Missing-only generation passed **12 cases (40.4s)** and produced 16 new macOS
references for inventory/refund views across both themes and desktop/mobile
Chromium/WebKit. Images were reviewed together and representative mobile captures
at readable scale; existing baselines for other platforms remain untouched.
Normal non-updating comparison passed **12 cases (36.9s)**. Both-theme axe checks
support, but do not replace, manual WCAG review.

The affected `/track` Lighthouse 13.5.0 default simulated mobile audit scored
**100 Performance, Accessibility and Best Practices; SEO 60** due to deliberate
noindex. The user's previously approved tracking SEO-only exception applies;
indexing was not enabled to manufacture 100. [Retained report](fe-10-tracking-lighthouse.json)
contains configuration/advisories and omits the raw private link. This audit used
the existing active-order fixture, while changed inventory/refund states were
covered by the connected visual/axe journeys. The fixture was stopped afterward.

Environment: macOS arm64, Node 24.14.1/npm 11.11.0, locked Playwright tooling.
Firefox startup, current Windows/Linux execution, representative manual screen
reader/zoom review and full-card acceptance remain required teammate verification.
Do not mark FE-10 complete solely from this integration. External notifications,
native Wallet, real merchant processing and hosting remain outside this increment.
