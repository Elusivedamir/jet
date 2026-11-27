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


## 2026-11-27 — Product-stage consistency correction

- Cross-checked the canonical business-plan baseline, product requirements and user journeys.
- Found AI-001/AI-002 listed under Stage 2 in the derivative requirements table, while the canonical business plan §11 and AI user journey place AI rollout in Stage 3.
- Moved AI-001/AI-002 to Stage 3. AI remains included in the base Jetson Business subscription; this is a sequencing correction only. The canonical business plan was not edited and no product scope was added or removed.
