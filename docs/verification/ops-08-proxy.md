# OPS-08 execution and acceptance record

## October 25 completion

The remaining bounded hosted checks passed: root proxy directory 0700/private
files with no group/other access, matching runtime/Nginx proof, backend bound only
to 127.0.0.1:3443, and real public readiness 200. Node still runs as luigis with
NoNewPrivileges=yes, ProtectSystem=strict and empty capability sets. Both luigis
and nginx are active and enabled. The original deployed source remains
`a87b662fa7ac473eb7f0b455a6aad9d716c64090`; later tooling/docs commits do not change it.

Actual Nginx telemetry was located by `_COMM=nginx`, not SYSLOG_IDENTIFIER: this
host retains hostname/tag in MESSAGE. All 1,826 inspected proxy messages matched
the status/timing-only format, with no visitor address, URL, headers or body. A
bounded October 24 onward luigis/nginx service-journal scan found no current proxy
proof, MFA encryption key or TLS private-key content. These scoped observations
are not an exhaustive security guarantee. No telemetry configuration change was
needed. One diagnostic JSON query exceeded its default output buffer; the final
bounded text query completed and emitted sanitized booleans/counts only.

The task-created root-private duplicate Certbot dry-run log was removed after
checking its exact resolved path, file type/owner and link count. Existing
canonical Certbot logging and seven-day pruning remain. The operator/deployment,
maintenance/custody and developer handoff references now describe the current
architecture and route everyday users to the plain-language guides.

Together with the executed cutover/recovery/renewal, actual CI and private Owner
confirmation below, this satisfies OPS-08's scoped acceptance. Customer-account
visual/manual acceptance, remaining usability/readability work and final product
QA/TEST-04 remain separate and are not claimed passed by this operations record.

Separately, Brody approved permanent removal of the earlier disposable refunded
test order; the [one-time cleanup record](disposable-order-cleanup.md) supersedes
the earlier cancellation-only checkpoint for that order. It is not general
permission to delete history or reset the database.

## Historical October 24 pause checkpoint

October 24, 2026, America/Chicago. The approved existing-VM Nginx cutover and
customer-account deployment are live. This is a resumable checkpoint, not final
product acceptance or full OPS-08 completion.

## Published and deployed

- Readability-only customer batch: `38ee2d4`; four JS files had unchanged normalized
  parsed structure, syntax/diff checks passed. Whole-project readability remains open.
- Proxy implementation: `d52bdbc`; corrected disposable fixture probe and safe
  retained-state inspector: `a87b662fa7ac473eb7f0b455a6aad9d716c64090`.
- Actual source pointer:
  `/opt/luigis/releases/a87b662fa7ac473eb7f0b455a6aad9d716c64090-node-24.22.1`.
  Canonical source SHA-256:
  `5fdbd08258437d8f7a1dba176ed7de49b647e6c0f0c82a49d3ef3f09463d3fb8`.
- Existing patched Node 24.22.1/npm 11.19.1 retained. Ubuntu Nginx/nginx-common
  `1.24.0-2ubuntu7.18` installed while masked; no default HTTP site was started.
- Public 443 is Nginx. Node listens only on `127.0.0.1:3443`, with no bind
  capability; luigis remains unprivileged with strict service protections.
  Both services were observed active/enabled. Same hostname/free Certbot account.

## Verified execution

- Forty focused boundary/auth/customer/release/TLS checks passed locally. Actual
  Ubuntu Nginx rehearsal passed in
  [40146790846](https://github.com/perin1k/Luigis-Project/actions/runs/40146790846).
  Initial rehearsal `40146409561` incorrectly probed the fixture's unavailable
  production-health workers; corrected to its actual account route, without
  changing production health checks or weakening assertions.
- Original prepare helper's ready check correctly refused the pending schema.
  Explicit read-only forward check found exactly one pending migration. The
  authorized migration 016 then applied; new direct HTTPS release became healthy
  before proxy activation. No seed, DB reset or old SQL/checksum edit occurred.
- Before/after migration comparison: same DB identity, integrity/FK checks pass,
  original 15 migration checksums and all inspected staff/credential/ownership/
  MFA/recovery digests unchanged. Total migrations now 16.
- Private proxy setup and service-user runtime preflight passed. An initial
  absolute-symlink CLI invocation did not stage files; invoking from the release
  working directory correctly staged them before activation. No files were patched
  inside the immutable release.
- Actual same-release direct HTTPS recovery, forward reactivation and backend
  restart passed. Short startup refusal/502 retries resolved to readiness 200.
  Do not roll back to old source unaware of migration 016.
- Certificate hook installed at `/etc/letsencrypt/renewal-hooks/deploy/luigis-tls`.
  `certbot renew --dry-run --run-deploy-hooks` returned success, including the
  Node TLS update and active Nginx reload. Raw duplicate rehearsal output remains
  root-private at `/var/log/letsencrypt/luigis-proxy-dry-run.log`; review/clean up
  this task-created duplicate under the existing log policy on resume.
- Actual public home/order/account/ready/preview probes 200; private staff page
  redirects and API 401; sampled env/DB/fixture paths 404. Caller forwarding/proof
  spoof was overwritten; external backend port unreachable. One-day HSTS present.
- Hosted synthetic customer check `4f3c0e578e7b` passed registration, secure strict
  HTTP-only cookie, profile-to-checkout prefill and password-confirmed deletion.
  No order/payment was submitted by that check.
- Brody confirmed actual Owner sign-in and customer entry both work through Nginx.
  Subsequent state comparison preserved staff/credentials/ownership/recovery/schema/
  DB identity/integrity; MFA full-row digest changed during human sign-in. Existing
  source updates verification counter/timestamp and SQL forbids active payload
  replacement. Do not claim every MFA row stayed byte-identical across sign-in.
- Separately requested test-order cleanup: human Owner cancelled it and completed
  the full demo refund. Read-only verification found exactly one successful refund.
  Protected records remain; no hard deletion or duplicate refund occurred. No
  personal details or private tracking paths are recorded here.

## Tasks pending at the pause (status updated above)

1. Finish bounded private proxy/runtime-file permission and journal/proof leakage
   review; emit sanitized results only. Never print runtime.env or nginx config,
   run `nginx -T`, collect Owner credentials or bypass history guards.
2. Recheck public readiness/service state and finalize OPS-08 evidence/Trello only
   when its remaining criteria pass. Keep product QA/visual/manual gaps separate.
3. Reconcile current architecture references in deployment/maintenance/custody
   guides. Nginx operator guide: [nginx-proxy.md](../nginx-proxy.md).
4. Resume remaining approved whole-project comments/formatting in behavior-preserving
   batches, then end-user ordering/menu/branding cleanup. Logo direction approved:
   hand-drawn brick oven/pizza-peel with full Luigi's Pizza name, brick/cream/deep red.
5. Track the refund feedback issue: approval warnings appear far above the action;
   refresh clears the checkbox. Improve inline feedback/focus with a reproducing test
   in the already approved cleanup; do not weaken approval/idempotency protections.
6. Customer account card remains Ready for Testing: shared-navigation visual review,
   human/hosted feature acceptance and relevant final Lighthouse still pending.
   TEST-04 is last after other current-delivery cards are Done, including required
   desktop/mobile Lighthouse 100s and all required Playwright/other checks.

The public site remains up; this pause stops new agent work, not the hosted service.
Existing stop deadline November 1, 2026 at 11 PM Central and retained-disk/cost/data
limits remain. No additional VM, live money or external customer notification.
