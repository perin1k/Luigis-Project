# SEC-02 operator and audit review

> For developers and technical website support. Restaurant staff and owners using
> the website should start with [Using your website](handoff.md) and
> [Find the right guide](README.md). This technical reference is not an everyday user manual.

October 23 application review: operational telemetry now accepts fixed event names,
server-generated UUIDs, timestamps and status codes only (`src/operations/telemetry.js`).
It does not serialize request URLs/bodies, cookies, exceptions or forwarded IDs;
`operations.test.js` verifies deliberate private-data fixtures stay out of output.
The approved hosted policy is direct TLS with no reverse proxy and seven-day
local operational log rotation. Actual host IAM/ACLs, rotation and copy/key custody
remain OPS-02/03/04 verification before publication, not application test results.
The implemented [privacy workflow](privacy-request-workflow.md) and migration 015
supersede the old proposed-procedure note below. No public audit endpoint exists.
See [current acceptance evidence](verification/sec-acceptance.md).

Reviewed October 22, 2026 against the local demonstration implementation. This
records inspected controls and deployment prerequisites, not hosted verification.
See [inventory](privacy-data-inventory.md) and
[retention enforcement](retention-enforcement.md). No deployment is authorized here.

## Verified repository boundaries

- `src/app.js` exposes the intended public assets and reviewed routes. Its normal
  error responses use fixed customer text rather than exception details, request
  bodies or database errors. A response already in progress delegates its error;
  runtime/proxy logging still needs operator review.
- `src/server.js` prints configured listening origin and fixed startup/cleanup/
  preview-worker failure messages. No request-body logger is installed there.
  This does not cover infrastructure logs, terminal capture or debug tooling.
- Authentication routes pass the socket peer address to throttling services;
  login-limit storage uses digest buckets. A future reverse proxy changes which
  peer address is observed. Review trusted proxy topology and throttling before
  hosting; do not blindly trust forwarded client headers.
- `005-access-and-audit.sql` restricts action, entity-type, reason and summary
  vocabulary, links non-null actors to staff identities, and prevents audit
  updates/deletes/replacement. IDs and correlation fields remain text: service
  writers must continue using opaque identifiers rather than personal data.
- Audit storage is not a public audit API. Authorized application roles do not
  automatically imply permission to browse raw SQLite or encryption keys. SQLite
  connection access can read private tables; the database file itself is an
  operator security boundary, not a per-table role system.
- `.gitignore` excludes local environment overrides, SQLite files/journals and
  generated reports/logs. Ignore rules are not encryption, access control or a
  guarantee that every future secret filename is excluded. Review staged files.

## Operator handoff prerequisites

Before hosting, designate the authorized database/key operators, restrict access
using the hosting platform's reviewed identities and file permissions, and keep
key material separate from source and data. Review database journals, exported
files, diagnostics and any hosted snapshots as potential copies of private data.
Do not upload a local database, key file or unredacted diagnostic report to Trello
or GitHub. This review does not change filesystem permissions or destroy data.

Configure and verify infrastructure logging without request bodies, cookies,
Authorization headers, synthetic card plaintext or guest tokens. Do not place
contacts/tokens in URLs. Review log viewers, retention and deletion separately;
no hosted log duration has been selected. Do not claim logs are private merely
because application messages are fixed.

For the disposable demonstration, application cleanup preserves sanitized history
until teardown and does not manage backups. Before teardown, identify the actual
local/hosted copies and external keys, agree the cleanup scope with the team and
obtain applicable deletion authorization. Do not delete a colleague's working
copy or assume deleting one SQLite file removes every copy.

## Evidence and limitations

`node --test tests/unit/access-storage.test.js` verifies allowlisted summaries,
actor references and append-only behavior, alongside the access-storage checks.
Retention integration tests separately verify sanitized cleanup auditing and
rollback on audit failure. This documentation increment changes no application
behavior; browser/visual/Lighthouse reruns are inapplicable to this document.
Existing application acceptance gates remain open.

Not verified here: deployed TLS/proxy configuration, hosting IAM, actual filesystem
permissions, cloud logging, hosted snapshots, physical erasure or legal compliance.
Public privacy/contact copy and applicable request-handling decisions remain separate
SEC-02 acceptance work. A proposed manual procedure is not an implemented public
correction/export endpoint.
