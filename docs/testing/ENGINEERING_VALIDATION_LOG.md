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
| #18 | `research/architecture-synthesis-task` | Consolidated the reliability contracts, reference model, SQLite experiment and evidence log | CI #38: 13 + 17 = 30 tests passed |
| #19 | `project/greenfield-reset` | Narrow integration of the reliability and persistence experiment into the working project branch | Source CI #38: 30 tests passed |
| #20 | `project/greenfield-reset` | Documented combined CI coverage on the project integration branch | Documentation-only follow-up |
| #21 | `project/greenfield-reset` | Added bounded retries, exponential delay, dead-letter handling, schema migration and receiver-dedup crash test | CI #64: 13 reference-model + 25 SQLite tests = 38 passed |
| #25 | `project/greenfield-reset` | Added adapter-neutral outbox dispatch contract and 13-test reference model | CI #70: 26 reference-model + 25 SQLite tests = 51 passed |

PRs #14–#18 are now merged. PRs #15–#17 were merged in dependency order into their stacked parent branches; PR #18 consolidated the model and adapter work into `research/architecture-synthesis-task`.

## Consolidation validation

GitHub Actions run #38 passed the initial integrated packages (13 reference-model + 17 SQLite tests). After PR #21, run #64 passed the expanded packages. After PR #25, run #70 passed:

- Reference model: 13 tests.
- SQLite adapter: 17 tests.
- Total: 30 tests, 0 failures, 0 errors.

The latest run used Python 3.12 on Ubuntu: 26 reference-model tests (13 message + 13 outbox) and 25 SQLite adapter tests, 51 total. See [run #70](https://github.com/Elusivedamir/jet/actions/runs/45334603955). The same 51-test suite also passed directly on `project/greenfield-reset` in [run #74](https://github.com/Elusivedamir/jet/actions/runs/45334728258).

## What this proves — and what it does not

It demonstrates that the written message and outbox contracts have executable in-memory oracles and that one SQLite adapter experiment passes deterministic transaction, restart, concurrency, lease, retry, dead-letter, receiver-dedup and ordering tests.

It does **not** prove production message delivery, exactly-once network delivery, device receipt/read, host or power-loss durability, multi-process service behavior, replication, backup/restore, E2EE, security posture, throughput, availability or operating cost. SQLite is not selected as Jetson's production database. No messaging server has been implemented by these experiments.

## Second persistence candidate: PostgreSQL POC

A narrow PostgreSQL 16 adapter experiment now mirrors the existing SQLite experiment's public operation shapes. It is isolated under `tests/postgres_adapter/`, uses psycopg 3.2.6, and is not wired into product/runtime code.

GitHub Actions [run #45337489838](https://github.com/Elusivedamir/jet/actions/runs/45337489838) passed on commit `bb6dd416c57965da94552731f296716350e2aada`:

- In-memory reference model: 26 tests passed.
- SQLite adapter: 25 tests passed.
- PostgreSQL adapter: 9 integration tests passed against PostgreSQL 16.
- Total: 60 tests passed, 0 failures, 0 errors.

The PostgreSQL tests cover atomic message/idempotency/outbox acceptance, rollback, unknown commit outcome recovery, concurrent same-key submissions, concurrent worker claims using row-level locking, lease reclamation/fencing, retry timing, dead-lettering and recipient-order isolation.

### Mapping notes and remaining gaps

- Existing SQLite API: `create_conversation`, `send`, `claim_next`, `acknowledge_dispatch`, `release_claim`, `snapshot`. PostgreSQL mirrors these for the POC; the implementation-neutral logical API names in the harness document are not yet a shared Python interface.
- SQLite stores dead-letter as `dead_letter_at` metadata while its state CHECK remains pending/leased/dispatched; its snapshot projects that metadata as `dead_letter`. PostgreSQL uses an explicit `dead_letter` state. Both satisfy the tested snapshot behavior, but physical schema parity is not claimed.
- The nine PostgreSQL tests are a candidate-specific integration suite, not yet a reusable common conformance test mixin. Next step is to extract shared behavioral scenarios and run the same suite against both adapters.
- PostgreSQL schema creation is idempotent for a clean schema; a versioned forward-migration path from a prior PostgreSQL adapter schema is not implemented.
- Backup/restore, failover, process-kill recovery, host/power-loss durability, production scheduling, transport, receiver-side dedup, load and operating cost remain untested.

A green test run is evidence for these specific scenarios only. It is not a production selection or an availability/durability/security claim.

### Shared adapter conformance suite

A reusable behavioral suite now runs against both persistence adapters via `adapter_contract/message_store_contract.py`. Nine identical scenarios cover atomic acceptance, idempotency/conflict, rollback, unknown commit outcome recovery, concurrent same-key sends, concurrent claims, lease fencing, retry due-time and dead-letter ordering/recipient isolation.

GitHub Actions [run #45338191026](https://github.com/Elusivedamir/jet/actions/runs/45338191026) passed on commit `37a07c3ddcae6432a49bb39d03240890c878ff9a`:

- Reference model: 26 passed.
- SQLite: 25 existing adapter tests + 9 shared contract tests = 34 passed.
- PostgreSQL: 9 adapter-specific tests + 9 shared contract tests = 18 passed.
- Total: 78 tests passed, 0 failures, 0 errors.

The shared suite checks observable behavior while allowing adapter-specific physical schemas. SQLite continues to project dead-letter from `dead_letter_at`; PostgreSQL stores an explicit `dead_letter` state.

### PostgreSQL schema registry and logical backup/restore

The PostgreSQL POC now records schema baseline version 1 in `schema_migrations`. Existing unversioned POC schemas are adopted without losing stored message/outbox data. This is a bootstrap/version-registry step, not a full chain of historical DDL migrations.

CI also performs a disposable logical backup/restore: prepare a known message and mixed leased/pending outbox state, run `pg_dump -Fc`, create a second database, restore with `pg_restore`, then verify the message, conversation sequence and outbox states.

GitHub Actions [run #45339014346](https://github.com/Elusivedamir/jet/actions/runs/45339014346) passed on PostgreSQL 16:

- Reference model: 26 passed.
- SQLite: 34 passed.
- PostgreSQL: 21 passed (9 adapter-specific + 9 shared contract + 3 schema registry tests).
- Total: 81 tests passed, 0 failures, 0 errors.
- Backup/restore prepare, dump, restore and verification steps all passed.

This is a logical backup smoke test, not PITR, disaster-recovery, failover or host/power-loss proof.

### Serial persistence workload baseline

GitHub Actions [run #45339664701](https://github.com/Elusivedamir/jet/actions/runs/45339664701) ran the same 100-message / two-recipient / 200-outbox serial workload against both POCs on one Ubuntu runner (Python 3.12.16, PostgreSQL 16.16, SQLite 3.46.1). The JSON artifact is available [here](https://github.com/Elusivedamir/jet/actions/runs/45339664701/artifacts/14895886319).

| Metric | SQLite POC | PostgreSQL POC |
|---|---:|---:|
| Message acceptance p50 | 1.315 ms | 10.799 ms |
| Message acceptance p95 | 1.587 ms | 12.356 ms |
| Acceptance rate | 740.43 ops/s | 90.48 ops/s |
| Outbox claim + ack p50 | 3.751 ms | 30.967 ms |
| Outbox claim + ack p95 | 5.087 ms | 34.972 ms |
| Claim + ack rate | 272.13 ops/s | 33.09 ops/s |

These are observed results from one serial CI run, not stable capacity estimates. The current PostgreSQL POC opens a new connection for each operation and has no pool; the benchmark includes that lifecycle. SQLite uses a local file, while PostgreSQL uses a service container over the runner's local network. There were no concurrent workers in this benchmark, no repeated trials, no cache controls and no transport/network/device delivery. The figures do not establish that SQLite is the better production choice; they identify connection lifecycle and workload concurrency as necessary next measurements.

### Repeated serial persistence workload (five trials)

GitHub Actions [run #45340963701](https://github.com/Elusivedamir/jet/actions/runs/45340963701) passed on commit `63765b62147f48b4a20f2dd5a04058441ada0e6a`. The benchmark runs five fresh trials per adapter and alternates candidate order. Each trial accepts 100 messages and dispatches 200 recipient outbox items. All trials passed state-integrity checks.

Median results across five trials:

| Metric | SQLite POC | PostgreSQL POC |
|---|---:|---:|
| Acceptance throughput | 844.85 ops/s | 92.59 ops/s |
| Acceptance p50 / p95 | 1.116 / 1.427 ms | 10.708 / 11.408 ms |
| Outbox claim + ack throughput | 279.25 ops/s | 34.08 ops/s |
| Outbox claim + ack p50 / p95 | 3.668 / 4.901 ms | 30.688 / 34.715 ms |

The raw report is attached as [CI artifact #14894714918](https://github.com/Elusivedamir/jet/actions/runs/45340963701/artifacts/14894714918), with methodology, per-trial ranges and limitations in [PERSISTENCE_WORKLOAD_BASELINE.md](PERSISTENCE_WORKLOAD_BASELINE.md).

Interpretation remains bounded: SQLite is a local file, PostgreSQL is a service container over the runner network, and the PostgreSQL POC opens a fresh connection for each operation. This is a small serial repeatability check, not an apples-to-apples production benchmark or capacity certification. It does not select a production database.

## Product and repository guardrails

- The canonical business-plan PDF remains authoritative and was not edited.
- No product stage, pricing, feature promise, E2EE scope or SLO is approved by these experiments.
- The original `main` branch has not been changed by this engineering sequence.
- As of 2026-11-24, `project/greenfield-reset` is 30 commits ahead and 2 behind `main`; no wholesale merge to `main` is attempted until that divergence is reconciled and reviewed.
- The work is consolidated on `research/architecture-synthesis-task` and integrated into `project/greenfield-reset` through the narrow PR #19. The original `main` branch remains unchanged.

## Next engineering increment

Add a PostgreSQL connection-pool adapter variant and controlled concurrent sender/dispatcher workloads (1, 4 and 16 workers), measuring CPU, memory, connections, lock waits and error rates. Compare pool and no-pool under identical semantics before interpreting performance. Add a versioned DDL migration chain with tests from supported prior schemas. Only then consider broker/transport experiments or architecture recommendations. Keep exactly-once network delivery explicitly out of scope.
