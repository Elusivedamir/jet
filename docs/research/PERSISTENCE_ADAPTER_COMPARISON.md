# Persistence and outbox adapter comparison

Status: research framework. No production database, broker or deployment topology is selected.

## Candidates under test

- SQLite adapter: standard-library implementation already present in `tests/sqlite_adapter/`.
- PostgreSQL adapter: independent psycopg 3 experiment in `tests/postgres_adapter/`.

Neither experiment is production application code. Both are evaluated against `docs/testing/OUTBOX_DISPATCH_CONTRACT.md` and the message lifecycle contracts.

## Comparison dimensions

| Dimension | Evidence required | SQLite experiment | PostgreSQL experiment |
|---|---|---|---|
| Atomic message + idempotency + recipient outbox | transaction tests and rollback boundaries | local file-backed adapter tests | PostgreSQL service-backed integration tests |
| Conversation sequence allocation | concurrent send test, no gaps on rollback | SQLite write transaction | row lock on conversation |
| Idempotent retry | same key returns same message; conflicting payload rejected | tested | tested |
| Worker claim exclusivity | competing workers cannot own same row | SQLite transaction serialization | row locks with `SKIP LOCKED` |
| Lease fencing | expired/stale token cannot acknowledge | tested | tested |
| Retry and dead-letter | due time, bounded attempts, expiry | tested | tested |
| Per-recipient ordering | later message cannot overtake earlier pending item | tested | tested |
| Crash/restart | process termination, commit/unknown response | local process tests | response-loss transaction boundary; process/power-loss not yet tested |
| Backup/restore | documented and exercised restore drill | not tested | not tested |
| Migration | forward migration from prior schema | limited retry-column migration tested | initial schema only |
| Operations | deployment, monitoring, connection pool, upgrades, recovery | not measured | not measured |
| Cost | representative hosting, storage, backup, network and operator time | not measured | not measured |
| Scale | realistic concurrency, throughput and latency distributions | not measured | not measured |

## Rules for a fair comparison

1. Run the same contract scenarios and report differences rather than changing acceptance criteria to suit one adapter.
2. Record exact database and driver versions, CI environment, test count and failures.
3. Keep functional correctness separate from operational suitability and cost.
4. Do not infer production reliability from unit or service-container tests.
5. No weighted winner until representative workload, expected scale, hosting region, recovery objectives and operational constraints are known.
6. Keep broker/transport, client delivery, E2EE and user-facing product requirements outside the persistence decision.

## Open work after the first PostgreSQL CI run

- Review the adapter and test failures, if any, against the SQL semantics.
- Add PostgreSQL migration and upgrade-path tests.
- Add crash/fault injection and a backup/restore drill.
- Benchmark both adapters under the same representative concurrent workload.
- Estimate self-hosted and managed-service operational costs only after deployment assumptions are documented.
