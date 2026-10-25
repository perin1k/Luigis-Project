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

Proof rotation requires coordinated reviewed configuration/runtime replacement.
VM stop retains disks, keys and costs. Existing hosting/support/data-loss boundaries
remain; a reverse proxy alone does not establish commercial readiness.

## Verification status

Focused local boundary/auth/customer/release/TLS checks passed (40 tests).
`tests/operations/nginx-rehearsal.js` exercises actual Nginx, verified local TLS,
spoof overwrite, backend denial, customer native forms/cookies/deletion and the
genuine cross-role order/refund/reporting journey with disposable data.
`.github/workflows/proxy-verification.yml` runs that Ubuntu rehearsal.
Actual native Nginx and hosted cutover outcomes remain pending. Prepared code is
not a deployment pass. Existing visual/manual/final product QA gates stay open.
