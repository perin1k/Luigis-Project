# Submit and present Luigi’s Pizza

For the project team preparing the course submission. The agreed deliverable is
**a ZIP of the repository source and a presentation of the hosted website**.
This is not a transfer of GCP/DuckDNS credentials or a new public source license.

## What to show

Open [Luigi’s Pizza](https://luigispizzeria.duckdns.org) and use invented contact
details. Demonstrate guest/customer ordering, staff order work and Owner reporting
with the appropriate individual accounts. Enter passwords and authenticator codes
privately before screen sharing; never show recovery codes or private tracking
links. Payments move no money; email/text previews are not sent messages.

Use [the user guide](handoff.md) and [presentation guide](review-access-plan.md).
The hosted preview is scheduled to stop November 1, 2026 at 11 PM Central. Existing
Spot-interruption, retained-storage cost and disposable-data limits still apply.

## Make the source ZIP (developer task)

After final acceptance, use a clean reviewed `dev` commit. From the repository:

```sh
git status --short
git rev-parse HEAD
git archive --format=zip --prefix=Luigis-Project/ --output=Luigis-Project-submission.zip HEAD
```

Move the finished ZIP outside the repository before any staging/commit. `git
archive` includes tracked files from that exact commit, including source, guides,
locked package metadata, reusable tests and reviewed synthetic visual references.
It excludes Git history and untracked/ignored local files. Check the archive's
contents before submitting; this is safer than zipping the whole working folder.
Do not include passwords, tokens, `.env`, runtime settings, databases, browser
profiles, `node_modules`, local reports or installed browser/runtime binaries.
Never send the professor an Owner password or recovery secret inside the archive.

Record the source commit, ZIP SHA-256, deployed application commit and final
acceptance outcome. Documentation/test-only source commits may be newer than the
deployed application; identify both. This ZIP is source, not a configured hosted
VM image. Technical setup uses the declared Node version and `npm ci` as described
in the README and [technical handoff](developer-handoff.md). Reuse the reviewed
deployment procedure for an existing database; do not overwrite applied SQL or
copy a fresh database over hosted records.

## Notices and permission

Brody confirmed the course requires source submission and class presentation.
No public open-source license is added or implied. The group's source remains
subject to its existing rights and course requirements; unrelated commercial
redistribution remains outside this submission decision.

Retain [the dependency/asset inventory](third-party-notices.md), source copyright
headers and the tracked SecLists license/provenance. The source-only ZIP does not
bundle installed npm packages, Node, browsers or GCP tooling. `npm ci` retrieves
the locked packages with their own upstream notices. If a later deliverable bundles
installed dependencies/binaries, review that artifact's actual upstream LICENSE/
NOTICE/source obligations separately; the inventory is not a substitute.

Final reader/device review, QA and TEST-04 outcomes must be recorded before calling
this the accepted final submission. Do not turn pending checks into a passing claim.
