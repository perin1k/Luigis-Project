# OPS-01 release configuration

Approved architecture: [hosting decision](../docs/hosting-design.md). These files
prepare deployment; copying them to Git does not install or publish a cloud host.
Actual hosted identities/keys and resources remain OPS-03/02. Never run the
disposable CI rehearsal on a developer computer or the eventual GCP machine.

## File guide

| File | Responsibility |
| --- | --- |
| `luigis.service` | Ubuntu systemd supervision, required mount/existing DB, private environment, unprivileged direct HTTPS, release/runtime preflight and bounded restart/shutdown |
| `runtime.env.example` | Non-secret configuration contract; no valid MFA key or staff credential |
| `../scripts/release.js` | Operator-created release manifest and read-only source/runtime/schema compatibility checks; never installs, migrates, seeds or switches the running release |
| `../scripts/validate-runtime.js` | Complete HTTPS/MFA configuration, current matching TLS key/certificate, private payment-key loading and key separation checks; the service's `--host` mode also enforces OPS-03 layout policy |
| `../scripts/setup-host-secrets.js` | OPS-03 private, no-overwrite initial key/environment creation and staged payment-key rotation |
| `../scripts/validate-host-layout.js` | OPS-03 actual Linux service identity, private data/key files and protected root-owned configuration/source/dependencies |
| `../tests/unit/release.test.js` | Source/lock change, runtime mismatch, schema compatibility, missing DB and read-only preservation regression checks |
| `../tests/unit/deployment-runtime.test.js` | Disposable certificate/configuration rejection and redacted CLI failure checks |
| `../tests/operations/rehearse-ubuntu.js` | Opt-in root-only disposable Actions host: real systemd/mount/direct HTTPS and release/schema rollback rehearsal; removes only its own isolated installation |
| `../.github/workflows/ops-runtime.yml` | Focused portable unit checks on Windows/macOS/Linux; actual systemd rehearsal only on Ubuntu; no application secret or database artifacts uploaded |

All operational JavaScript uses Node APIs and argument-based child processes.
The systemd unit and mount rehearsal are deliberately Linux-specific; Windows/macOS
development and application behavior keep their existing supported paths.

## Release preparation and trust

Use Node **24.22.1**, npm **11.19.1** and the reviewed lockfile. Place the verified
runtime at `/opt/luigis/runtime/bin/node`; the service does not depend on a user's
shell, nvm profile or PATH. Verify the downloaded Node distribution's published
checksum before installation. Resolve and record the exact approved Ubuntu image
under OPS-02; a GitHub Ubuntu runner is not that GCP image.

On an operator-owned verification checkout, resolve a reviewed full commit and
export only tracked runtime content to a new release directory:

```sh
git rev-parse <reviewed-reference>
git archive --format=tar --output=/private/staging/release.tar <full-commit> src scripts deploy package.json package-lock.json
```

`<...>` and `/private/staging` are placeholders to replace after path review.
Extract into `/opt/luigis/releases/<full-commit>/`, never the data directory. Run
`npm ci --omit=dev --ignore-scripts` there with the pinned runtime/npm. Current
locked production dependencies require no lifecycle install scripts; review that
assumption before changing dependencies. No build/bundle compilation is required.
Then, from the release directory:

```sh
/opt/luigis/runtime/bin/node scripts/release.js manifest . <full-commit>
```

The manifest records actual Node version, SHA-256 of source/scripts/deployment
files and package/lockfile, and migration checksums from a fresh in-memory schema.
It excludes `node_modules`, databases and keys. Install dependencies independently
with the lockfile; the manifest is not a signature, dependency malware scan or
proof that an untrusted author supplied safe code. Trust comes from reviewed Git
source and operator-controlled immutable release directories. Protect source,
manifest, dependencies and the runtime from service-user writes before activation.
Do not regenerate a manifest merely to accept an unexpected change.

Keep `/opt/luigis/releases`, its parent and `/opt/luigis/current` root/deployer
owned; source and dependencies readable by `luigis`, never writable by it.
Keep SQLite on the actual private data mount. Keep keys outside both the data
directory and release. The environment file is root-owned mode 0600; the payment
key and service-readable TLS files are private regular files, mode 0600. The
existing payment loader requires payment-key ownership by the service user.
Provision/verify real custody under OPS-03, including individual Owner setup.
Follow [the private setup and credential lifecycle guide](../docs/secret-custody.md).
The generated environment declares `LUIGIS_ENVIRONMENT=hosted-demo`; the systemd
unit's `validate-runtime.js --host` requires the protected hosted layout rather
than treating portable development preflight as real host custody verification.

## Forward deployment and compatible rollback

Carry out host commands only under the separate approved operator scope. Before
initial seed, migration, switching or starting, verify the exact data-disk UUID
and mount; do not rely on directory existence. The service uses both
`RequiresMountsFor` and `AssertPathIsMountPoint`, plus an existing-database assertion.
Bind mount/tmpfs success in CI does not prove the future disk's identity.

1. Stage and verify the candidate, then stop `luigis.service`. Confirm it is
   inactive and no application process remains before changing schema or pointers.
2. With the intended `DATABASE_PATH` privately configured, run the candidate's
   `scripts/release.js check <candidate-directory> forward`. This read-only check
   rejects damaged/unknown/checksum-changed history and reports pending migrations.
3. Review any pending schema changes. Only then run existing `scripts/migrate.js`
   as the service identity with its private DB path. For a brand-new isolated
   dataset, use the existing seed and interactive Owner bootstrap procedures;
   never reseed/recreate a retained database as a rollback shortcut.
4. Run `scripts/release.js check <candidate-directory> ready`. It requires an exact
   schema match. Validate the unit with `systemd-analyze verify` and private config
   before loading/enabling it. The unit repeats integrity/schema/runtime checks
   before every start, including restarts.
5. While stopped, create a new sibling symlink to the candidate and rename it over
   `/opt/luigis/current` atomically on the same filesystem. Retain the old release
   and its full ID. Never overwrite a directory or change data/key paths.
6. Start the service and verify trusted-host readiness and customer/staff smoke
   checks. `systemctl start` success alone is not transactional readiness.
7. If rollback is necessary, stop again and run the OLD release's
   `scripts/release.js check <old-directory> rollback` against the CURRENT retained
   database. It requires an exact migration/checksum match; unknown/newer schema
   or missing migrations blocks rollback. If it passes, atomically repoint while
   stopped, restart and repeat smoke checks. Otherwise remain stopped and use a
   reviewed forward-compatible fix. Do not downgrade SQL, edit applied migrations,
   delete records, replace the database or discard payment keys.

The service catches ordinary crashes with a five-second backoff and a bounded
start limit; investigate failures rather than continuously restarting. SIGTERM
uses the application's existing graceful close; systemd grants 30 seconds before
its normal forced-stop fallback. That fallback is not a promise every in-flight
request completes. VM preemption and restart capacity remain the hosting contract.

## Assets and caching across releases

`src/app.js` prepares compressed public text/bundle assets when the application
is created. Editing those files in place does not refresh that cache; release
switching must restart the process. EJS production view caching also resets at
restart. The public text routes allow `max-age=3600`; private pages remain no-store.
There are no content-hashed asset URLs today. For an incompatible HTML/JS/CSS
contract, keep old/new assets compatible through that one-hour cache window or
obtain a reviewed versioned-URL/cache-policy change before release. A hard refresh
can help an operator's smoke test, but does not invalidate other visitors' caches.
Rollback resets server-prepared text, not an already cached browser response.

## Validation and source references

Patched runtime maintenance, clean-checkout packaging/redeployment and compatible
rollback: [OPS-07 maintenance guide](../docs/maintenance-continuity.md).
`deploy/maintain-host.sh` stages a reviewed runtime and new immutable releases;
it does not replace keys/data or seed an existing hosted database.

### Private Windows DNS handoff

`scripts/encrypt-duckdns-transfer.js` reads the token on local standard input
and writes only RSA-OAEP/SHA-256 ciphertext for a one-time VM public key.
`deploy/prepare-dns-transfer.sh` creates that root-private key on the target VM;
only its public key is downloaded through authenticated IAP. Upload the ciphertext
as `/tmp/luigis-duckdns-transfer.bin`. Install the reviewed standalone receiver
`scripts/decrypt-duckdns-transfer.js` root-owned outside the immutable app release
as `/usr/local/lib/luigis-operators/decrypt-duckdns-transfer.mjs`, then invoke it
with the pinned runtime as root. It accepts only the named host's unexpired
payload, creates the root-only credential without overwrite and removes its
one-time private transfer key. Never pass the plaintext token in shell arguments.
This accommodates Windows SDK transports that do not preserve piped stdin.

The DNS updater accepts Ubuntu systemd's `0440` credential only at the exact
per-service credential directory, with root ownership and a verified read-only,
nosuid/nodev/noexec mount. Ordinary writable/group-exposed files remain rejected.
The persistent credential remains root-owned `0600`; DynamicUser and
LoadCredential keep the application identity separate from DNS credentials.

Focused checks: `node --test tests/unit/dns-transfer.test.js tests/unit/duckdns.test.js`.
The encryption check uses invented input and verifies expiry, no plaintext output,
invalid-input rejection and overwrite refusal. These operator files do not serve
browser content or alter the database schema.

Run focused tests with `node --test tests/unit/release.test.js tests/unit/deployment-runtime.test.js`.
The approved workflow additionally exercises the real Ubuntu service using only
disposable secrets/data and a local certificate trusted by its probe. It stages
two compatible releases, checks changed text after restart and rollback, introduces
a clearly synthetic additive migration, rejects the now-incompatible old release,
then starts a compatible forward release. It also kills only its own verified
application service and confirms a new ready process after supervised restart.
Finally it unmounts the disposable data
mount and verifies refusal even when a boot-disk decoy DB exists. This is not GCP
durability, public TLS, an operator recovery rehearsal or a backup restore.

Directives are checked against [systemd unit](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html),
[service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
and [execution environment](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
documentation. Actual Ubuntu runtime validation is required; newer documentation
alone does not establish support for every directive on the deployed version.
Current outcomes and remaining gates: [OPS-01 evidence](../docs/verification/ops-01-runtime.md).
