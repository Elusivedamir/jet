# Persistence workload baseline

This is a small serial comparison harness, not a load test, production SLO or architecture decision.

## Workload

The CI job runs the same workload against three variants on the same GitHub Actions runner: SQLite, PostgreSQL with a fresh connection per operation, and PostgreSQL using a `psycopg_pool` pool (min 1 / max 4).

- create one conversation with one sender and two recipients;
- accept 100 messages with unique idempotency keys;
- dispatch and acknowledge all 200 per-recipient outbox intents in sequence;
- verify message count, outbox count, conversation sequence and final dispatch states.

It records message-acceptance latency and combined claim+ack latency as p50, p95, total duration and operations/second. It also records Python/platform and database versions.

## Reproduce

The PostgreSQL CI service must be available:

```sh
python -m pip install "psycopg[binary]==3.2.6" "psycopg-pool==3.2.6"
export POSTGRES_DSN="postgresql://USER:PASSWORD@127.0.0.1:5432/DATABASE"
JET_BENCH_MESSAGES=100 python tests/benchmarks/persistence_workload_baseline.py
```

The JSON report is written to `persistence-benchmark.json` and uploaded as a GitHub Actions artifact. The first completed baseline is [run #45339664701](https://github.com/Elusivedamir/jet/actions/runs/45339664701); its [JSON artifact](https://github.com/Elusivedamir/jet/actions/runs/45339664701/artifacts/14895886319) compared SQLite with PostgreSQL's fresh-connection lifecycle. A follow-up run will add the pooled PostgreSQL variant. Historical numbers are one-run observations only.

## Interpretation limits

- One serial run on one ephemeral CI runner; no concurrency or multi-host traffic.
- No transport/network/device delivery, cold/warm cache separation, long-duration soak or repeated statistical trials.
- Both adapters are test POCs; configuration and durability settings are not production tuned.
- Latency includes each adapter's current connection lifecycle; the unpooled PostgreSQL POC opens a fresh connection per operation, while the pooled variant reuses a small connection pool and SQLite uses a local file.
- Numbers must not be extrapolated to production capacity, user count, SLO, cost or database choice.

Use the report to spot obvious regressions and guide what to measure next, not to declare a winner.
