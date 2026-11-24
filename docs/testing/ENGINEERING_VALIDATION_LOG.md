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

## Product and repository guardrails

- The canonical business-plan PDF remains authoritative and was not edited.
- No product stage, pricing, feature promise, E2EE scope or SLO is approved by these experiments.
- The original `main` branch has not been changed by this engineering sequence.
- As of 2026-11-24, `project/greenfield-reset` is 30 commits ahead and 2 behind `main`; no wholesale merge to `main` is attempted until that divergence is reconciled and reviewed.
- The work is consolidated on `research/architecture-synthesis-task` and integrated into `project/greenfield-reset` through the narrow PR #19. The original `main` branch remains unchanged.

## Next engineering increment

Next, compare a second storage technology or a real broker/transport sandbox against the adapter-neutral contracts. Measure operational behavior and cost before selecting any production persistence or delivery components. Keep the exactly-once network delivery claim explicitly out of scope.
