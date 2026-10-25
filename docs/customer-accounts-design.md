# Customer accounts — developer reference

For developers/technical support. End users should read
[Your customer account](customer-account-help.md).

Approved October 24, 2026: username/password registration, separate customer
sessions, private recovery codes, optional saved name/phone/email, session-associated
new orders, account deletion and independent order privacy expiry. Guest checkout
remains. No automatic guest linking, rewards, saved cards, verification email or
staff role assignment. Profile retention lasts until account deletion or authorized
project-data teardown; stopping a VM alone does not erase retained disks.

## Files and boundaries

- Migration 016 adds customer accounts, digest-only sessions/recovery codes and
  customer/order associations. It does not alter old migrations or staff tables.
  Account deletion cascades sessions/codes/links, not orders or financial history.
- `src/customer/customer-service.js` reuses reviewed scrypt/password policy,
  produces eight 256-bit single-use recovery codes, and enforces 30-minute idle /
  eight-hour absolute sessions. Password work occurs outside transactions;
  credentials/revision/code/session are rechecked before consequential commits.
  Recovery revokes all sessions and replaces the entire code set. No email-based
  or contact-match recovery is invented.
- `customer-transport.js` parses dedicated secure host-only customer cookies;
  staff cookies never establish customer identity or vice versa. Duplicate and
  malformed customer cookie values fail closed.
- `customer-router.js` serves native EJS forms over pinned direct HTTPS. Exact
  Origin plus session-bound CSRF tokens protect mutations. HTTP-only secure strict
  cookies, no-store/noindex, bounded peer/name throttles and two concurrent password
  operations protect the routes. Referrer policy is same-origin: native POST forms
  need their same-origin Origin, while cross-origin referrers remain withheld.
  No secrets are placed in URLs or external delivery services.
- `pages/customer.ejs` supports registration, login, recovery, profile, paid-order
  history, logout and password-confirmed deletion. User output is escaped. Forms
  work without browser JavaScript; `public/js/customer.js` clears displayed codes
  when hidden/leaving and clears/reloads private content on back/forward restoration.
  Passwords/codes are not saved in browser storage. Recovery codes are intentionally
  shown once and cannot be retrieved through a GET endpoint.
- `server.js` enables accounts only with the configured HTTPS auth runtime;
  `app.js` mounts their router. Public view-only HTTP does not gain an account API.
- Order submission reads the cookie server-side; the order service revalidates
  the session and inserts the link in the same transaction as the new order.
  A retry cannot attach an existing guest order or claim another account’s order.
  Expired sessions reject rather than silently change the checkout to a guest.
- Order history is authorized per customer, paid-demo-only and capped at 100 recent
  records. It checks retention deadlines at read time; the existing retention job
  deletes account/order links alongside expired contact/grant/preview cleanup.
  Unresolved cases retain existing approved rules. No tracking grant lifetime is
  extended by account access. Customer history does not expose other contacts,
  staff data, vault ciphertext or tracking secrets.
- Saved contact details are rendered into `/order` only for a valid customer
  session, under no-store. They are unverified convenience fields, not proof of
  identity, and never silently update past orders.

## Migration and delivery

Apply through normal reviewed migration tooling, preserving the hosted migration
byte/export contract. This code increment does not deploy or migrate the live VM.
Rollback to source unable to honor customer ownership is unsafe after launch;
review compatibility and prefer a forward fix. Never edit migration checksums.
The public disclosure, staff MFA, quote snapshots and genuine demo outcome boundary
are unchanged. Customer account data in test fixtures is disposable and synthetic.

New tests: `tests/unit/customer-accounts.test.js`,
`tests/customer-e2e/accounts.spec.js`, `playwright.customer.config.js` and the opt-in
integrated HTTPS fixture. Unit coverage includes storage separation, expiry,
recovery replay, account revocation/deletion, ownership and privacy cleanup.
Browser coverage includes real registration/recovery/checkout/history, profiles,
CSRF/cookie guards, themes, axe checks and narrow-screen reflow. Native matrix,
visual/manual and final hosted Lighthouse acceptance must be recorded with actual
results; unrun checks are not passes. Further end-user/brand changes require impact
review before reusing these results.
