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

## WAL and runtime behavior

File-backed connections opened by `src/data/database.js` require WAL, keep
`synchronous=FULL`, use a five-second busy timeout and retain automatic checkpoints
at 1,000 pages. In-memory test databases remain in memory journal mode. Verify the
actual `sqlite_version()` before switching a deployment: tested Node 24.22.1 embeds
SQLite 3.53.4, newer than the WAL-reset fix in SQLite 3.51.3. The tested retained
disk is local ext4. Do not put this database on a shared/network filesystem.

WAL still permits one writer. Node DatabaseSync and current transaction work remain
synchronous. The change improves measured throughput/disk behavior and permits
separate local connections to read while a writer holds a transaction; it does
not claim a nonblocking database worker or unlimited parallel writes.

Public catalog snapshots have a single-entry, cloned cache per service instance.
Both this connection's `total_changes()` and other connections' `data_version`
invalidate it. Transactional catalog reads and authoritative price checks bypass
the cache, preventing uncommitted changes from leaking after rollback. No customer,
session or private order data is cached. Activity timestamps are written whenever
they actually change; only identical timestamp writes are omitted. No activity
rounding, delayed persistence, permission cache or expiry change was introduced.

The database directory must allow its application user to create private `-wal`
and `-shm` files. Keep these files with a live database; never delete them while
connections are open or copy only the main file as a live backup. A maintenance
copy requires a consistent SQLite snapshot/backup operation or a verified stopped,
checkpointed database. This does not introduce an application backup guarantee.
Leave automatic checkpoints enabled; long readers can delay checkpoint progress.
If changing journal mode during recovery, stop all connections first and verify
the result; a persistent WAL database is readable by the migration-compatible
fallback and does not require weakening FULL durability.

Use `node tests/operations/concurrency-benchmark.js wal 20 3` for the primary
three-round workload; `wal 50 1` and `wal 100 1` are bounded larger observations.
The benchmark binds real loopback peer addresses to exercise distinct clients
without trusting spoofed forwarding headers. It needs the existing OpenSSL test
prerequisite and has been load-tested on Windows and Linux, not claimed on macOS.
WAL/caching/isolation unit checks run on all supported native CI systems.
