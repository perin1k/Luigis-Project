# OPS-05 disposable-data recreation and recovery limits

October 22, 2026. Card: https://trello.com/c/c1UwtgAs. Scope is the approved
synthetic class demonstration: no application-managed backups are required.
This procedure creates a **different, empty database**. It is not restoration of
lost orders, guest access, staff accounts, payment secrets or business operations.
No working database was deleted or replaced in the rehearsal.

## Rehearsed behavior

`tests/unit/disposable-recreation.test.js` uses only its own newly created temporary
directory. It invokes the real migration/seed CLI against two distinct database
paths. Through actual services it creates one paid synthetic order with tracking
and financial records, then publishes a new menu price and changes ingredient
availability using an isolated authorized staff identity.

The rehearsal verifies:

- Closing/reopening the retained database and rerunning migration/seed preserves
  committed order/quote/line/payment/allocation/tracking/outbox history, staff
  identity, published price edits and ingredient availability. Existing migration
  names/versions/checksums remain identical.
- Retrying the same payment returns the recorded result without another payment
  or tracking grant; the remembered original private link still reads its order.
- Retained encrypted synthetic data remains verifiable with its original external
  key. A newly generated replacement key fails verification. Plaintext and keys
  are never printed; there is no HTTP decryption or recovery shortcut.
- A disposable child opens an immediate transaction, writes uncommitted catalog/
  ingredient changes and is terminated before commit. Reopening rolls back those
  changes while retaining committed history and staff edits. Integrity and foreign
  key checks pass. Only this test-owned child is terminated.
- A separate fresh database has matching reviewed schema checksums and baseline
  menu prices, but **zero** orders, payments, allocations, guest grants, staff users,
  payment ciphertext, notifications or audit history. Creating it does not alter
  the retained database.

This is a local SQLite process-interruption exercise, not a GCP power-loss,
filesystem-damage, lost-disk, lost-key, backup-restore or hosted availability test.
The test fixture's staff identity/session is synthetic and cannot establish that
fresh databases have working login credentials. Real local bootstrap is a separate
private interactive procedure; there is no default shared admin password.

## Safe operator sequence

1. Agree whether the objective is restart, code rollback or **new disposable data**.
   Restart/rollback preserves the existing database. Recreation does not recover
   lost information and must not be used to hide a failed release or erase cases.
2. Record the exact reviewed release, Node/npm environment and intended new path.
   Keep the current database, its journals and its external keys untouched.
   On a host, verify the approved data disk is mounted before writing anything;
   do not let a missing mount create a replacement database on the boot disk.
3. Select a new, previously unused path under authorized private storage. Configure
   it as DATABASE_PATH through the approved operator environment. Do not use the
   migration command's default path accidentally. For platform-specific environment
   syntax and permissions, follow [the cross-platform guide](cross-platform.md).
4. On the selected release with locked dependencies installed, run:

   ```sh
   npm run db:migrate
   npm run db:seed
   ```

   Verify schema checksums, menu amounts, expected empty transaction/account
   tables, integrity and foreign keys before pointing an application at that path.
   These commands are for a deliberate new path; they do not authorize changing
   or deleting the working dataset.
5. Provision independent private MFA/payment keys as appropriate to this **new**
   demonstration environment, then perform [private first-admin setup](authentication-design.md#implemented-local-first-admin-setup).
   New keys do not decrypt old records. Do not upload developer databases/keys,
   preserve old raw guest links in logs or claim prior staff accounts were restored.
6. Test actual configured customer/staff/admin flows against invented data before
   use. The existence of tables and seed data alone does not enable checkout,
   authentication, HTTPS, payment encryption or notification workers.
7. Switching the operator-selected runtime to a new dataset requires a deliberate
   reviewed change. Keep prior data isolated pending its approved retention and
   cleanup decision; do not silently merge histories or reuse request identities
   as evidence that an old order was fulfilled in the new database.

## Lifecycle and rollback boundaries

Normal [retention cleanup](retention-enforcement.md) removes eligible synthetic
contacts, tracking grants, internal previews and expired ciphertext under the
approved deadlines; sanitized order/payment/audit history remains until teardown.
Recreation neither bypasses retention nor guarantees physical erasure of files,
journals, filesystem snapshots, operator exports or other copies.

The approved hosted shutdown is November 1, 2026 at 11 PM America/Chicago
(November 2, 05:00 UTC). The sponsor stops service/VM under the approved procedure;
disks and keys remain pending separately authorized cleanup, with continuing
storage costs reviewed. No resource/data deletion or shutdown job was performed
by this rehearsal. Follow [hosting decisions](hosting-design.md) and
[deployment/rollback instructions](deployment-runbook.md).

No backups or snapshots were provisioned. If they are later selected, approve
scope, retention, access, encryption-key custody, restore tests and deletion first;
never silently enable indefinite copies. Persistent disks are not backups.
Code rollback requires a release compatible with current applied migrations and
retained data. Do not edit applied SQL, downgrade schema blindly, reset Git history
or replace current data with an older copy to make rollback appear successful.

## Verification and scope of completion

Reproduce the isolated rehearsal with:

```sh
node --test tests/unit/disposable-recreation.test.js
```

The test removes only its own temporary directory after closing connections and
stopping its own child. No cloud account, hosted database, working dataset, live
payment, external notification, snapshot or key file is touched.

The full-card criteria are the documented/rehearsed **disposable recreation** and
accurate recovery limits above, not a backup implementation or general release
acceptance. This verification changes tests/documentation only; it adds no product
UI or runtime feature. Browser/Lighthouse/manual UI checks are inapplicable to
this isolated database exercise. Remaining project-wide Firefox, Windows/Linux,
manual accessibility and hosted acceptance gates are retained separately and are
not claimed passed by this card. Environment/result details accompany the final
verification entry below.

Final verification: macOS 27.0.1 arm64, Node 24.14.1, npm 11.11.0.
`npm run test:unit`: **254 pass**, zero failures/skips. After adding the explicit
IPC/test-only guard to the interruption child, the focused recreation test was
rerun and passed. Syntax, local documentation links, checksum/retention statements
and diff/whitespace were reviewed. Windows/Linux execution of this rehearsal was
not performed or claimed. No application file, migration or dependency changed.
