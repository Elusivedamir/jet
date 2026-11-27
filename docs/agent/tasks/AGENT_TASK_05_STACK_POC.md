# Agent Task 05 — Comparable Server-Stack Proof of Concept

## Objective

Build isolated, disposable proof-of-concept implementations to compare application-server candidates for Jetson Messenger. This task does not authorize choosing or deploying a production stack.

## Source of truth and mandatory constraints

- Read `docs/research/STACK_CANDIDATE_SCREEN_AND_POC_GATE_2026-11-27.md` in full.
- Read `docs/testing/MESSAGE_STATE_MACHINE_CONTRACT.md` and `docs/testing/MESSAGE_RELIABILITY_TEST_PLAN.md`.
- The owner's business plan remains canonical. Do not edit product scope, pricing, trial, campaign channels, roadmap stages or user journeys.
- Do not adopt JuggleIM, Lansetbot, Chatwoot or any other complete upstream product as the foundation.
- Do not implement groups, attachments, CRM, subscriptions, campaigns, AI, E2EE or external channels in this PoC.
- No production identity, password, session, cryptography, deployment or hosting decision is authorized.
- Do not touch `main`; keep each candidate isolated and disposable.

## Candidates

First compare Go, TypeScript/Node.js LTS and Kotlin/Spring Boot. Rust is a reserve candidate and should only be added if a finalist fails a correctness/resource/maintainability gate or the evidence changes.

Framework selection within each candidate is part of the PoC, not assumed in advance. Use minimal, maintained dependencies and record exact versions, licenses and lockfiles.

## Required identical behavior

Implement the same direct-message vertical slice for each candidate:
1. Two authenticated test accounts and two realtime connections using a common harness.
2. A stable sender-scoped operation key.
3. One atomic database transaction for message identity, conversation position, idempotency record and durable outbox intent.
4. Acceptance response only after successful commit.
5. Independently retriable outbox worker and recipient acknowledgement state.
6. Restart/reconnect recovery with a safe cursor.

Use the same PostgreSQL version/schema/connection budget and identical test fixtures across candidates. Do not use SQLite as a substitute for this comparison.

## Required tests

Execute STACK-001 through STACK-012 from the stack gate document. Include hard process termination and injected failures at transaction commit, acceptance response, outbox claim, delivery send and completion record. P0 correctness failures stop the candidate.

## Measurements

Measure build time, cold start, steady-state RSS, CPU, open sockets, database connections, transaction latency, queue age, delivery lag, test runtime and image size. Run each performance scenario at least five independent times after warm-up; publish median, p95/p99 and run-to-run spread. Do not make capacity/SLO claims from the small PoC.

Also time one owner/agent maintenance task per candidate: add a migration-safe field, update the API contract, add tests and trace one message end-to-end. Record generated-code corrections and reviewer effort.

## Security and reproducibility

- Pin dependencies and toolchain versions.
- Produce dependency inventory/SBOM where tooling supports it.
- Scan dependencies, secrets and licenses; report all unknowns.
- Build from a clean checkout in CI.
- Record exact commands, environment, commit SHA, seed, raw result artifacts and failures.
- Do not log message bodies, secrets or personal data.

## Deliverables

1. Separate PoC directories/branches for each candidate.
2. One shared test harness and machine-readable result schema.
3. `docs/research/STACK_POC_RESULTS.md` with evidence, failed tests, resource results, DX observations, license/security gates and evidence coverage.
4. An ADR update recommending a candidate only if every non-compensable gate passes and the weighted score is evidence-backed; otherwise keep the decision Open.

## Stop conditions

Stop and report immediately if any candidate loses an accepted message, creates duplicate logical messages, skips a committed cursor position, leaks another account's data, acknowledges before commit or cannot recover pending delivery work.

## Governance

No production adoption, merge to `main`, deployment or release. A final production-stack choice remains an owner decision after review of reproducible evidence.

## Progress update — 2026-11-27

- Started the Go candidate in isolated directory `poc/go-server`; it is a partial durable-persistence slice, not the full required vertical slice.
- Implemented PostgreSQL schema, sender-scoped idempotency, transactional message/position/outbox creation, post-commit acceptance, membership-scoped history and integration tests.
- Latest code revision `683d988f7d7e54b8cdc52f7346fca47db48620d7` passed [GitHub Actions run #46013315702](https://github.com/Elusivedamir/jet/actions/runs/46013315702): module tidy, gofmt, go vet and PostgreSQL 17 race/integration tests with 100 repetitions.
- Go candidate remains **incomplete**: realtime delivery, outbox worker/lease recovery, recipient acknowledgement, reconnect and hard-crash fault injection remain open.
- Node/TypeScript and Kotlin/Spring comparable implementations have not started; no score or production selection is permitted.
- The current implementation PR is Draft #43, stacked on Draft research PR #42. Do not merge or deploy without owner approval.


## Progress update — 2026-11-27 (three-candidate delivery slice)

- Implemented matching Go, Node.js/TypeScript and Kotlin/Spring two-party message cores on PostgreSQL 17.
- All three now have sender-scoped idempotency, transactional message/sequence/outbox writes, leased SKIP LOCKED claims, lease fencing, recipient inbox, bounded retries, cursor history, polling-backed SSE and recipient acknowledgement.
- Added a shared black-box harness covering idempotent retry, changed-payload conflict, 12 concurrent duplicate submissions, non-member history denial, SSE delivery, repeated ack and cursor reconnect.
- Latest exact head `bcc14766b381d9ffe9ef2e81695221a9e500c32c` passed all three workflows: [Go #46016133216](https://github.com/Elusivedamir/jet/actions/runs/46016133216), [Node #46016133262](https://github.com/Elusivedamir/jet/actions/runs/46016133262), [Kotlin #46016133220](https://github.com/Elusivedamir/jet/actions/runs/46016133220).
- Go ran eight PostgreSQL integration test functions 100 times with the race detector; the final package run passed. Node and Kotlin each ran five integration tests; Kotlin now compiles actual main and test Kotlin sources (earlier Maven config that compiled zero Kotlin sources was corrected).
- Shared harness ran five 100-message sequential latency rounds per candidate and uploaded JSON artifacts. Median-of-round metrics and caveats are in `docs/research/POLYGLOT_MESSAGE_POC_STATUS_2026-11-27.md`. This is not a capacity/SLO test and no CPU/RSS metrics were gathered.
- Stack decision remains **Open**. No production selection, scorecard, deployment or merge authorization. Hard process-kill fault injection, real auth/session, security/privacy review, lockfiles/checksums/SBOM/license inventory and sustained-load/resource benchmarks remain open.
- PR #44 remains Draft and stacked on Draft PR #43. `main`, business-plan PDF and product requirements unchanged.


## Progress update — 2026-11-27 (lease correctness hardening)

- Reviewed the lease expiry boundary across all three candidates. A stale fencing token check alone was not enough: an expired lease must be rejected even before another worker reclaims it.
- Go, Node and Kotlin dispatch-completion and retry updates now require `lease_until > clock_timestamp()`; this avoids PostgreSQL `now()` retaining the transaction-start timestamp during a long transaction.
- Added matching tests in all three candidates for expired-lease rejection. Added parallel multi-worker claim uniqueness and terminal retry-limit tests across all candidates.
- Intermediate CI failures were found and corrected: Go formatting check reported `store_test.go`; Kotlin compilation found tests appended outside the test class. Final verification is pending on the current head; do not cite earlier passing runs as validation of these changes.
- Remaining Task 05 blockers: hard process-kill fault injection at commit/acceptance/claim/dispatch/ack boundaries; complete committed lockfiles/checksums; dependency SBOM/license review; controlled resource and sustained-load tests; timed maintenance-task comparison. Keep all scores Unknown where evidence is absent and keep stack decision Open.


## Verification update — 2026-11-27 (final lease/cursor hardening)

- Exact shared head `f86d25e755b17fcc7509b90288ae5c55f05f14e0` passed all three workflows: [Go #46021008920](https://github.com/Elusivedamir/jet/actions/runs/46021008920), [Node #46021008197](https://github.com/Elusivedamir/jet/actions/runs/46021008197), [Kotlin #46021008199](https://github.com/Elusivedamir/jet/actions/runs/46021008199).
- Go: 12 PostgreSQL integration test functions repeated 100 times with the race detector; gofmt and go vet passed. Node: 8 PostgreSQL integration tests and TypeScript build passed. Kotlin: 8 JUnit/PostgreSQL tests and actual Kotlin main/test compilation passed.
- Shared harness passed negative cursor rejection and Last-Event-ID precedence over stale query cursor, in addition to the prior retry/concurrency/member/SSE/ack/reconnect checks.
- Added deterministic outbox-insert fault injection and verified message, sequence counter and outbox all roll back together. Parallel worker claims and retry terminal state are covered in each candidate.
- Candidate implementation remains a research PoC. Hard process-kill tests at commit/claim/dispatch/ack boundaries, production identity/security, complete committed lockfiles/checksums, SBOM/license inventory, sustained-load/resource benchmarking and owner/agent maintenance-task comparison remain open. No weighted score or stack choice is allowed yet; status remains Open.


## Hard crash/restart test specification — 2026-11-27

- Added `docs/testing/HARD_CRASH_RECOVERY_TEST_PLAN_2026-11-27.md` defining an equivalent SIGKILL/restart scenario for all three candidates.
- The first fault boundary is after outbox claim commit and during the recipient-inbox dispatch transaction, using an ephemeral PostgreSQL trigger/marker to prove the process reached the intended point before SIGKILL.
- Required recovery assertions include committed message/outbox survival, rollback of in-flight inbox insertion, lease expiry/reclaim after restart, exactly-one durable inbox delivery, completed outbox state and idempotent sender retry.
- **Status: specification only. No executable crash harness has been added and no hard process-kill test has run.** Existing lease-expiry and transaction-rollback tests must not be described as process-kill evidence.
- Next implementation step: add a shared harness and direct-process launch/termination to each CI workflow; run all three and record exact run IDs/SHA. Keep stack decision Open.


## Parallel execution workstreams — 2026-11-27

- Added `docs/agent/PARALLEL_ENGINEERING_WORKSTREAMS_2026-11-27.md` defining seven logical workstreams: reliability, Go, Node.js, Kotlin, supply-chain, performance and product/security architecture.
- Tooling transparency: the connected toolset does not expose a direct Copilot/Codex coding-agent launch/assignment action for this repository. No separate autonomous coding agents are claimed to be running. Use independent candidate CI workflows and evidence-backed review workstreams until a dedicated runner is available.
- Current PR head is documentation-only; no new CI run is expected from the docs-only path filters. The current head has no status checks reported. Prior code-level green CI results remain tied to implementation SHA `f86d25e755b17fcc7509b90288ae5c55f05f14e0`.
