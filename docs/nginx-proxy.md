# Nginx reverse proxy — technical operator guide

For authorized developers/hosting support. Restaurant users should read
[Using your website](handoff.md). Brody approved current-application deployment,
including additive customer migration 016, and controlled existing-VM Nginx cutover
on October 24, 2026. No extra VM or paid proxy service is introduced. This guide
alone does not authorize future infrastructure, spending or deletion.

## Architecture and trust

Nginx serves public HTTPS on 443 using the existing free Let's Encrypt certificate.
It forwards over **verified HTTPS** to Node on `127.0.0.1:3443`, preserving actual
encrypted sockets for existing origin/CSRF/session guards. Node binds only to
loopback and loses its privileged-port capability. The backend port is not opened
publicly. Port 80 remains ACME-only for existing Certbot standalone renewal.

The reviewed Nginx 1.24 configuration enables public HTTP/2 on both TLS listeners
using `listen ... ssl http2`; the verified loopback upstream stays HTTP/1.1 over
TLS. The installed binary must include `--with-http_v2_module`. Validate a private
candidate with `nginx -t` before replacing/reloading the active configuration;
retain its previous root-private copy for recovery. Never print the configuration.
Newer Nginx versions require a separately reviewed syntax/compatibility check.

Nginx overwrites Host/forwarding headers, verifies the upstream certificate/hostname/
CA and supplies a private random proof. Before assets or application work,
`src/security/proxy-boundary.js` requires loopback TLS, that proof, canonical
host/HTTPS and a single valid forwarded address. Only then can `clientAddress()`
affect authentication/customer/anonymous rate limits. Direct mode ignores forwarded
claims; Express-wide trust of arbitrary headers is not enabled. One-day HSTS has
no subdomain/preload policy. A compromised root/application process remains trusted.

Request/response buffering, response temp files, proxy caching and upstream retries
are disabled. Proxy body/time/connection limits complement application validation.
There is no invented extra payment retry at the edge.

## Files and private settings

- `scripts/nginx-config.js`: validates and renders configuration containing the
  private proof. Never print it, commit it, or run `nginx -T`.
- Root `scripts/setup-nginx.js prepare`: stages `/etc/luigis/proxy/runtime.direct.env`,
  `runtime.proxy.env` and `nginx.conf` privately, refusing overwrite. Active settings
  remain intact. `REVERSE_PROXY_MODE=nginx-tls`, loopback HOST/unprivileged PORT and
  generated `PROXY_SHARED_SECRET` enable the boundary; AUTH_ORIGIN stays public.
  Existing database/MFA/payment/TLS paths and keys remain unchanged.
  Run from the reviewed release directory using the relative script path; the
  original CLI entry guard does not follow an absolute `/opt/luigis/current`
  symlink invocation. Do not alter files inside an immutable release to fix that.
- `deploy/nginx-service.conf` selects that private configuration, with root master
  and www-data workers. `deploy/luigis-proxy.conf` removes Node's bind capability.
- `deploy/nginx-cutover.sh activate` switches reviewed transport settings/drop-ins,
  verifies trusted public readiness and attempts direct-mode recovery on failure.
  `restore-direct` uses the **same new release/schema**, not an older release unable
  to honor customer migration 016. Other service overrides remain intact.
- The Certbot hook installs the verified private Node TLS pair, then checks/reloads
  active Nginx. Existing renewal account/domain remain.

## Execution and recovery

1. Verify exact source/unit/security/native Nginx results. Prepare canonical immutable
   source with the existing migration-byte contract and patched runtime.
2. Review actual apt candidate/dependencies. Keep Nginx masked/inactive during
   installation so the distribution default cannot publish an HTTP welcome page.
3. Record safe before-state digests/counts for staff/ownership/MFA/recovery/schema
   and database identity. Stop Node for the approved additive migration; do not
   seed/reset data or edit earlier SQL/checksums.
4. Establish the new release in direct HTTPS mode first. Verify readiness/integrity
   before proxy activation, giving a schema-compatible recovery mode. A failed
   migration needs compatibility inspection, never blind source/SQL downgrade.
5. Stage/check private proxy settings and service-user preflight, then activate
   Nginx. Verify listener isolation, trusted TLS, entries/denials/cookies, workers
   and private telemetry. Rehearse same-release direct recovery/forward activation,
   restart and renewal. Coordinate private human Owner sign-in without credentials
   in chat or artifacts.

The status-only Nginx log goes to the existing private journal via syslog: timestamp,
status/upstream/timing only, no URLs, addresses, headers, cookies or bodies. Raw
request-bearing error contexts are disabled; diagnose through status telemetry,
service state and monitored readiness. This privacy/diagnostic trade-off retains
existing journal bounds/retention and adds no cloud log exporter or access-log file.
On this Ubuntu host journald retains the syslog hostname/tag inside MESSAGE rather
than populating SYSLOG_IDENTIFIER for these Nginx entries. Query by process instead:
`sudo journalctl _COMM=nginx --grep 'luigis_proxy: ' --since '1 hour ago'`.
The hostname prefix is host metadata, not the visitor's address. Do not mistake
an empty `journalctl -t luigis_proxy` result for missing telemetry.

Proof rotation requires coordinated reviewed configuration/runtime replacement.
VM stop retains disks, keys and costs. Existing hosting/support/data-loss boundaries
remain; a reverse proxy alone does not establish commercial readiness.

## Verification status

Focused local boundary/auth/customer/release/TLS checks passed (40 tests).
`tests/operations/nginx-rehearsal.js` exercises actual Nginx, verified local TLS,
spoof overwrite, backend denial, customer native forms/cookies/deletion and the
genuine cross-role order/refund/reporting journey with disposable data.
`.github/workflows/proxy-verification.yml` runs that Ubuntu rehearsal.
Actual Ubuntu Nginx CI [40146790846](https://github.com/perin1k/Luigis-Project/actions/runs/40146790846)
passed. The existing-VM cutover, same-release direct recovery/forward reactivation,
backend restart, actual Certbot renewal rehearsal and private human Owner sign-in
also passed. October 25 final checks confirmed private root proxy files, matching
proof, loopback-only backend, empty Node capabilities, active/enabled services and
1,826 status-only proxy messages without request details. A bounded service-journal
scan found no current proxy proof, MFA encryption key or TLS private-key content;
this is not an exhaustive security/compliance certification. The redundant private
Certbot rehearsal output was removed; canonical certificate logs remain subject
to the existing retention policy. See [OPS-08 execution evidence](verification/ops-08-proxy.md).
Existing visual/manual/final product QA gates stay open.
