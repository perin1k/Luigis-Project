# OPS-01 reproducible runtime and rollback

October 23, 2026. Brody approved repository configuration/tooling and a disposable
Ubuntu CI rehearsal. Card: https://trello.com/c/85TFaR41. No cloud provisioning,
spending, DNS/IAM change, public certificate or hosted account is authorized here.
Prior reverted Perin preparation is not restored as accepted work; John/QA work
is preserved. The current implementation follows the retained TECH-01 decisions.

Implementation and file guide: [deploy/README](../../deploy/README.md). The unit
requires the actual mount/existing DB, unprivileged single-process direct TLS,
private config and read-only release/runtime preflight. Release manifests preserve
exact migration checksums; rollback never rewrites SQL or replaces retained data.
Initial release tests failed with the missing module before implementation, then
passed locally together with runtime rejection tests on Windows x64/Node 24.22.1.
The CI runtime is pinned to Node 24.14.1/npm 11.11.0. Native evidence follows.

## Native acceptance

Final [run 40056151563](https://github.com/perin1k/Luigis-Project/actions/runs/40056151563)
tested `abebb7bd18990b0fd383b780f8a0143352cff22c`. Windows Server 2022 x64,
macOS 15.7.9 arm64 and Ubuntu 24.04.5 x64 each passed the four focused portable
checks, with zero failures/skips. Ubuntu additionally ran the real systemd unit
and independent `npm ci --omit=dev --ignore-scripts` production installation.
No inherited development modules were used by the staged application.

Ubuntu stages passed:

- Unit verification, private generated environment/TLS/payment configuration,
  actual separate temporary mount and existing SQLite database.
- Direct HTTPS443 as the unprivileged identity; `/proc` confirms the sole effective
  capability is CAP_NET_BIND_SERVICE. Real readiness and private sign-in respond;
  test-control routes are absent from the production server.
- Killing only the verified disposable service causes systemd to restart a new
  process that becomes ready. Graceful stop/start and stopped compatible-release
  switching/rollback work without replacing the retained database.
- Synthetic release B changes a CSS source comment: a restart serves new prepared
  text; rollback restores the earlier response. This does not invalidate browser
  caches, which retain the documented one-hour compatibility window.
- A clearly isolated synthetic additive migration 16 makes the old release
  incompatible. Both its read-only rollback gate and its service preflight refuse
  startup. A forward-compatible release starts, preserving the retained edited
  price and all migration history. No real applied migration was edited.
- With the separate mount removed, startup is refused even with a boot-disk decoy
  database present; the decoy remains byte-identical. No silent fresh DB is created.

Initial runs 40055602507 and 40055731315 failed before application execution:
`systemctl reset-failed luigis.service` rejected a newly installed/unloaded unit.
The bounded diagnostic showed no ExecStartPre process had started. The rehearsal
now accepts only that specific absent-failure-state condition and still requires
normal service startup. Follow-up 40055886004 passed lifecycle/release/schema/mount
checks; 40056090569 additionally passed supervised crash restart. The final full
run above includes those checks and the secret-safe failure assertion. Historical
failures are not rewritten as passes. No service protection/assertion was removed.

The manual workflow now offers all native unit targets or an Ubuntu-only follow-up;
the temporary push registration trigger is removed. No trace, environment, private
key, screenshot or database artifact is uploaded. Retained internal logs contain
only bounded diagnostics; the redaction assertion reports a boolean if it fails.
Subsequent acceptance-document changes do not alter executable bytes.

## Criteria map

| Criterion | Evidence / boundary |
| --- | --- |
| Hosting/runtime/database/region selection | Retained approved TECH-01: Ubuntu24.04 amd64, us-central1-a e2-small Spot STOP, SQLite/private persistent data disk; exact GCP image resolved under OPS-02 |
| Install/start/environment/probes/lifecycle | PASS: locked production-only install, explicit Node executable, runtime preflight, real probes, stop/start and supervised crash restart |
| Versioned configuration and migration/seed | Unit/config example, manifest/schema checks and existing migration/seed/bootstrap CLIs; no applied migration edited |
| Data outside ephemeral releases | PASS: required separate mount/existing database, keys outside release/data and absent-mount/boot-decoy refusal |
| Release plus schema rollback | PASS: read-only exact compatibility gate, stopped atomic pointer changes, compatible rollback and additive-schema refusal/forward recovery |
| Text cache/restart/asset policy | Startup-compressed assets require restart; one-hour browser text cache documented without a false global invalidation promise |

Actual private host identity/key injection, disk UUID, public trusted HTTPS,
operator ownership/recovery and GCP target verification remain OPS-03/02 and QA.
CI fixture secrets and a temporary mount do not fulfill those hosted criteria.
Those are the existing OPS-03/02 scopes, not criteria moved out of OPS-01 to close
it. OPS-01's reproducible configuration/install/lifecycle/rollback/cache criteria
are accepted under the approved plan and may move Done. The dependency contract
is exercised with disposable identities/keys; actual host custody and installation
remain unperformed. Exact GCP image selection, storage UUID, trusted public TLS,
budget/provisioning and hosted QA acceptance are not claimed.

Content/runtime contract, focused final diff and local-document links reviewed.
Unchanged application browser/visual/manual/Lighthouse evidence remains valid from
the accepted pre-OPS checkpoint; this increment changes deployment tooling only,
so unrelated UI suites were not repeated. No general security/WCAG or production
availability certification follows from these bounded tests.
