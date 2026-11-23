# LansetSpBot reuse audit for Jetson Messenger

**Status:** [ВЫВОД] repository inspection; [ПРЕДЛОЖЕНИЕ] reuse candidates  
**Reviewed:** 2026-11-23  
**Source repository:** https://github.com/Elusivedamir/LansetSpBot_Windows  
**Source ref:** `main` at `ef0d5041b0c51f33fdbf58ba64c7e493fe9ed828`  
**Scope:** static repository/document/workflow review and selected source-file inspection. This is not a complete security audit or a runtime reproduction of LansetSpBot.

## 1. Executive conclusion

LansetSpBot contains valuable engineering patterns for Jetson, especially for **Jetson Business campaigns, durable background jobs, message-delivery accounting, failure recovery, diagnostics, privacy-safe observability and release engineering**.

The most reusable assets are design patterns and state/transaction contracts—not the Telegram integration or Windows GUI. LansetSpBot is a Windows/Python desktop application built around Telegram/Telethon, local SQLCipher storage, DPAPI/local security and PySide6. Jetson is a cross-platform messenger/product with a server-side authority and a different trust model. Directly transplanting Telegram or desktop-specific code would create architectural coupling and security risk.

No Jetson source code or product architecture was changed by this review.

## 2. Rights and dependency boundary

The source repository's `LICENSE` states that all rights are reserved by Elusivedamir and grants no use/copy/modify/distribute rights except under a separate written agreement. The repository owner and Jetson owner appear to be the same GitHub account. Therefore, owner-controlled source may be considered for reuse only after confirming that the relevant code and assets are in fact owned by the same rights holder and are not copied/derived from third-party code.

This does **not** grant rights to third-party dependencies, bundled assets, fonts, icons, SDKs or upstream code. Every dependency and asset must retain its own license/provenance review. Do not add LansetSpBot as a package or submodule and do not bulk-copy the repository.

## 3. High-value candidates

| Candidate | Source evidence | Jetson application | Recommendation |
|---|---|---|---|
| Separate campaign, task and delivery state | `core/campaign_state.py`, `ARCHITECTURE_STATE_CONTRACTS.md` | Campaign lifecycle, worker execution and each recipient/message delivery must be distinct records/states. | Reuse the state model concept; define Jetson-owned states and API contracts. |
| Explicit legal state transitions | `CampaignStatus`, `DeliveryStatus`, transition validator and terminal-state protection | Prevent impossible transitions such as completed → running, cancelled → queued, or delivered → pending. | High priority for Jetson Business job/campaign domain. |
| Unknown/uncertain send outcome | `DeliveryStatus.UNCERTAIN`, `services/telegram_request_policy.py` | A timeout after dispatch may mean the remote server accepted the message. Blind retry can duplicate user-visible messages or chargeable work. | High priority. Use provider idempotency/deduplication where available; otherwise surface uncertain state and reconcile before retry. |
| Atomic reserve + enqueue | `storage/atomic_workflow.py` | Reserve quota/recipient slot and create the durable job in one transaction, avoiding quota loss or orphan tasks. | Reimplement against Jetson's selected DB/queue after transaction contract and concurrency tests. |
| Atomic success ledger | `AtomicWorkflow.finalize_success` | Persist provider message ID, delivery success, campaign counters and quota consumption consistently. | Reuse the invariant, not the exact callback implementation until nested transaction behavior is proven. |
| Compare-and-set state updates | `AtomicWorkflow.compare_and_set_campaign` | Prevent two workers or a user cancellation from overwriting each other's job state. | High priority for concurrent jobs; require SQL row-count checks and race tests. |
| Centralized failure classification | `TelegramRequestPolicy` | Common classification for transient, deferred, terminal and uncertain failures across messaging/payment/AI integrations. | Rebuild as provider-neutral policy. Telegram-specific FloodWait values and exception-name matching must not be copied as universal rules. |
| Fail-closed startup phases | `core/startup_pipeline.py` | Ordered server startup: configuration/secrets → DB connectivity/migrations → queues → providers → readiness. | Reuse the phase/report concept; make readiness false when a mandatory phase fails. |
| Secret-free observability | `core/rpc_audit.py`, `services/observability.py` | Metrics by operation/provider/status/tenant with no message bodies, credentials or unnecessary personal data. | Reuse with stricter Jetson data minimization and tenant-safe aggregation. |
| Redaction and bounded logs | `core/redaction.py`, `core/logging_setup.py` | Avoid leaking tokens, private messages and PII; cap log size and record length. | Reuse principles; server logs need central retention, access control and audit policy. |
| Encrypted local secret store and filesystem hardening | `core/secret_store.py`, `core/local_security.py`, `core/crypto_vault.py` | Useful as a reference for local client credential protection and threat modelling. | Do not transplant Windows DPAPI/SQLCipher implementation to backend. Design per-platform secure storage (Android Keystore, iOS Keychain, desktop OS vault) and server secret manager. |
| Safe profile migration | `core/profile_migration.py`, `storage/migrations/` | Upgrade client-local data and backend schema without silent merging, partial writes or irreversible loss. | Reuse fail-closed migration principles, with backup/restore and compatibility tests. |
| Dependency/release proof | `.github/workflows/windows-full-test-matrix.yml`, `windows-release-proof.yml`, `windows-release-sign-attest.yml`, `build/generate_sbom.py` | Pinned actions, least-privilege CI, exact-commit evidence, lockfile verification, SBOM, artifact integrity and release provenance. | Adopt selected workflow patterns after adapting to Jetson platforms and reviewing each action/tool. |
| Safe diagnostic bundle | `3_COLLECT_DIAGNOSTICS.cmd` and README | Give support enough environment/build/error data without collecting databases, sessions or secrets. | Strong candidate for a Jetson client diagnostics export with preview/redaction and explicit user consent. |

## 4. Important design lessons

### 4.1 Delivery is not the same as a queued task
LansetSpBot explicitly distinguishes business campaign state, technical task state and one concrete delivery attempt. Jetson should preserve the same separation. A task can finish while the recipient delivery remains failed or uncertain; a campaign may be paused while individual deliveries remain in progress.

### 4.2 A timeout is not proof of failure
For mutating remote operations, a connection loss after dispatch may leave the remote outcome unknown. Retrying blindly can create duplicate messages, duplicate campaigns, or repeated payment operations. Jetson needs idempotency keys, provider receipts and reconciliation paths. Where the provider cannot support safe deduplication, the correct state may be `uncertain`, not automatic retry.

### 4.3 Persist business state and technical queue state atomically
Campaign reservation, quota, queue insertion, provider receipt, delivery status and counters must not drift apart. Use transactions and compare-and-set updates. For external calls, use an outbox/inbox or equivalent durable reconciliation pattern rather than pretending a database transaction can atomically include a remote provider.

### 4.4 Make provider-specific policy an adapter
LansetSpBot's Telegram request classifier is a useful pattern, but Jetson must not hard-code Telegram's exception names or FloodWait semantics into its domain layer. Provider adapters should normalize errors into a documented internal contract, with provider-specific retry-after, idempotency and receipt capabilities.

### 4.5 Separate an architecture scaffold from production integration
LansetSpBot itself labels the five architecture modules as experimental and says they are excluded from release-readiness claims until connected to real caller paths and integration-tested. This is an excellent standard to preserve in Jetson: a tested helper or architecture characterization test is not proof that the production path uses it.

## 5. Source-repository quality and current warnings

### 5.1 Dependency audit is currently red
The latest scheduled Dependency Audit run inspected during this review is [run 45195598468](https://github.com/Elusivedamir/LansetSpBot_Windows/actions/runs/45195598468), on source commit `ef0d5041b0c51f33fdbf58ba64c7e493fe9ed828`. The workflow's audit step completed, but the fail-closed policy rejected the report with seven known vulnerability findings across three packages:
- `pyasn1==0.6.4`: CVE-2026-119196, CVE-2026-119195, CVE-2026-119194, CVE-2026-119197;
- `certifi==2026.7.22`: PYSEC-2026-4320 (reported twice);
- `setuptools==83.0.0`: GHSA-xmj3-9gf7-h52w.

This is a release/security warning for the source project, not proof that the same packages are used by Jetson. Do not import its dependency lockfiles into Jetson. Resolve/triage these findings in LansetSpBot before relying on its current release proof as a green security baseline.

The audit log also warns that `--require-hashes` with the OSV service checks hash presence, not hash validity, and that `--no-deps` is redundant with `--require-hashes`. Review the audit workflow's output handling and evidence generation as a separate improvement.

### 5.2 Experimental architecture modules are not production proof
`ARCHITECTURE_FOUNDATIONS_STATUS.md` explicitly marks the state contracts, atomic workflow, Telegram request policy, application facade, startup pipeline and RPC audit as experimental because they are not yet wired into production caller paths and integration tests. These ideas are useful, but they must not be represented as proven runtime behavior.

### 5.3 Test inventory is broad, but do not infer current green status
The repository contains a substantial test suite covering account isolation, migrations, concurrency, uncertain delivery, security, performance, observability and Windows release behavior. The presence of tests is not evidence that they all pass on the current commit. During this review, the latest scheduled dependency audit is red; a current successful full Windows CI/release proof was not established.

### 5.4 Licensing
The repository's custom LICENSE is not an open-source license. Since this appears to be the same owner's repository, internal reuse may be possible if rights ownership is confirmed; still review each third-party dependency and asset separately. If Jetson is later distributed to customers, preserve provenance and any applicable third-party notices.

## 6. What should not be transplanted

- PySide6 GUI panels and Windows-specific UI/runtime code.
- Telethon session handling, Telegram RPCs, Telegram-specific rate limits, channel membership and account warm-up behavior.
- Windows DPAPI and Windows filesystem ACL code as a backend security mechanism.
- SQLCipher/local profile layout as Jetson's server database architecture.
- LansetSpBot's account IDs or local account isolation model as Jetson's user/tenant model.
- Any dependency or workflow action without independent version, license, vulnerability and provenance review.
- Experimental modules as if they were production-integrated.

## 7. Recommended Jetson adoption order

1. **P0 domain design:** define campaign/job/delivery entities and legal state transitions; explicitly represent `uncertain` remote outcomes.
2. **P0 correctness:** define idempotency, durable receipts, atomic quota reservation, compare-and-set updates, cancellation and reconciliation.
3. **P0 security:** define tenant-scoped authorization, secret-free logs, redaction, safe diagnostics and provider credential boundaries.
4. **P1 reliability:** define queue leases, retry/defer policy, dead-letter handling, startup/readiness phases and recovery.
5. **P1 release engineering:** adapt pinned-action CI, least privilege, lock verification, dependency audit, SBOM, artifact hash/provenance and reproducible release evidence.
6. **P1 migrations/support:** schema compatibility, fail-closed migrations, restore tests and privacy-safe diagnostic exports.

These are recommendations for Jetson's architecture and implementation planning, not approval to bypass the canonical 16-point MASTER PROMPT or change the product roadmap. Before implementation, map each adopted requirement to the canonical prompt, decision log, architecture record, test and evidence.

## 8. Review limitations

- Static review of repository metadata, selected architecture/security docs, selected source files and workflow configuration.
- Current source ref reviewed: `main` at `ef0d5041b0c51f33fdbf58ba64c7e493fe9ed828`.
- The repository was not cloned or executed in this review environment.
- No complete manual audit of every Python module, dependency, migration, test or release artifact was performed.
- No code was copied into Jetson and no LansetSpBot files were modified.
