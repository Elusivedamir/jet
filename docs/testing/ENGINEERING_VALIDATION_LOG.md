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
