# Third-party dependency and asset inventory

DOC-01 review, October 24, 2026. This is an inventory, not a replacement for
upstream license/NOTICE texts or a grant of rights to the group's source.
No root project license was found; the group/repository owner must settle
redistribution terms before a business handoff. No license was added here.

## Locked JavaScript dependencies

Reviewed `package-lock.json` SHA-256:
`2b88e278c7f63310919b617c74ee7e873afb4fbf806a7d96174dbbd7719024aa`.
Installed direct-package metadata agrees with these versions/licenses:

| Package | Version | Declared license | Use |
| --- | --- | --- | --- |
| bootstrap | 5.3.8 | MIT | Locally served CSS/shared controls |
| ejs | 3.1.10 | Apache-2.0 | Server templates |
| express | 5.3.0 | MIT | HTTP application |
| otpauth | 9.5.2 | MIT | Authenticator MFA |
| qrcode | 1.5.4 | MIT | Locally generated enrollment QR |
| @axe-core/playwright | 4.14.0 | MPL-2.0 | Development accessibility checks |
| @playwright/test | 1.64.1 | Apache-2.0 | Development browser checks |
| lighthouse | 13.5.0 | Apache-2.0 | Development audits |

All 212 non-root lockfile entries have license metadata: MIT 154, Apache-2.0 27,
ISC 19, BSD-3-Clause 7, BSD-2-Clause 1, 0BSD 1, MPL-2.0 2, and
`(MIT OR CC0-1.0)` 1. The MPL entries are `axe-core` and
`@axe-core/playwright` 4.14.0; `type-fest` 4.41.0 declares the dual license.
Metadata review is not a file-by-file redistribution audit. A changed lockfile
invalidates this count/version inventory and requires review.

Before distributing an artifact, preserve applicable installed-package LICENSE,
NOTICE and third-party attribution/source materials. Examples inspected locally:
`@playwright/test/NOTICE`, `axe-core/LICENSE-3RD-PARTY.txt`, and their LICENSE files;
EJS and Lighthouse also contain upstream LICENSE files. Development packages are
not customer browser assets, but distributing development tooling still needs its
applicable notices. Use each package's actual text for the distributed version;
do not treat this table as complete notice fulfillment or legal clearance.

## Repository assets and separately installed tooling

- The vendored SecLists password blocklist retains
  [`LICENSE-SecLists`](../src/auth/blocklists/LICENSE-SecLists), MIT, copyright
  Daniel Miessler (2018). Preserve that file and the reviewed blocklist provenance;
  never normalize its integrity-sensitive bytes to package a release.
- Public source contains project CSS/JavaScript and `favicon.svg`; no bundled
  photo library or font files were found in `src/public`. System font references
  do not distribute font binaries. Bootstrap's served CSS comes from its pinned
  dependency; preserve its attribution when packaging it.
- Node/npm, Ubuntu packages, OpenSSL, Certbot, browser binaries and the Google
  Cloud CLI have their own upstream notices/terms. They are separately installed
  tooling, not a new license granted by this repository. Review the exact target
  artifact and its included notices before redistribution; browser testing does
  not grant rights to repackage browser binaries.

## External services and receiving-owner responsibilities

GCP provides billable compute/storage/network; existing credits do not guarantee
coverage. DuckDNS supplies the public hostname, and Certbot obtains/renews the
free Let's Encrypt certificate. GitHub hosts source and CI; account/plan limits
remain the receiving team's responsibility. See [handoff](handoff.md) for account
custody, stop deadline, costs and support exclusions. No live merchant/Wallet or
customer email/SMS sending service is integrated. Their future terms, accounts,
costs and security acceptance remain separate work.

Receiving review remains open: confirm project-source distribution permission,
the actual deliverable's retained upstream notices, and any modified third-party
files/source obligations. Do not record this preparation as client acceptance.
