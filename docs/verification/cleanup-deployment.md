# Cleanup deployment checkpoint — October 25, 2026

Brody approved deployment of the reviewed cleanup to the existing GCP/DuckDNS
Nginx host. Project `capstone-510915`, VM `luigis-preview`, zone `us-central1-a`.
No new cloud resource, paid service, dependency or database migration was added.

## Release and preservation

The before-state was release `a87b662fa7ac473eb7f0b455a6aad9d716c64090` on
Node 24.22.1 with active Nginx/application services. The existing data mount UUID
was verified before activation. The initial candidate `ad5432b` was staged but
not activated after inspection identified unversioned browser scripts.

Brody separately approved complete public JavaScript graph versioning. The
regression first failed against unversioned HTML; implementation now uses a
content-derived directory for entry scripts, module preloads and relative
imports. Unknown versions/server-source paths are rejected. Focused HTTP checks
passed for asset bytes, compression, range/HEAD, bundle ordering and private-path
protection. Chromium/Firefox browser checks passed after correcting the test's
case-sensitive beverage label. Native run
[40174201083](https://github.com/perin1k/Luigis-Project/actions/runs/40174201083)
passed the focused regression on all three operating systems with approved
engine/viewport coverage. Existing visual evidence is reused: URL changes do not
alter the rendered design or business rules.

The corrected release `cde8c928887e27bb6f01c256b77a580a3c3eb28f` was prepared
from the clean reviewed Git revision using `maintain-host.sh`, production-only
locked dependencies and a source-integrity manifest. Candidate and retained
fallback both passed exact database/schema/runtime checks with zero pending
migrations. Activation retained the old release for compatible rollback.

Startup probes briefly returned 502 while Node restarted, then trusted readiness
returned ready. Both services were active afterward. The database device/inode,
private settings-file hashes and retained account/MFA/schema record digests
matched before/after; no seed/reset/migration or credential replacement occurred.
Private material and record contents were not printed or committed.

## Hosted checks and remaining gate

Actual HTTPS browser smoke passed home, menu, ordering, customer entry and staff
sign-in, including axe checks and functioning top ordering controls/beverage
disclosures. No order was submitted and no credentials were used by that probe.
Brody separately confirmed existing Owner sign-in and customer entry both passed.

Standard Lighthouse 13.5.0 mobile/desktop audits on home, menu and ordering found:

| Profile | Performance | Accessibility | Best Practices | SEO |
| --- | --- | --- | --- | --- |
| Desktop, all three pages | 100 | 100 | 100 | 100 |
| Mobile, all three pages | 99 | 100 | 100 | 100 |

Reports remain local; no failed score is waived or called 100. Render-blocking
requests remain a finding. Read-only host inspection confirmed Nginx 1.24.0 has
its HTTP/2 module compiled in, while public negotiation currently uses HTTP/1.1.
A proposed performance increment would enable HTTP/2 and combine public shared
CSS without changing cascade order, then repeat focused/hosted checks. This needs
its separate implementation/configuration approval before changes.

The release is operational; final hosted performance and whole-release QA/TEST-04
remain incomplete. This record does not claim commercial readiness or full WCAG
conformance from automated scores alone.
