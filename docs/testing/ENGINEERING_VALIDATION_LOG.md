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

PRs #14–#18 are merged. PRs #15–#17 were merged in dependency order into their stacked parent branches; PR #18 consolidated the model and adapter work into `research/architecture-synthesis-task`.

## Consolidation validation

GitHub Actions run #38 passed the initial integrated packages. After PR #21, run #64 passed the expanded packages. After PR #25, run #70 passed:

- Reference model: 26 tests (13 message + 13 outbox).
- SQLite adapter: 25 tests.
- Total: 51 tests, 0 failures, 0 errors.

The same 51-test suite passed directly on `project/greenfield-reset` in [run #77](https://github.com/Elusivedamir/jet/actions/runs/45334776606), commit `03d558bc753cdc10ff45ce9d5e88f73a08b25c45`, Python 3.12 / Ubuntu.

## Second adapter experiment — PostgreSQL

Draft PR [#26](https://github.com/Elusivedamir/jet/pull/26) adds an independent PostgreSQL 16 / psycopg 3 adapter POC, a service-container CI workflow and a neutral comparison matrix.

- First CI attempt [run #3](https://github.com/Elusivedamir/jet/actions/runs/45335525598) exposed an API misuse: `executemany` belongs to a psycopg cursor, not the connection. All 10 tests failed during fixture setup; no adapter assertions had run.
- Corrected both bulk-insert call sites to use `db.cursor().executemany(...)`.
- Follow-up [run #5](https://github.com/Elusivedamir/jet/actions/runs/45335631811) passed all 10 PostgreSQL 16 integration tests, 0 failures, 0 errors. It compiled the adapter and tests, initialized a PostgreSQL 16 service, and exercised transactional persistence, idempotency, rollback, unknown-outcome recovery, concurrent claims, lease fencing, retry timing, dead-lettering and per-recipient ordering.

This is a first service-container integration pass, not a production-readiness result. The POC still needs migration/upgrade tests, backup/restore drills, fault injection, representative load benchmarks and operational cost analysis. PostgreSQL is not selected.

## What this proves — and what it does not

The in-memory reference models satisfy their own deterministic assertions. The SQLite adapter passes local transaction, restart, concurrency, lease, retry, dead-letter, receiver-dedup and ordering tests. The PostgreSQL POC passes the first 10 service-backed contract integration tests on PostgreSQL 16.

It does **not** prove production message delivery, exactly-once network delivery, device receipt/read, host or power-loss durability, production failover, multi-region behavior, replication, backup/restore, E2EE, security posture, throughput, availability or operating cost. Neither SQLite nor PostgreSQL is selected as Jetson's production database. No messaging server has been implemented by these experiments.

## Product and repository guardrails

- The canonical business-plan PDF remains authoritative and was not edited.
- No product stage, pricing, feature promise, E2EE scope or SLO is approved by these experiments.
- The original `main` branch has not been changed by this engineering sequence.
- As of the last recorded comparison, `project/greenfield-reset` was 30 commits ahead and 2 behind `main`; no wholesale merge to `main` is attempted until that divergence is reconciled and reviewed.
- Work is integrated into `project/greenfield-reset` through narrow, separately reviewed PRs only.

## Next engineering increment

Complete a matched migration/upgrade and fault-injection suite for PostgreSQL, then benchmark both adapters under the same controlled concurrent workload. Evaluate backup/restore and operations/cost only after deployment assumptions are documented. Keep broker/transport, E2EE and exactly-once network delivery outside this persistence decision.
