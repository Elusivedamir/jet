# Engineering validation log

Last updated: 2026-11-24

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
