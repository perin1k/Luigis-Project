# Cross-platform development and verification

Windows, macOS and supported Linux distributions are development/runtime targets
for the same JavaScript, Node.js, Express, EJS and Bootstrap application. This is
a compatibility requirement, not a claim that every OS/version or every workflow
has already passed. Customer browser compatibility and server/developer OS
compatibility are separate verification dimensions. The scoped storage CI workflow
below is approved separately; it changes no application behavior, hosting
configuration, dependency or key permissions.

## Prerequisites

- Use the patched, tested Node.js **24.22.1** and bundled npm **11.19.1**; the
  repository's `.node-version`/`.nvmrc` declare that baseline. `package.json`
  permits patched 24.x versions from 24.22.1; another version still needs actual
  verification. Older pinned evidence below remains historical. This includes
  `node:sqlite`, with npm. Agree a tested Node/npm version for a shared verification
  run; the minimum declaration does not certify every later runtime. Install the
  exact locked dependencies with `npm ci` in each checkout. Do not copy
  `node_modules` or browser binaries between operating systems or architectures.
- Install Git. OpenSSL must be discoverable on PATH for the self-signed HTTPS
  test fixtures; inspect with `Get-Command openssl` in PowerShell or
  `command -v openssl` in Bash/Zsh. The Windows Git installation may provide an
  OpenSSL executable outside the default PATH. Resolve the actual installation
  locally; never hardcode a colleague's path in repository scripts.
- Install browsers from the locked local Playwright version, not a separately
  selected global release. Use an OS supported by that version. Linux may need
  browser system libraries; inspect the official requirements and review the
  package-installation scope before commands such as `playwright install-deps`.
  Do not automatically use administrator/root privileges to fix a test failure.
- Record `node --version`, `npm --version`, `git --version`,
  `npx playwright --version`, OS release and architecture with verification.
  A missing tool or unsupported platform is a limitation, not a passing check.

Run the platform-neutral setup commands from the repository root:

```sh
npm ci
npm start
```

Without integration settings this serves the unconfigured presentation at
http://127.0.0.1:3000. Database, authentication and demonstration payments need the
configuration described in [authentication](authentication-design.md),
[payments](demo-payment-design.md) and [integration boundaries](integrations.md).
Never invent default staff credentials, encryption keys or successful payments
for an otherwise unconfigured installation.

## Shell configuration

Environment assignment syntax differs. These examples use only non-secret
settings and must run in the same shell as the subsequent command.

Windows PowerShell:

```powershell
$env:NODE_ENV = 'production'
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
npm start
```

macOS/Linux Bash or Zsh:

```sh
export NODE_ENV=production
export HOST=127.0.0.1
export PORT=3000
npm start
```

Set each integrated runtime's additional reviewed settings separately. Node does
not automatically load this project's `.env` file. Keep secrets outside Git,
browser storage, URLs, screenshots, logs and shell history; do not paste actual
keys into shared commands. No environment loader is introduced by this guide.

For browser installation and test runs, use the same browser location in that
shell. PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'node_modules/.cache/ms-playwright'
npx playwright install chromium firefox webkit
npm run test:unit
npm test
```

Bash/Zsh:

```sh
export PLAYWRIGHT_BROWSERS_PATH="$PWD/node_modules/.cache/ms-playwright"
npx playwright install chromium firefox webkit
npm run test:unit
npm test
```

The Playwright configurations default to that repository-local location. An
explicit existing cache is acceptable if it contains the correct native binaries
for the locked version. Browser installation may require downloading binaries;
the commands above do not install Linux system packages or change certificate trust.
`npm test` covers the default presentation suite, not every integration suite.
Run the relevant separate configurations (pricing, orders, scheduling, payments,
staff and staff-orders) for the behavior being accepted. A failed launch is not
an application pass or proof of an application defect.

## Portable implementation rules

Use `node:path`, `fileURLToPath`/URL APIs and `os.tmpdir()` as appropriate. Quote
shell paths containing spaces and use exact filename/import case, including on
case-insensitive development filesystems. Prefer Node scripts and argument arrays
to commands that assume PowerShell, Bash, a drive letter or a particular home
directory. Do not assume executable bits, symlink behavior, path separators,
locale or the device timezone are identical. Restaurant scheduling still uses
America/Chicago, independent of the machine's timezone.

Follow [.gitattributes](../.gitattributes). The pinned password blocklist must keep
its original LF bytes so its SHA-256 check works on Windows and Unix systems.
Preserve immutable applied migrations and pinned checksums. Do not change global
Git settings or mass-normalize the repository as a compatibility shortcut.

## Certificates, keys and local data

Staff functions require the configured HTTPS origin and trusted certificate/key
material on all systems. OpenSSL-generated self-signed certificates and
`ignoreHTTPSErrors` belong only to isolated automated fixtures. Do not disable TLS,
change system trust automatically, or weaken cookie/MFA checks for portability.

For payment key files, the current loader verifies POSIX owner/mode restrictions;
Windows operators must separately verify equivalent private ACLs. There is no
automatic Windows ACL verifier or private-key provisioning in this documentation.
Review platform-specific symlink and key handling before hosted acceptance; do
not interpret a skipped POSIX check as equivalent verified Windows protection.
The [payment guide](demo-payment-design.md) defines actual loader behavior and
the [operator review](privacy-operator-review.md) defines remaining custody checks.

Use private local database/key paths suitable for the host OS. Do not share a
live SQLite file between machines through a synchronized/network directory or
reuse another developer's secrets as a setup technique. Use reviewed migrations
and seed commands for isolated disposable databases. Teardown and destructive
cleanup require their own applicable authorization.

## Visual references

Preserve OS/browser/viewport-specific names (`win32`, `darwin`, `linux`) generated
by Playwright. Fonts, native controls and rendering can differ legitimately;
require equivalent accessible behavior and design, not identical pixels between
operating systems. Compare each environment against its reviewed native baseline.
Record versions, inspect changes and rerun without snapshot updates afterward.
Never copy Windows images over macOS/Linux images or change tolerances to hide a
functional, contrast or reflow problem. Missing or stale native baselines require
review; they do not justify automatic bulk acceptance. Keep reports ignored.

Some current receipt changes have reviewed Windows references but still need
native macOS refresh; Linux reference coverage has not been established. Existing
macOS images elsewhere do not establish freshness of every receipt or page.
Browser-engine emulation does not prove real Safari/device behavior. Automated
axe/Lighthouse checks supplement manual keyboard, zoom and screen-reader review.

## Current evidence and release acceptance

### DATA-02 storage workflow

The approved `.github/workflows/storage-verification.yml` runs the same
`npm run test:storage` command on Ubuntu 24.04, Windows Server 2022 and macOS 14,
using Node 24.14.1 and `npm ci`. `scripts/verify-storage.js` supplies explicit
test paths to Node without shell wildcard expansion. It propagates test failures
and runs storage, migration/reopen/rollback, recreation, payment/concurrency,
notification and Owner/Admin/Employee migration/lifecycle checks sequentially.
The registry now includes additive migration 014; applied SQL remains immutable.

Jobs run for relevant pushes and pull requests to `dev`, use pinned action
commits and read-only repository permissions, and do not persist checkout
credentials. They require no application secrets, live database, browser install,
deployment, uploaded reports or dependency cache. Standard hosted runners are
free for this public repository; review billing before changing its visibility
or runner class. Repository Actions policy can still prevent execution.

A workflow file is not a passing result. Verify all three jobs against the
published commit before completing DATA-02. The historical macOS checkpoint in
[the storage record](verification/data-02-storage.md) predates migration 014;
current workflow outcomes must be distinguished from that preserved evidence.
This storage-only workflow does not certify browser visuals, manual accessibility,
private-key custody, the minimum supported Node version or full hosted acceptance.

Storage checkpoint verified October 22, 2026: the Ubuntu, Windows and macOS jobs
all completed successfully for commit `a66f4fc1431e08afd7bc4403a9c3a61259e7bb17`
in [the DATA-02 workflow run](https://github.com/perin1k/Luigis-Project/actions/runs/39877036892).
This closes the previously missing storage OS evidence through migration 014.
The application/browser/hosting obligations below remain separate acceptance work.

| Target | Available evidence | Still required |
| --- | --- | --- |
| Windows | DATA-02 hosted storage suite passed; recorded local Node/unit/HTTPS and Chromium/Firefox/WebKit checks for reviewed increments, including receipt visuals | Full integrated acceptance, manual accessibility and actual operator/hosting configuration |
| macOS | DATA-02 hosted storage suite passed on arm64; teammate verification records and native references under `docs/verification/` and test snapshot directories | Current receipt reference refresh, recorded runtime/browser limitations and remaining manual/integrated acceptance |
| Linux | DATA-02 storage/migration suite passed on Ubuntu 24.04 through the linked hosted CI run | Integrated runtime/browser checks, browser system prerequisites, manual accessibility and reviewed visual coverage |

This matrix describes evidence, not assignments or a waiver. For release, record
tested versions and results for applicable setup, migrations/seed in disposable
data, customer checkout/tracking, employee/admin authentication/permissions, data
security and all three browser engines on each supported target. Report any
unavailable environment separately. CI matrix work, additional packages, runtime
changes and infrastructure require a concrete approved increment; no workflow or
billable resource is created by this policy. A documentation-only review cannot
mark the application cross-platform release complete.

## Native macOS keyboard navigation

When testing native controls in macOS WebKit, enable Keyboard Navigation before
browser launch. [Apple documents](https://support.apple.com/en-lamr/guide/safari/cpsh003/mac)
that Tab reaches buttons and other controls when this setting is enabled. The
[matching Playwright report](https://github.com/microsoft/playwright/issues/41808)
records an app-scoped prerequisite for its disposable WebKit browser:

```sh
defaults write org.webkit.Playwright AppleKeyboardUIMode -int 2
defaults read org.webkit.Playwright AppleKeyboardUIMode
```

The TEST-02 workflows apply this only on disposable hosted macOS runners, not on
teammates' personal machines. Developers can enable Keyboard Navigation in macOS
Keyboard settings for their own review. This is a platform input prerequisite,
not permission to add unnecessary tabindex attributes, force focus from tests,
skip keyboard cases or weaken assertions. Preserve the initial failure and actual
follow-up outcome in [TEST-02's record](verification/test-02-checkout-acceptance.md).
It does not establish real Safari/device acceptance.

## Tool references

Staff authentication has a separate
[acceptance workflow and checklist](staff-acceptance.md). Its current matrix uses
Ubuntu 24.04, Windows Server 2022 and macOS 15; the storage matrix above remains
on macOS 14. This distinction is intentional: the older macOS staff runner hit
a WebKit protocol failure before page creation. The replacement runner retains
the lockfile and strict assertions and must produce its own verified outcome.
Separate bounded installation and test steps allow slow Linux prerequisites
without claiming a timeout is a successful browser check. Staff coverage now uses
the explicitly approved Windows Chromium/Firefox and macOS/Linux three-engine
matrix, retaining native Windows WebKit as a visible unsupported diagnostic.
Reviewed hosted visual references are separate from local developer references;
the strict native CI command never updates them. See the staff record for current
outcomes and the remaining deployment/operator boundaries.

Staff feature acceptance verified October 23, 2026: all required unit/HTTPS,
functional/accessibility and strict native visual jobs passed at commit
`4f5974c872bcf1bc4125701c9cc52de3b378df9d` in
[the staff workflow run](https://github.com/perin1k/Luigis-Project/actions/runs/39903130899).
The approved native Windows WebKit diagnostic remains failed and unsupported;
the required matrix is Windows Chromium/Firefox and macOS/Linux all three
engines, each desktop/mobile. This completes BE-08/FE-08 application acceptance,
not integrated customer/release acceptance or actual installation under OPS.

- [Playwright installation and supported systems](https://playwright.dev/docs/intro)
- [Playwright browser installation and dependencies](https://playwright.dev/docs/browsers)
- [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)
- [Node.js SQLite API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)

Consult documentation matching the locked tooling and tested runtime; current
upstream requirements do not retroactively certify this project's versions.
