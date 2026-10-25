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
requests remained a finding at that checkpoint. Read-only host inspection confirmed
Nginx 1.24.0 had its HTTP/2 module compiled in but negotiated HTTP/1.1. The separately
approved follow-up below resolves this measured performance gap; these original
99 scores remain recorded rather than being relabeled.

## Approved HTTP/2 and stylesheet follow-up

Brody approved the focused performance increment. Source revision
`0e931d6e4f866beecbe6094e3a561fc20a176dc8` adds the public stylesheet bundle and
HTTP/2 listener flags. Bootstrap, tokens and global CSS retain their exact byte
order; the shared template discovers CSS before synchronous theme initialization.
The verified TLS upstream, authentication and business rules are unchanged.

Both new regressions failed first against the preceding implementation. Eleven
focused HTTP/proxy checks then passed, including byte equality, compression,
caching, module versioning and trust boundaries. Native strict browser comparison
[40175148502](https://github.com/perin1k/Luigis-Project/actions/runs/40175148502)
passed all Windows/macOS/Linux jobs for `homepage|versioned JavaScript|theme`.
It reused accepted references with no snapshot updates. Windows covered Chromium/
Firefox; macOS/Linux also covered WebKit, with desktop/mobile viewports. Actual
Ubuntu Nginx integration/security rehearsal
[40175125539](https://github.com/perin1k/Luigis-Project/actions/runs/40175125539)
also passed. This does not claim real Safari or physical-device coverage.

The new release was prepared with production lockfile dependencies, manifest and
zero pending migrations. Source archive SHA-256:
`9ced240f6720c61610e9985ac9e38c8ac7ed358d3a45b2e5a831b21f297283f7`.
The root-private Nginx candidate changed only two listener flags, passed actual
`nginx -t`, and retained a private previous configuration before reload. The first
probe immediately after reload negotiated HTTP/1.1 during worker replacement;
the later trusted public probe confirmed **HTTP/2 200**. App startup 502 probes
recovered to ready. Both services remained active. Data device/inode, retained
account/MFA/schema digests and other private settings matched before/after.
No migration, seed, credential/key replacement or order submission occurred.

Active release is `0e931d6e4f866beecbe6094e3a561fc20a176dc8`; the preceding
`cde8c928887e27bb6f01c256b77a580a3c3eb28f` remains the compatible release fallback.
The private prior Nginx configuration is retained under the root-only
`/var/tmp/luigis-http2.*` operator directory. Recovery must validate the saved
configuration before restoring/reloading it; never print its private proof.

Hosted Chromium smoke/axe again passed home/menu/order/customer/staff entry and
ordering controls without credentials or submitting an order. Standard unchanged
Lighthouse 13.5.0 profiles against public trusted HTTPS, sequentially on this
release, produced six audits with no runtime errors:

| Profile | Pages | Performance | Accessibility | Best Practices | SEO |
| --- | --- | --- | --- | --- | --- |
| Mobile | Home, menu, ordering | 100 | 100 | 100 | 100 |
| Desktop | Home, menu, ordering | 100 | 100 | 100 | 100 |

Detailed sanitized results remain local in `reports/cleanup/perf-lighthouse.json`.
This closes this performance follow-up, not whole-release QA/TEST-04. Existing
manual evidence for unchanged screens is reused. Separate final QA ownership,
device/load/recovery acceptance and receiving-person handoff remain as recorded
on their cards; no commercial-readiness or full WCAG claim follows from scores.
