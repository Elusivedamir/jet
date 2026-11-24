# Persistence workload baseline

This is a five-trial serial comparison harness for SQLite, PostgreSQL fresh connections and PostgreSQL connection pooling. It is not a load test, production SLO or architecture decision.

## Workload

The CI job runs the same workload against SQLite and PostgreSQL on the same GitHub Actions runner:

- create one conversation with one sender and two recipients;
- accept 100 messages with unique idempotency keys in each of five fresh trials;
- dispatch and acknowledge all 200 per-recipient outbox intents in sequence;
- verify message count, outbox count, conversation sequence and final dispatch states.

It records message-acceptance latency and combined claim+ack latency as p50, p95, total duration and operations/second. It also records Python/platform and database versions.

## Reproduce

The PostgreSQL CI service must be available:

```sh
python -m pip install "psycopg[binary]==3.2.6"
export POSTGRES_DSN="postgresql://USER:PASSWORD@127.0.0.1:5432/DATABASE"
JET_BENCH_MESSAGES=100 python tests/benchmarks/persistence_workload_baseline.py
```

The JSON report is written to `persistence-benchmark.json` and uploaded as a GitHub Actions artifact. The first completed baseline is [run #45339664701](https://github.com/Elusivedamir/jet/actions/runs/45339664701); its [JSON artifact](https://github.com/Elusivedamir/jet/actions/runs/45339664701/artifacts/14895886319) recorded SQLite acceptance p50/p95 of 1.315/1.587 ms and PostgreSQL 10.799/12.356 ms; SQLite claim+ack p50/p95 of 3.751/5.087 ms and PostgreSQL 30.967/34.972 ms. These values include each adapter's current connection lifecycle and are one-run observations only.

## Interpretation limits

- One serial run on one ephemeral CI runner; no concurrency or multi-host traffic.
- No transport/network/device delivery, cold/warm cache separation, long-duration soak or repeated statistical trials.
- Both adapters are test POCs; configuration and durability settings are not production tuned.
- Latency includes each adapter's current connection lifecycle; the PostgreSQL POC opens a fresh connection per operation and has no pool, while SQLite uses a local file.
- Numbers must not be extrapolated to production capacity, user count, SLO, cost or database choice.

Use the report to spot obvious regressions and guide what to measure next, not to declare a winner.

## Five-trial baseline (2026-11-24)

The harness now runs five fresh trials per adapter and alternates execution order. Set `JET_BENCH_TRIALS=5` (minimum supported: 3) and `JET_BENCH_MESSAGES=100`. The latest repeatability run is [#45340963701](https://github.com/Elusivedamir/jet/actions/runs/45340963701); its [raw JSON artifact](https://github.com/Elusivedamir/jet/actions/runs/45340963701/artifacts/14894714918) reports median acceptance throughput of 844.85 ops/s for SQLite and 92.59 ops/s for PostgreSQL, and median outbox claim+ack throughput of 279.25 and 34.08 ops/s respectively. All five trials passed data-integrity checks. See [the full report](../../docs/testing/PERSISTENCE_WORKLOAD_BASELINE.md) for latency ranges and limitations. This is not a production capacity comparison: SQLite is local-file and PostgreSQL is a service container; the PostgreSQL adapter opens a new connection per operation.

## PostgreSQL pool comparison

The current benchmark compares the PostgreSQL adapter's new-connection-per-operation behavior with the test-only `PooledPostgreSQLMessageStore` (psycopg-pool 3.2.6, min=1/max=4), alongside SQLite. The same message and outbox workflow is used for all candidates. Each candidate runs five fresh trials with rotating execution order. The benchmark artifact contains per-trial results, median and min/max ranges. The pool is warmed during adapter initialization; pool warm-up is not reported as a separate measurement. No concurrency is used in this stage.
