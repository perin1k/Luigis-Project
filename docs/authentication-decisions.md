# TECH-04 authentication decisions — consolidated October 22, 2026

Card: https://trello.com/c/h0TJEAWE. **Decision scope resolved.** Implementation,
operator setup and acceptance remain on [BE-08](https://trello.com/c/JWv5cz7J) and
[FE-08](https://trello.com/c/ZqKu1n46). This record grants no account access,
changes no role and does not certify completed rollout.

Current implementation follow-up: [three-tier staff role policy](staff-role-policy.md).
October 27 presentation follow-up: MFA-protected Admins may also read sales
analytics; menu/prices/hours remain Owner-only. The decision table below preserves
the original October 22 checkpoint rather than revising its historical evidence.
The coordinated role services, additive migration and screens now exist; the table
records the decision checkpoint below. Current BE-08/FE-08 verification and operator
acceptance remain separate from this decision card's completion.

## Approved decisions and implementation boundaries

| Area | Settled decision | Evidence / delivery boundary |
| --- | --- | --- |
| Identity model | Individual local usernames/passwords; guests do not need accounts. No live external identity provider is a prerequisite | Existing auth design/services; no shared/default staff password |
| Role hierarchy | **Owner > Admin > Employee** | Latest human-approved three-tier policy recorded on TECH-04 October 22; coordinated implementation is underway in another team task |
| Owner authority | Owner-only Employee/Admin role assignment and admin-account management; owner-only menu/prices/hours/analytics | This supersedes the earlier two-tier admin policy for the approved target behavior; it is not claimed implemented by current two-role permissions |
| Admin authority | Admins create/manage employees only; Owner/Admin retain operational cancellation/refund/review authority | No Admin-to-Owner assignment or self-granted browser role; Employees retain approved preparation/availability responsibilities |
| Reactivation | Approved within the controlled hierarchy | Implement with current revision checks, auditing and session/proof invalidation; not an unprotected database toggle |
| Privileged MFA | Authenticator-app TOTP required for both Owner and Admin | Existing admin TOTP foundation uses pinned OTPAuth 9.5.2; owner integration/restricted first enrollment for privileged promotion/invitations belongs to the coordinated implementation |
| Credential storage/policy | Salted versioned scrypt hashes, never recoverable password encryption; existing strong-password and integrity-pinned blocklist policy retained | Existing implementation requires at least 15 Unicode code points, at most 1024 UTF-8 bytes, and rejects common/predictable passwords without silently changing their stored bytes |
| MFA secrets | Separately configured authenticated encryption, restricted enrollment/proof and replay protection; no browser persistence or external QR service | Private configured MFA key; no fallback key, unattended bypass or assertion that JavaScript memory is securely erased |
| Session lifetime | 30 minutes idle and eight hours absolute; activity cannot extend absolute expiry | Existing session service; disable/recovery/role transitions revoke or invalidate prior access and proofs |
| HTTP transport | Pinned direct HTTPS origin; secure HttpOnly SameSite=Strict host cookies; CSRF/origin/fetch-site validation | Existing router/transport design. Do not weaken cookie policy to make a browser assertion pass; the reported Windows WebKit observation remains implementation verification work |
| Throttling/concurrency | Existing account/source budgets, bounded hash work, generic denials and post-async revision/identity rechecks | Trusted socket source, not submitted/forwarded claims; no new provider or rate-limit bypass selected |
| Bootstrap/first owner | Private interactive bootstrap and explicit owner designation; additive owner model must not automatically promote existing admins | No real account created here. Operator invocation, migration/service/UI implementation and verification stay with the approved coordinated BE-08/FE-08 plan |
| Recovery ownership | Brody Mensonides oversees recognized-team-member in-person recovery when password/codes are unavailable | Existing private recovery command; no public identity questions, document uploads or employee override |
| Recovery proof | Existing ten random single-use privileged recovery codes, digest storage, current-password proof, replacement authenticator confirmation and revoked prior access | Extend the approved privileged-tier policy consistently in the coordinated implementation. Recovery issues no automatic login session; key/database loss has no credential bypass |
| Extra owners/transfer | No additional-owner or owner-transfer feature requested/authorized | Not a missing provider decision and not permission to add a new owner-management flow |

The three-tier implementation note explicitly records approved revision-protected
role/state changes, session/proof revocation, reactivation and restricted privileged
enrollment. This document preserves those approved choices; it does not replace
that implementation with a competing service, migration or account procedure.

## Current-code versus approved-target distinction

Repository checkpoint reviewed for this decision consolidation: `8c936d9`.
`src/auth/permissions.js` at that checkpoint recognizes Employee/Admin, and the
current menu service uses the earlier admin permission boundary. The latest
three-tier role implementation is reported **in progress** on TECH-04 and has not
been claimed as this chat's work or as published/accepted from this checkpoint.
Do not treat Owner-only permissions as already enforced until the coordinated
implementation and its evidence are actually present. Hosting remains on hold.

Existing foundations and their detailed parameters are documented in
[authentication design and historical implementation milestones](authentication-design.md),
with source in `src/auth/`. The local password/session/MFA, sign-in, HTTPS, private
bootstrap, invitations, maintenance and recovery foundations are implemented;
source/design inspection here is not a fresh rerun of their reported checks.
The existing password blocklist and applied SQL were not rewritten.

## Why the decision card can close

The former open decision topics—local versus provider identity, password policy,
TOTP library/secret handling, throttling/session issuance, cookies/CSRF, bootstrap,
recovery ownership/proof, additional privileged-account authority and
reactivation—now have approved choices and assigned implementation boundaries.
No design choice is reopened simply because verification or operator setup remains.

This is a decision-card completion, not moving unfinished implementation elsewhere:
BE-08/FE-08 already own that work. They remain subject to the actual approved role
matrix and all retained acceptance gates. Firefox startup, Windows/Linux execution,
WebKit cookie-policy investigation, visual/manual accessibility and hosted/operator
verification are not waived or declared passing here. Any new owner-transfer,
identity-provider, multi-process or security-policy scope needs its own review.

## Verification of this record

Reviewed the live card's latest human-approved policy and concurrent-work note,
current Git history, authentication design, password/MFA/login/session/permission
source and pinned package metadata. Checked local links, content consistency and
diff/whitespace. No runtime, dependency, UI, migration, secret, account or cloud
configuration changed. Executable/browser/Lighthouse tests are inapplicable to
this documentation-only decision record; no new test passes are invented.
