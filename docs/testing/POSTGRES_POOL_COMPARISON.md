# PostgreSQL connection-pool comparison — five serial trials

Date: 2026-11-24  
CI: [GitHub Actions run #45343115953](https://github.com/Elusivedamir/jet/actions/runs/45342642980)  
Artifact: [raw JSON report](https://github.com/Elusivedamir/jet/actions/runs/45342642980/artifacts/14896189281)

## Scope

This experiment compares three persistence configurations using the same 100-message / two-recipient / 200-outbox serial workload:

1. SQLite local-file adapter.
2. PostgreSQL adapter opening a fresh connection per operation.
3. PostgreSQL adapter using `psycopg_pool` 3.2.6 with `min_size=1`, `max_size=4`.

Five fresh trials are run per candidate, candidate order rotates, and every trial verifies all messages, sequence values and outbox dispatch states. There is one sender and one dispatcher; no concurrent load is generated.

## Median of five trials

| Metric | SQLite | PostgreSQL fresh connection | PostgreSQL pool 1–4 |
|---|---:|---:|---:|
| Acceptance throughput | 895.00 ops/s | 94.48 ops/s | 443.39 ops/s |
| Acceptance p50 | 1.061 ms | 10.565 ms | 2.112 ms |
| Acceptance p95 | 1.319 ms | 10.994 ms | 2.775 ms |
| Outbox claim + ack throughput | 289.69 ops/s | 34.36 ops/s | 73.94 ops/s |
| Outbox claim + ack p50 | 3.586 ms | 30.589 ms | 14.780 ms |
| Outbox claim + ack p95 | 4.515 ms | 34.475 ms | 18.790 ms |

All five trials passed data-integrity and full-dispatch checks for each candidate.

## Interpretation

Pooling materially improves this PostgreSQL POC in this CI setup:

- Acceptance throughput is about 4.7× higher than the fresh-connection variant.
- Outbox claim+ack throughput is about 2.2× higher than the fresh-connection variant.
- The pooled PostgreSQL result remains slower than SQLite in this serial CI setup: about half the acceptance throughput and about one quarter of the outbox claim+ack throughput.

This is evidence that connection lifecycle was a major contributor to the initial PostgreSQL latency. It does not establish production performance or justify a database selection.

## Limitations

- SQLite uses a local file; PostgreSQL runs in a separate service container over the runner network.
- Pool size is fixed to 1–4 and tuned only for this small serial test.
- No concurrent sender/dispatcher load, saturation, queue buildup or contention profile.
- No separate measurement of pool warm-up, CPU, memory, open connections, lock waits or errors under load.
- No controlled cache regime or dedicated benchmark host.
- The benchmark is not a production SLO, capacity certification or operating-cost model.

## Next experiments

1. Run 1, 4 and 16 concurrent senders and dispatchers against pooled and unpooled PostgreSQL and SQLite.
2. Assert ordering, no duplicate claims, recipient isolation and no lost outbox items under concurrency.
3. Record CPU, memory, pool wait time, open connections, lock waits, transaction retries and error rates.
4. Compare pool sizes and queue batch limits with repeatable trials.
5. Only then produce a cost/operations comparison; do not infer production throughput from this serial harness.

No production database is selected by this report.
