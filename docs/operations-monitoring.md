# OPS-04 local probes, redacted worker events and incident handoff

QA-03's [approved workload/restart targets and measurement procedure](verification/qa-03-concurrency-recovery.md)
include a ten-minute operator restart target only when VM, disk and keys are
intact. This is not a measured result, uptime SLA or authorization to activate
hosting/alerts; the existing monitor notification thresholds remain separate.

Original preparation: October 22, 2026. Card: https://trello.com/c/k5lYEttU.
On October 24 Brody approved completing hosted monitoring, operational email
notifications, bounded retention and a controlled failure/recovery drill. This
supersedes the earlier instructions-only hold for this reviewed scope. Acceptance
is recorded separately; configured resources alone do not close the card.

## Implemented files and contracts

- `src/operations/health-router.js`: GET/HEAD `/health/live` returns 200 with only
  `{"strStatus":"alive"}`. It proves the process can answer, not business readiness.
  GET/HEAD `/health/ready` returns 200/`ready` only when the server-owned synchronous
  dependency check returns true; false, missing configuration or an exception
  returns 503/`not_ready`. No path, key, stack, count, identity or diagnostic reason
  is returned. Responses are no-store/noindex/no-referrer; POST is not a probe.
- `src/server.js`: readiness requires configured authentication, payment vault,
  a readable current catalog and healthy retention/preview monitors. A view-only
  or database-only public HTTP runtime is deliberately not ready for full delivery.
  This is not a DB write/integrity check, full transaction rehearsal, timer-freshness
  guarantee or provider-health check. Startup configuration failures still fail
  safely before a useful server is exposed.
- `src/operations/worker-monitor.js`: wraps only the synchronous retention and
  internal-preview workers. Failure/recovery updates health and emits one JSON
  event per transition, not one event per failed retry. Allowed worker names are
  fixed. Events contain only `strEventId` (random UUID), `dtOccurredAt` (UTC),
  `strEvent` and `strLevel`. Exception messages, request bodies, contacts, session/
  guest tokens and key material are never serialized. The event ID identifies
  this operational event, not an implemented request-wide trace. Existing order/
  payment audit/event histories remain their separate sanitized evidence.
- `src/operations/telemetry.js` uses a fixed event vocabulary and opaque server
  request IDs. Order/payment responses log only family, HTTP outcome/status, time
  and ID, which matches `X-Request-Id`; supplied IDs, URLs, bodies and exceptions
  are ignored. A request success event reports an HTTP outcome, not a live charge.
  Unexpected page errors use the same safe recorder. Late errors after headers
  are sent close the connection rather than delegate raw exception logging.
- `src/app.js` mounts probes after shared security headers and anonymous limits.
  `src/security/anonymous-limits.js` adds a separate 120-probe/minute socket-peer
  budget shared by live/ready, including case variants. Forwarded addresses do
  not bypass it. A throttled probe returns 429/Retry-After, distinct from dependency
  failure. NAT/proxy/process-reset limitations still apply; hosting remains direct
  TLS with one process. Do not interpret a 429 as proof of a database outage.

No dependency, schema, template, style or browser-script change. Throttled requests
are rejected before request telemetry, avoiding one log line per blocked retry.
Node still uses fixed safe startup messages; no provider/webhook logger or real
provider is invented. This is not distributed tracing or audit/request ID linkage.

## Verified local evidence

- Monitor test: injected worker failure emits one fixed error, repeated failure
  emits no duplicate event, recovery emits one event and restores healthy state;
  normal success emits nothing. IDs are distinct, sensitive exception text absent,
  and unknown/async worker factories are rejected.
- HTTP probe test: missing/healthy/throwing/recovered dependency transitions,
  minimal bodies, private headers, liveness independence, HEAD and method behavior.
- Anonymous-limit test: 120 live/ready requests share an independent budget;
  uppercase paths do not bypass it and checkout retains its own budget.
- Actual child-server fixture: a database-only runtime performs existing cleanup/
  previews, returns live 200 and ready 503, and exposes no staff notification API.
- Request telemetry test: a failed and successful order request share their
  server-generated header/log IDs; a page failure is safely recorded; spoofed
  IDs, private request/query content and exception text never appear in events.
- Existing retention tests separately exercise real audit failure rollback and
  retry. The new injected-monitor drill is not a hosted database-outage exercise.

Run `npm run test:unit`. Final suite: **253 pass**, zero failures/skips. Syntax,
diff/whitespace and private-field review also passed. The probe is JSON and has
no visual UI; no HTML visual or
Lighthouse result is fabricated for it. Existing browser/manual/cross-platform
acceptance remains required and explicitly retained by the human.

## Incident procedures for the authorized operator

These are instructions to prepare, not actions taken or new standing permission.
Use the eventual approved service unit and access mechanism from the
[deployment runbook](deployment-runbook.md). Never paste raw logs, credentials or
private SQLite rows into Trello. Record only safe event IDs, times and observed
status. Preserve original payment/request identifiers through recovery.

### Application unreachable or readiness failing

1. Separate DNS resolution, valid TLS, VM status, live probe and ready probe. An
   alive-but-not-ready result differs from a stopped/preempted VM or invalid cert.
2. Inspect redacted service status/events through approved operator access. Check
   the data mount, configuration/certificate/key readability and worker transition
   events. Do not expose files or print environment variables to diagnose them.
3. If Spot stopped, the sponsor follows the approved capacity-dependent restart
   process. Verify DNS after any ephemeral-IP change. Do not auto-upgrade the VM
   or run multiple Node workers as a recovery shortcut.
4. Restore the validated configuration/mount, then perform controlled restart and
   dependency/role/checkout smoke checks. If readiness fails, keep publication on
   hold; a home page alone is not recovery evidence.

### Database failure or missing mount

Do not initialize a replacement database at the production path or run seed over
an unknown target. Stop application writes using approved incident authority,
verify the correct disk is mounted and key material preserved, and assess the
existing database with offline integrity/foreign-key/migration checks. Keep journals
and history with the database. If damage exists, prepare a reviewed forward repair
or separately authorized disposable-data recreation; do not promise backup recovery.
Retention read checks do not repair a damaged database.

### Failed release

Follow the runbook's schema-compatible rollback: stop the single service, retain
DB/keys, select a previously verified release compatible with applied migrations,
then restart and smoke-test. Never edit applied SQL, reset shared Git history or
restore stale contacts/payments to make an old release appear healthy. If schema
compatibility is unknown, hold service and review a forward fix.

### Suspected credential/key compromise

The operator verifies scope privately, restricts access under separately authorized
incident controls, and revokes affected sessions/identities through the reviewed
account mechanisms. Preserve sanitized audit evidence; notify designated humans
only through an authorized channel. Key replacement requires the existing version/
retention review: do not discard keys while retained MFA/payment ciphertext depends
on them. Do not log suspicious secret values or enable a recovery/MFA bypass.
Rehearse and approve the concrete response before hosted acceptance.

### Notification or payment backlog

Current notifications are internal previews, never external deliveries; a preview
worker failure makes readiness false until its next successful run. Inspect safe
state, resolve the cause and use existing admin retry without claiming a message
was sent. A healthy last run does not prove every historical failed preview was
resolved. The later approved preview-worker failure threshold below does not claim that
every aged individual preview has been resolved.

Payments are synchronous demonstration processing, not real webhooks. Review
persisted payment/order/refund state and original request IDs; never start a new
payment solely because the response was interrupted. Provider-event/webhook backlog
monitoring is future integration scope and cannot be tested as real delivery here.

## Approved monitoring decision — October 22, 2026

The human approved these thresholds for later hosted monitoring:

- Notify the project sponsor after three failed one-minute readiness checks.
- Notify the project sponsor after ten minutes of preview-worker failure.
- Escalate any confirmed-payment/order mismatch for immediate review.

These are operator response thresholds, not availability guarantees. Approval
records the policy only: no probe scheduler, external alert delivery, recipient
address or hosting resource is configured or authorized by this decision. Keep
individual preview backlog review distinct from sustained worker failure. A
payment mismatch requires review of committed records, not a replacement payment
or automatic financial action.

## Approved hosted implementation — October 24

- `scripts/configure-monitoring.js` and `deploy/monitoring.json` configure only
  project `capstone-510915`, host `luigispizzeria.duckdns.org`, two public HTTPS
  probes, an email channel to the active GCP operator, and their alert policies.
  OAuth credentials are captured only in process memory; no key is deployed to
  the VM. Existing conflicting named resources are rejected, not overwritten.
- `/health/previews` adds only ready/not_ready status for the actual internal
  preview worker. No contact, count, exception, path, token or preview content is
  exposed. Missing configuration/exception fails closed. Existing readiness still
  covers authentication, vault, catalog and both worker monitors.
- Checks run each minute in Oregon/Iowa/Virginia, require valid HTTPS and exact
  ready content/status200. Alert on at least two failed locations sustained for
  three minutes (readiness) or ten minutes (preview worker). These operational
  windows implement the agreed thresholds with ordinary sampling/evaluation lag;
  they are not an exact delivery-time guarantee. Healthy evaluations reset the
  condition; open and closed incidents notify the operator. There are no automatic
  payment actions, VM upgrades or data/key resets. If samples disappear entirely,
  that is not proof of recovery; investigate monitoring before trusting a closure.
- Brody receives alerts and may inspect/restart the approved app/Spot VM, verify
  mount/DNS/TLS, stop unsafe writes and restore a schema-compatible release under
  the runbooks. New infrastructure, destructive recovery, live payment actions
  and MFA master-key changes require their separate authorization.
- The dedicated preview VM's journald drop-in `deploy/journald-luigis.conf` sets
  seven-day retention, 64MiB persistent limit, 16MiB runtime limit, hourly rotation,
  compression and no console/syslog forwarding. Active-file allocation and vacuum
  timing mean these are journal-management limits, not byte/deletion-time SLAs.
  `prune-certbot-logs.sh`/the retention service and daily timer expire only rotated
  Certbot logs older than seven days in its verified root-private directory;
  cleanup is daily and excludes active log, accounts, certificates and keys.
  Install the journal drop-in as `zz-luigis-retention.conf` so Ubuntu's vendor
  `syslog.conf` cannot override the no-forwarding setting; verify effective order
  with `systemd-analyze cat-config systemd/journald.conf` after installation.
- Two checks x three regions x 31 days x 1440 = 267,840 scheduled monthly
  executions, below Google's one-million project free allowance if no other usage
  consumes it. The installer checks current project inventory conservatively.
  No cloud log agent/export, custom metric ingestion or attached VM service-account
  credential is added. Billable egress/other project costs remain under the existing
  reviewed budget, not a hard cap. Recheck pricing before extending the preview.

Provider webhook backlog is not invented: this demo has no active merchant webhook
integration. For an ambiguous demo payment, preserve its existing attempt/order
identifiers and use the result/reconciliation flow; consult committed payment and
order states before any retry/refund. Staff review/notification-preview queues
remain internal operational screens, not proof an external message was sent.
Any confirmed-payment/order mismatch is escalated immediately to Brody with safe
IDs/times only; preserve protected state and hold affected actions for review.

References: [uptime and alert pricing](https://cloud.google.com/products/observability/pricing),
[uptime check configuration](https://docs.cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.uptimeCheckConfigs),
[alert strategies](https://docs.cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.alertPolicies).

## Historical unresolved gates (superseded as verified below)

The actual alert contact/channel, failure/reset semantics and permitted incident
response actions still need configuration review before implementation. The
hosting hold remains in force. Hosted log capture must implement the approved
seven-day local rotation, access and cost limits. It is not installed by emitting
stderr JSON. No external log collector, alert provider, account or billable resource
is configured. Do not enable request/body logging or optional snapshots by default.

Actual Ubuntu host failure/recovery, DNS/cert/service/VM drills, log retention/cost
verification and cross-platform/manual acceptance require the retained environments
and later hosting authorization. Keep OPS-04 open for these genuine blockers and
remaining operational decisions. See the authoritative [hosting design](hosting-design.md).
