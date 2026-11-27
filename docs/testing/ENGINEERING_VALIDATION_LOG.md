# Engineering validation log

Last updated: 2026-11-27

This log records completed, reviewable engineering increments. It is evidence of test work, not approval of a production architecture.

## Merged increments

| PR | Merged into | Increment | Validation evidence |
|---|---|---|---|
| #14 | `research/architecture-synthesis-task` | Corrected architecture research synthesis; withdrew unsupported architecture scores; retained unknown empirical dimensions and business-plan stage order | Static document review only |
| #15 | `research/architecture-synthesis-task` | Implementation-neutral message reliability plan and message state-machine contract | Document/traceability review; runtime tests correctly marked not run |
| #16 | `engineering/message-reliability-test-plan` | In-memory message reference model and deterministic test oracle | 13 tests passed locally; re-run in consolidation CI #38 |
| #17 | `engineering/message-reference-model` | SQLite adapter experiment, crash recovery, leased outbox, retry release, stale-token rejection and per-recipient ordering | CI #30, #32 and #38: 17 SQLite adapter tests passed |

PRs #14–#18 are now merged. PRs #15–#17 were merged in dependency order into their stacked parent branches; PR #18 consolidated the model and adapter work into `research/architecture-synthesis-task`.

## Consolidation validation

GitHub Actions run #38 on the final PR #18 head compiled both test packages and passed:

- Reference model: 13 tests.
- SQLite adapter: 17 tests.
- Total: 30 tests, 0 failures, 0 errors.

The run used Python 3.12 on Ubuntu. See the [workflow run](https://github.com/Elusivedamir/jet/actions/runs/45332978091).

## What this proves — and what it does not

It demonstrates that the written message contract has an executable in-memory oracle and that one local SQLite adapter experiment passes the listed deterministic transaction, restart, concurrency, lease, retry and ordering tests.

It does **not** prove production message delivery, exactly-once network delivery, device receipt/read, host or power-loss durability, multi-process service behavior, replication, backup/restore, E2EE, security posture, throughput, availability or operating cost. SQLite is not selected as Jetson's production database. No messaging server has been implemented by these experiments.

## Product and repository guardrails

- The canonical business-plan PDF remains authoritative and was not edited.
- No product stage, pricing, feature promise, E2EE scope or SLO is approved by these experiments.
- The original `main` branch has not been changed by this engineering sequence.
- The work is now consolidated on `research/architecture-synthesis-task`; integration into `project/greenfield-reset` remains a separate, narrow PR.

## Next engineering increment

Specify and test the outbox dispatch boundary with a fake external transport: retry schedule/backoff, bounded attempts and dead-letter handling, receiver-side idempotency/deduplication, and the crash window where a transport side effect succeeds but the worker crashes before recording acknowledgement. Do not describe this as exactly-once delivery; prove the duplicate-handling contract and state its limits.


## 2026-11-27 — Architecture research PR and workflow trigger audit

- PR #13 latest head at the start of this check had no associated pull-request workflow runs; combined commit status was empty. This is recorded as **not run**, not as a pass.
- The reliability workflow's `pull_request.branches` filter listed `research/architecture-synthesis-task` but omitted its actual PR target, `research/repository-landscape`. Added the actual target branch to the filter so future PRs targeting the research baseline can trigger the workflow once the workflow definition is present in that base branch.
- This workflow correction does not retroactively execute CI for PR #13: a newly introduced workflow is not available from the base branch before it is merged, and no workflow run is associated with the current head in this check.
- No test result is claimed for this documentation/configuration update. Existing SQLite/reference-model test evidence remains the earlier independently recorded run evidence only; it is not a new run for this commit.


## 2026-11-27 — Idempotency scope consistency review

**Finding:** the implementation-neutral state-machine contract scopes an operation key to the authenticated sender/account, but the SQLite prototype originally scoped its uniqueness key to (conversation_id, sender_id, operation_key). The in-memory reference model used (sender_id, operation_key) but did not reject a same-payload key reuse in another conversation; it could return the prior message from the wrong conversation. The SQLite test suite also explicitly asserted that one sender could reuse the same operation key in another conversation. These behaviors were inconsistent with the documented contract and unsafe for client retry reconciliation.

**Correction applied on research/architecture-synthesis-task:**
- Both prototypes now enforce (sender_id, operation_key) scope.
- A repeated key with the same payload and same conversation resolves to the same message.
- A repeated key with a different payload or a different conversation is rejected as an idempotency conflict without allocating a new sequence or outbox rows.
- A different sender may independently use the same operation key.
- Added regression coverage to both prototype suites and clarified the contract table.

**Targeted verification:** an isolated Python/SQLite regression harness executed the revised SQL uniqueness/query shape and send transaction behavior. Four assertions passed: same-operation retry returns the original message; cross-conversation reuse by the same sender conflicts without mutation; changed payload conflicts; another sender has an independent scope.

**Not run / limitations:** the complete repository Python reference-model and SQLite adapter suites were not executed in this environment. A temporary validation PR #41 targeting the branch containing the workflow definition produced no associated workflow runs and an empty combined commit status. This is recorded as Not run, not as a CI pass. The added test case was copied into the main research PR branch; PR #41 is only a validation attempt and is not required for the proposed change.

**Compatibility note:** the prototype creates fresh disposable SQLite databases in tests. No migration for an existing deployed schema is included because this is not production code and no deployed SQLite data contract exists.


## 2026-11-27 — Idempotency scope regression CI result

- **Workflow:** Message reliability and SQLite adapter tests, run #176 / [Actions run 46011193416](https://github.com/Elusivedamir/jet/actions/runs/46011193416).
- **Tested commit:** `9bda52e41bd497609bb9dff28458e2150acd8f43` (the current research PR head at run time).
- **Result:** job completed successfully. Source/test compilation passed; reference-model suite passed **15 tests**; SQLite adapter suite passed **18 tests**; **33 tests total, 0 failures**.
- The passing reference-model tests include `test_same_sender_cannot_reuse_operation_key_in_another_conversation` and `test_different_senders_have_separate_idempotency_scopes`. The SQLite suite includes the corresponding two regression tests.
- This is passing evidence for the in-memory reference model and isolated SQLite adapter only. It is not a production server/client test, network delivery test, host/power-loss test, load test, security review, backup/restore drill or production database selection.


## 2026-11-27 — Independent upstream source-path spot check

Five pinned raw files were retrieved and inspected directly: Tinode `server/topic.go`, Synapse `synapse/handlers/message.py`, OpenIM `internal/msgtransfer/online_history_msg_handler.go`, ejabberd `src/mod_offline.erl`, and Listmonk `queries/campaigns.sql`. Detailed source-level observations and caveats are in `docs/research/INDEPENDENT_SOURCE_CHECK_2026-11-27.md`. The check supports only those five path-specific observations. The full source manifest/snapshot directory remains absent from both Jet research branches; no full upstream test/build, SBOM, nested license, security advisory or legal review was performed. No code reuse is approved.


## 2026-11-27 — Critical-path source trace and risk register

Independently retrieved three exact upstream Git blobs cited by the existing message-delivery deep dive: OpenIM consumer handler `8af585ce33b1ca9661bfda1abd00e5277d46e944`, OpenIM message-transfer controller `8a8d9e7d26cf51a117826e7728b9f92ff5d3861f`, and Tinode storage mapper `0a06b29288f92cd203b13d7573bf835a3e6cdda0`. Source observations include OpenIM MQ Mark/Commit callback, non-propagated enqueue/processing errors, sequence allocation before cache write, separate Mongo/push MQ methods, and Tinode's separate sequence-update/message-save adapter calls. These are high-priority failure hypotheses only; no actual upstream message loss or vulnerability is asserted. Exact evidence and required fault tests are in `docs/research/MESSAGE_DELIVERY_FAILURE_RISK_REGISTER.md`.


## 2026-11-27 — Product-stage consistency discrepancy retained

- Cross-checked the canonical business-plan baseline, product requirements and user journeys.
- Found AI-001/AI-002 listed under Stage 2 in the derivative requirements table, while the canonical business plan §11 and AI user journey place AI rollout in Stage 3.
- The synthesis follows the canonical baseline. A provisional requirements-file edit was reverted because Agent Task 04 explicitly prohibits modifying product requirements. The final requirements file matches the base branch unchanged; the discrepancy remains open for a separate authorized product-document task.
- AI remains included in the base Jetson Business subscription; only the rollout stage is inconsistent. No business-plan or product-requirements change is retained.


## 2026-11-27 — Application-server candidate screen

- Added `docs/research/STACK_CANDIDATE_SCREEN_AND_POC_GATE_2026-11-27.md`.
- Shortlist for a reversible PoC: Go, TypeScript/Node.js LTS and Kotlin/Spring Boot; Rust retained as a reserve candidate. This is not a stack selection.
- Official documentation was checked for Go SQL transaction/connection-pool/concurrency behavior, Node event-loop and LTS guidance, Spring Boot operational/transaction facilities and proxy transaction semantics, and Rust ownership/async-runtime concepts.
- All 8 weighted criteria remain Unknown for all candidates until an identical Jetson-specific PoC is run. No score or aggregate is claimed.
- Defined a common durable direct-message contract, 12 P0 tests, fair resource/test measurements, stop conditions and dependency/security/license checks.
- No production code, product scope, business plan or stack configuration changed. No PoC runtime tests were run in this documentation step.


## 2026-11-27 — Go durable-message core PoC (partial)

- Added isolated `poc/go-server` with PostgreSQL schema, sender-scoped idempotency, transactional message/position/outbox creation, post-commit HTTP acceptance, membership-scoped history and integration tests.
- Added `.github/workflows/go-durable-message-poc.yml` for PostgreSQL-backed CI, formatting, vet, race detection and 100 repeated test runs.
- Added `docs/research/GO_DURABLE_MESSAGE_POC_REPORT_2026-11-27.md` and PoC README documenting implemented behavior, security limitations and missing delivery stages.
- **Verified on latest branch commit `683d988f7d7e54b8cdc52f7346fca47db48620d7`:** GitHub Actions [#46013315702](https://github.com/Elusivedamir/jet/actions/runs/46013315702) passed `go mod tidy`, gofmt, `go vet`, and PostgreSQL 17 integration/race tests with `-count=100`. Five integration test functions passed across 100 repetitions; concurrency case used 12 simultaneous submissions. A superseded intermediate commit failed vet because `schema_apply.go` was not yet present; the helper was added and the latest commit passed. No local test run claimed.
- **Incomplete contract:** no realtime transport, outbox worker/lease recovery, recipient ack, reconnect client or hard-crash fault injection. No comparative scoring or production selection.
- Business plan/product requirements unchanged; `main` untouched.


## 2026-11-27 — three-stack delivery/reconnect PoC validation

- Latest tested source revision: `bcc14766b381d9ffe9ef2e81695221a9e500c32c`.
- Go workflow [#46016133216](https://github.com/Elusivedamir/jet/actions/runs/46016133216): module tidy, gofmt, go vet, PostgreSQL 17 integration/race tests with `-count=100`, shared black-box contract and five-round benchmark — PASS. Eight integration test functions were repeated 100 times; package runtime ~31.9 s.
- Node workflow [#46016133262](https://github.com/Elusivedamir/jet/actions/runs/46016133262): TypeScript build, five PostgreSQL 17 tests, shared black-box contract and five-round benchmark — PASS.
- Kotlin workflow [#46016133220](https://github.com/Elusivedamir/jet/actions/runs/46016133220): Kotlin main/test compilation, five JUnit/PostgreSQL 17 tests, shared black-box contract and five-round benchmark — PASS.
- Shared harness passed for each server: send/retry identity, conflict on changed payload, 12 concurrent identical retries, non-member history forbidden, recipient SSE delivery, idempotent acknowledgement and cursor reconnect without replay of the consumed event.
- Preliminary five-round latency medians (100 sequential sends per round; milliseconds): Go p50/p95/p99/mean = 2.139/2.616/5.854/2.318; Node = 2.934/3.685/5.930/3.111; Kotlin = 2.465/3.654/5.238/2.656. These are CI microbenchmarks only; no CPU/RSS, sustained concurrency capacity or SLO evidence.
- Earlier intermediate CI failures were not hidden: Go formatting and HTTP error-body parsing were corrected; Node CommonJS import and test isolation were corrected; Kotlin Maven source roots, misplaced test method and DB URL were corrected. The latest exact revision above passed all gates.
- Remaining: hard process-kill injection at commit/claim/dispatch/ack boundaries; production identity/security; lockfiles/checksums and dependency SBOM/license inventory; equivalent sustained-load and resource measurements; maintenance-task comparison. Stack choice remains Open.
- Governance unchanged: no production adoption, deployment, merge to `main`, or product/business-plan edits.


## 2026-11-27 — three-candidate lease/cursor hardening and atomic failure tests

- Exact shared head `f86d25e755b17fcc7509b90288ae5c55f05f14e0` passed all three GitHub Actions workflows: [Go #46021008920](https://github.com/Elusivedamir/jet/actions/runs/46021008920), [Node #46021008197](https://github.com/Elusivedamir/jet/actions/runs/46021008197), [Kotlin #46021008199](https://github.com/Elusivedamir/jet/actions/runs/46021008199).
- Go: gofmt, go vet, PostgreSQL 17, race detector and 12 integration test functions with `-count=100` passed. Node: TypeScript build and 8 PostgreSQL tests passed. Kotlin: Kotlin main/test compilation and 8 JUnit/PostgreSQL tests passed.
- Shared contract on the same head passed send/retry identity, payload conflict, 12 concurrent duplicate submissions, non-member denial, negative history/SSE cursor rejection, SSE delivery, idempotent acknowledgement, Last-Event-ID precedence and reconnect without replay.
- New tests verified active lease expiry rejection before reclaim, stale-token fencing after reclaim, parallel claims without duplicate row ownership, retry exhaustion and atomic rollback when outbox insertion is forced to fail.
- The current exact-head CI is green. Earlier intermediate Go formatting and Kotlin test-placement failures were fixed and retained in Actions history. Do not treat those intermediate failures as the current status.
- Remaining evidence gaps: hard process-kill injection at transaction/claim/dispatch/ack boundaries; complete committed lockfiles/checksums; dependency SBOM/license inventory; production identity/session/security; sustained-load/resource benchmarks and timed maintenance-task comparison. No stack decision or capacity/SLO claim.
- Governance unchanged: Draft PR #44 stacked on Draft PR #43; `main`, business plan and product requirements unchanged; no deployment or merge.


## 2026-11-27 — hard crash/restart test design

- Added `docs/testing/HARD_CRASH_RECOVERY_TEST_PLAN_2026-11-27.md` with a common process-kill fault boundary and acceptance criteria for Go, Node.js/TypeScript and Kotlin/Spring.
- The proposed test uses a disposable PostgreSQL trigger/marker to hold dispatch inside an uncommitted recipient-inbox transaction, verifies the server reached that point, kills the actual application process, restarts against the same database, and asserts lease-based recovery plus exactly-one durable inbox delivery.
- This is a test specification only. No process-kill harness or CI workflow changes have been committed; no crash/restart test is claimed as passing.
- Existing three-stack CI results remain the prior baseline only. Production-stack decision remains Open.


## 2026-11-27 — parallel engineering workstream setup

- Added `docs/agent/PARALLEL_ENGINEERING_WORKSTREAMS_2026-11-27.md` to coordinate independent work across crash recovery, the three candidate stacks, supply-chain, performance and product/security architecture.
- Confirmed PR #44 remains open Draft and unmerged. Latest head `cf503ae61849b6c751d055d46a72b896ab381dba` is documentation-only; no CI status checks are reported for that head because existing workflows are path-filtered to code/workflow changes.
- Existing passing implementation checks remain attached to `f86d25e755b17fcc7509b90288ae5c55f05f14e0`; they are not represented as a new run on the current docs head.
- No direct Copilot/Codex agent launch/assignment capability is exposed in the connected toolset; this limitation is recorded rather than claiming nonexistent agents. Separate CI candidate workflows are the available parallel execution mechanism.


## 2026-11-27 — dependency reproducibility manifest audit

- Added `docs/research/DEPENDENCY_REPRODUCIBILITY_AUDIT_2026-11-27.md` after inspecting committed Go, Node and Maven dependency manifests and current CI install commands.
- Go: `go.sum` absent; workflow resolves with `go mod tidy` in CI. Node: `package-lock.json` absent; workflow uses `npm install`. Kotlin: Maven parent and Kotlin/plugin versions are declared, but full transitive lock/checksum enforcement is not committed.
- Result: reproducibility gate remains OPEN for all candidates. No vulnerability scan, SBOM generation, or license review was performed or claimed in this pass.
- Required next work: create committed dependency metadata, switch Node CI to `npm ci`, make Go CI non-mutating, choose Maven transitive pinning/checksum strategy, then attach SBOM and security/license reports to exact tested SHAs.


## 2026-11-27 — executable hard crash/recovery and repeated benchmark

- Added `poc/shared/crash_recovery_harness.py`; integrated it into Go, Node and Kotlin candidate CI. It launches each direct server process, injects a PostgreSQL trigger pause during recipient-inbox insertion, confirms the lease is still valid, sends SIGKILL, checks transaction rollback, waits for lease expiry, restarts the server and checks one durable inbox row plus idempotent retry.
- Hard crash/recovery result: PASS for Go baseline run [46025003199](https://github.com/Elusivedamir/jet/actions/runs/46025003199), Node run [46026586747](https://github.com/Elusivedamir/jet/actions/runs/46026586747), Kotlin run [46026586769](https://github.com/Elusivedamir/jet/actions/runs/46026586769). Go's crash test passed even though its separate security scan failed.
- Shared benchmark now performs five sequential rounds and three concurrent rounds of 200 writes at concurrency 16. Direct server RSS and CPU ticks are sampled from `/proc`; PostgreSQL resources are excluded.
- Latest Node evidence: 565.87 req/s median across concurrent rounds; p95 64.592 ms, p99 94.321 ms; sampled RSS 87,252 KiB; CPU 179 ticks at 100 Hz. npm ci passed; npm audit and Trivy reported zero vulnerabilities.
- Latest Kotlin evidence: 599.28 req/s median; p95 62.050 ms, p99 80.862 ms; sampled RSS 269,716 KiB; CPU 487 ticks at 100 Hz. Maven verify, dependency tree, CycloneDX SBOM (42 components) and Trivy passed with zero reported vulnerabilities after PostgreSQL JDBC 42.7.12.
- Go baseline evidence: 341.2 req/s in one concurrent probe; p95 380.520 ms; sampled RSS 17,708 KiB; CPU 64 ticks. This run used the old vulnerable baseline and must not be compared as final against the newer three-round Node/Kotlin runs.
- Go govulncheck on the old baseline reported 24 reachable advisories. Remediation committed: Go 1.26.11, pgx/v5 5.9.2 and x/text 0.41.0. A post-remediation Go run and refreshed go.sum have not yet been confirmed from the available CI evidence.
- Added scorecard and ADR-0001 proposing Node.js/TypeScript for v1. The recommendation remains conditional on a clean patched Go security run and further sustained-load testing.
- Remaining: Maven full transitive lock strategy; refresh/verify Go checksums after dependency upgrades; review project license (`UNLICENSED` on npm root); pin GitHub Actions by immutable SHA; run sustained-load/soak and further crash-boundary tests.


## 2026-11-27 — expanded recovery coverage and fail-closed supply-chain CI

- Extended the shared crash harness to three process-failure scenarios: (1) SIGKILL during recipient-inbox dispatch transaction; (2) SIGKILL after the outbox claim commits while the worker is blocked before inbox insertion; (3) client closes without reading the committed HTTP acceptance response, server is killed/restarted, then client retries the same idempotency key.
- The first scenario has historical PASS evidence on all three candidates. The new second and third scenarios are committed but their CI execution is pending; do not mark them PASS until exact-SHA workflow evidence is available.
- Hardened all three workflows: read-only repository permissions; push triggers restricted to the research branch; Node npm audit now fails on low-or-higher advisories and license-checker uses an allow-list; Go govulncheck and go-licenses checks are required; Kotlin emits a third-party license inventory; Trivy exits nonzero for HIGH/CRITICAL findings.
- Corrected Go workflow's module cache path and removed an earlier workflow self-push mechanism. The Go workflow now retains the refreshed module metadata diff and go.sum as an artifact; the repository go.sum must be updated only after reviewing the generated artifact.
- Added a 30-second concurrent write soak at concurrency 16 after the three-round microbenchmark. The soak and expanded crash tests have not yet produced confirmed results in the current workflow attempt.
- Earlier Node/Kotlin SBOM and vulnerability results remain historical inventory evidence. The new fail-closed gates require fresh runs; no new clean result is claimed yet.
- Stack recommendation remains Node.js/TypeScript for v1 as a provisional architecture choice, not a production release decision. Go's patched security scan/checksum confirmation and comparable performance result remain open.


## 2026-11-27 — patched Go comparison and reproducibility hardening

- New same-runner-class benchmark evidence from Go run [46028089040](https://github.com/Elusivedamir/jet/actions/runs/46028089040), Node run [46028089075](https://github.com/Elusivedamir/jet/actions/runs/46028089075), Kotlin run [46028089057](https://github.com/Elusivedamir/jet/actions/runs/46028089057): Go 723.39 req/s median, p95 26.873 ms, p99 30.586 ms, sampled peak RSS 18,420 KiB, 115 CPU ticks; Node 576.98 req/s, p95 69.909 ms, p99 138.041 ms, RSS 85,384 KiB, 141 ticks; Kotlin 703.05 req/s, p95 52.171 ms, p99 66.678 ms, RSS 265,864 KiB, 527 ticks.
- All three passed two hard crash/recovery scenarios in these runs: kill during dispatch transaction and kill after committed claim while dispatch is blocked. The new lost-acceptance-response case is implemented but has not yet been executed in CI.
- Go's patched govulncheck output: “No vulnerabilities found.” The job failed later because go-licenses could not identify the first-party module's license. Workflow now excludes the first-party module from third-party scanning. CI-generated go.mod/go.sum were reviewed and committed; workflow now checks for no drift after go mod tidy.
- Node npm audit JSON reported zero advisories. Its first fail-closed license step stopped on the root package's UNLICENSED declaration; workflow now excludes the first-party package from the third-party allow-list.
- Kotlin's SBOM contains 42 components; Trivy found zero vulnerabilities. Three components have EPL/LGPL/GPL-with-classpath-exception license declarations. A conservative SBOM license gate now blocks unreviewed declarations.
- Added a committed 72-coordinate Maven version-graph lock and checker. GitHub Actions pinned to immutable commit SHAs.
- Added a 30-second concurrent write soak and richer mean-RSS/CPU percentage metrics. These additions, the lost-response scenario, and corrected fail-closed workflows await the next CI result.
- ADR-0002 now proposes Go + PostgreSQL for v1, superseding the earlier Node proposal. This remains provisional pending clean final CI, soak and matched product-development task evidence.


## Runtime pinning — 2026-11-27

GitHub Actions are pinned to immutable commit SHAs. Runtime/service versions are pinned in CI: Go 1.26.11, Node.js 22.23.5 via `.nvmrc`, Temurin JDK 21.0.13 and PostgreSQL 17.12.


## 2026-11-27 — Loop Code Review skill installed

- Installed upstream `di-sukharev/loop-code-review-skill` into `.agents/skills/loop-code-review/`.
- Pinned source revision: `23fdbdec6bb211fa55f84da49d58333efe3b09db`; installed `SKILL.md` was fetched again from that exact commit and compared byte-for-byte at the text-content level with the repository copy (matching Git blob SHA `0fc244019a941e3a6b31164ca0f6b49d4b7c0e70`).
- Preserved upstream MIT license and `agents/openai.yaml` metadata.
- Added repository inventory/provenance at `docs/governance/AGENT_SKILLS.md`, linked it from README, and added mandatory pre-commit review guidance to `docs/governance/MASTER_PROMPT.md`.
- Skill invocation: `$loop-code-review` or “используй ревью в цикле”.
- Capability boundary is documented: only report independent sub-agent review when the active environment actually supports sub-agent orchestration. Otherwise disclose the limitation and label any manual review as a fallback, not an independent review.
- Installation verification: source and installed SKILL.md blob SHAs match. No application build or CI test is applicable to this documentation/skill-only change; skill discovery should be verified in the target coding-agent runtime.


## 2026-11-27 — Manual Loop Code Review fallback made mandatory in the master prompt

- Owner confirmed that, in this ChatGPT environment, the Loop Code Review rules should be applied through a separate manual review phase rather than attempting to claim unavailable sub-agent orchestration.
- Updated section 16 of `docs/governance/MASTER_PROMPT.md` with an explicit seven-step manual review procedure: switch from authoring to reviewer mode; inspect the full task diff and untracked files; trace requirements; challenge failure/security/concurrency/data-integrity cases; run checks and regression tests; record and fix material findings over up to five rounds; perform a complete follow-up review.
- All such results must be labelled **manual self-review (not independent)**. Any score is a self-assessed implementation score, not an independent reviewer score.
- The prompt forbids fabricated sub-agent identities, models, effort, scores, rounds, test output or pass claims. It requires `open` status when material risks or unavailable checks remain.
- This is a documentation/governance update only. No application source code changed and no application CI/build is claimed.
- Commit: `f6802e681cdeae53e3937e8db3c74398087137e8`.


## 2026-11-27 — OpenCommit integration policy documented

- Reviewed upstream `di-sukharev/opencommit` README and package metadata; documented package version 3.3.12 and MIT license.
- Added `docs/governance/OPENCOMMIT.md` describing local CLI installation, provider configuration, `oco hook set` / `oco hook unset`, IDE integration, credential handling and limitations.
- Recommended the local `prepare-commit-msg` hook as an opt-in developer convenience. The hook must be installed inside each developer's own clone; GitHub file edits cannot install it on a workstation.
- Explicitly declined to enable the upstream GitHub Action by default: it is marked beta and rewrites commit history/SHAs on push. Any future rollout requires explicit owner approval, immutable action-source audit, least-privilege permissions, branch-protection/recovery design and isolated-branch testing.
- Updated `docs/governance/MASTER_PROMPT.md` with mandatory OpenCommit governance and linked the guide from README.
- No GitHub Action workflow was added; no local workstation CLI or hook installation is claimed. No API credentials were requested or stored.
- Documentation only; no application build/test is applicable.


## 2026-11-27 — continuous security and quality gate integration (initial)

- Created dedicated branch `governance/continuous-quality-security-gates-2026-11-27`, based on the current PR #44 research branch head; `main` was not modified.
- Vendored four unmodified Trail of Bits skills from upstream commit `149d7b21f4067765b82e67029730b42d228ef4b4`: differential-review, post-patch-validation, spec-to-code-compliance and supply-chain-risk-auditor. Preserved the upstream CC BY-SA 4.0 license and recorded source blob SHAs. The upstream license is not MIT; do not relicense these files.
- Added the Jetson continuous security gate policy and an OWASP ASVS 5.0.0 evidence checklist.
- Added a pull-request/weekly/manual workflow for Semgrep CLI 1.187.0, Gitleaks pinned by OCI digest, zizmor action/CLI pinned, and CodeQL pinned to an immutable commit for Go, JavaScript/TypeScript and Java/Kotlin.
- Semgrep's archived `semgrep/semgrep-action` was explicitly rejected in favor of the native CLI.
- OpenSSF Scorecard and Renovate remain documented follow-ups, not active integrations: Scorecard needs a separate least-privilege/publication decision; Renovate requires external GitHub App installation/authorization.
- Workflow execution, action compatibility, findings and language extraction are **NOT RUN / NOT VERIFIED** at the time of this documentation change. No security PASS, ASVS compliance or production-readiness claim is made.
- Manual self-review only; no independent sub-agent review was available in this environment.
