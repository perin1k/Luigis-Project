# TEST-01 menu and customer acceptance

Cards: [TEST-01](https://trello.com/c/5lLwJGB8),
[BE-07](https://trello.com/c/bpjfXwga),
[FE-07](https://trello.com/c/d3pei0I4),
[FE-02](https://trello.com/c/5gk80esm).

## Scope and implementation

Preserves the team's existing menu, availability, pricing and branded-error work.
The disposable staff-order fixture now mounts the real catalog service on its
existing SQLite database, as production already does. A new browser journey uses
independent Owner and customer sessions: publish a Medium price, disable Pepperoni,
reject the customer's stale quote, remove that topping without losing Onion or
contact choices, and explicitly review the new authoritative total. Fresh sessions
see the unavailable topping disabled. No client role or fixture outcome replaces
server authorization, real price publication or persisted ingredient changes.

The order page receives the same Bootstrap-first CSS bytes in one blocking
response. Its stylesheet/module-preload links precede the classic theme script;
the theme still applies in the head before the body. HTTP regression coverage
checks one stylesheet, exact cascade bytes, Brotli integrity and theme-script
ordering. No CSS rule, permission, dependency or migration was removed or changed.

## Reusable checks

- `playwright.test01.config.js` selects the existing menu cases and the new
  `menu-customer.spec.js` shared-data journey on the isolated HTTPS fixture.
- `playwright.test01-public.config.js` selects existing availability and branded
  error cases, including axe, keyboard recovery, both themes and narrow reflow.
- Existing pricing cases cover stale totals, unavailable recipes, network retry
  and preservation of unaffected choices against isolated SQLite.
- Existing menu service/HTTP cases cover immutable paid snapshots, unpaid
  revalidation, review creation, conflicts, Owner/Admin/Employee permissions,
  CSRF, origin/host enforcement, input limits and atomic audit rollback.
- `.github/workflows/test01-verification.yml` runs this bounded checkpoint on
  Windows Server 2022 (Chromium/Firefox) and macOS 15/Ubuntu 24.04
  (Chromium/Firefox/WebKit), each at desktop and mobile viewports. This is the
  approved platform matrix, not proof of native Safari or Windows WebKit support.
  Locked dependencies and Node 24.14.1 are used; local checks used Node 24.19.0.
- `TEST01_NATIVE=1` selects hosted-runner references in `test01-ci/`, preserving
  local developer references. Native references collected at `5d74b77` were
  inspected internally across all three OSes using contact sheets and a full-size
  representative customer mobile view. No clipping/overlap or unexpected layout
  differences were found. Collection used synthetic data only. Final comparison
  disables updates and artifact collection; no automatic baseline acceptance.

Original native collection:
[run 39906471475](https://github.com/perin1k/Luigis-Project/actions/runs/39906471475).
All three platform jobs passed service, functional, axe and collection checks.
Collection is not the final unchanged-reference comparison; that result must be
recorded below before acceptance.

## Human review — October 23, 2026

The reviewer explicitly answered **All passed** for the grouped Chrome / Windows
Narrator review on the disposable HTTPS site: menu labels and ingredient controls,
price publication, service-date closure, announced success and queue review
warnings, customer unavailable Pepperoni with usable Onion, ordering navigation
and validation, visible keyboard focus, both themes at 200%/400% zoom, and branded
404 heading/recovery links. No issues were reported. Exact browser/Narrator versions
were not supplied; this is scoped human observation, not a blanket WCAG certificate.
The later resource-delivery change preserves the reviewed CSS cascade; final
browser/visual comparisons must verify that it does not change those screens.

## Lighthouse and release boundary

Local production-mode default mobile simulated-throttling audits used Lighthouse
13.5.0 on Windows x64 / Node 24.19.0. The established public-order fixture/profile
(`tests/audit-pricing.js`, HTTP port 3004) passed Performance, Accessibility,
Best Practices and SEO at 100. Its report metadata now records the actual OS
instead of incorrectly hardcoding macOS. `/staff/menu` on the separate disposable
HTTPS fixture passed the first three categories at 100, with SEO 60 because of
intentional noindex. The human explicitly approved that private menu exception.

An additional self-signed HTTPS order-fixture audit scored Performance 99,
Accessibility/Best Practices/SEO 100, both before and after the resource-delivery
changes. Retain that result; do not report HTTPS performance as 100 or attribute
the difference to TLS without proving the cause. Real deployed HTTPS performance
and its required 100 gate remain explicit final QA-01/OPS acceptance work under
the staged policy. Local feature acceptance does not certify deployed performance.
Correct 404/500 status, safe output and intentional noindex are checked directly;
non-success error responses are not presented as successful indexable audit pages.

## Final checkpoint outcome

Pending strict comparison on the committed source and reviewed native references.
Keep TEST-01 and its source cards incomplete until that result is verified.
Final integrated hosted acceptance, shared fulfillment/refund/analytics journeys,
real operator installation and deployment remain on their existing QA/INT/OPS
cards; no live provider integration or public release is certified here.
