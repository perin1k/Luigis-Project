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
The CI runtime is pinned to Node 24.14.1/npm 11.11.0. Native evidence is pending.

## Criteria map

| Criterion | Evidence / boundary |
| --- | --- |
| Hosting/runtime/database/region selection | Retained approved TECH-01: Ubuntu24.04 amd64, us-central1-a e2-small Spot STOP, SQLite/private persistent data disk; exact GCP image resolved under OPS-02 |
| Install/start/environment/probes/lifecycle | Locked production-only install, explicit Node executable, runtime preflight, real health endpoints and bounded systemd lifecycle; focused native rehearsal pending |
| Versioned configuration and migration/seed | Unit/config example, manifest/schema checks and existing migration/seed/bootstrap CLIs; no applied migration edited |
| Data outside ephemeral releases | Required separate data mount/existing database; keys outside release/data; missing-mount rehearsal pending |
| Release plus schema rollback | Read-only exact compatibility gate, stopped atomic pointer changes, compatible rollback/additive-schema refusal rehearsal pending |
| Text cache/restart/asset policy | Startup-compressed assets require restart; one-hour browser text cache documented without a false global invalidation promise |

Actual private host identity/key injection, disk UUID, public trusted HTTPS,
operator ownership/recovery and GCP target verification remain OPS-03/02 and QA.
CI fixture secrets and a temporary mount do not fulfill those hosted criteria.
Keep the card incomplete until applicable evidence and dependencies are reconciled.
