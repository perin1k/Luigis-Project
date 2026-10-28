# SQLite concurrency operations

For developers and hosting support. Restaurant users should use [the staff guide](handoff.md).
The October 28 concurrency follow-up is tracked at https://trello.com/c/Adkrey8j.

Migration 017 adds only selective booking/review/payment indexes. It changes no
order, account, permission, price or scheduling rule. Its explicit CRLF attribute
keeps the new migration's checksum consistent across checkouts; applied migrations
001–016 are unchanged and must retain their existing exact bytes.

Prepare a reviewed migration-compatible fallback commit before adding runtime
optimizations. `deploy/maintain-host.sh prepare-forward FULL_COMMIT` prepares and
integrity-checks an archive while allowing reviewed pending migrations. It does
not apply migrations, activate the release or make it a usable rollback target.
Ordinary `prepare` and every `activate` still require zero pending migrations.

For rollout: stop the application, capture private custody hashes, explicitly apply
017 with the migration-compatible release, verify all existing rows/checksums and
the three expected indexes, and verify that release with `release.js check ... ready`.
Activate that compatible baseline before switching to the optimized release. Both
fallback and optimized source must recognize 017. Do not restore older source
that rejects the new migration, remove migration history or rewrite SQL to pass.
An interrupted migration rolls back; a post-migration runtime failure returns to
the compatible baseline, retaining the same data and indexes.

Load testing uses `tests/operations/concurrency-benchmark.js` with disposable files,
synthetic credentials/payment identities and actual loopback source addresses.
It never accepts a hosted origin or production database path. Timings include
expected retries; last-slot conflicts are verified separately. Same-network
60/minute checkout limits remain enabled and must not be mistaken for database
capacity. These tests exclude password hashing and Internet/network latency.
