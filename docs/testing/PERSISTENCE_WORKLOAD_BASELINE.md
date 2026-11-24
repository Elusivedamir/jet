# Persistence workload baseline — five serial trials

Date: 2026-11-24  
Commit: `63765b62147f48b4a20f2dd5a04058441ada0e6a`  
CI: [GitHub Actions run #45340963701](https://github.com/Elusivedamir/jet/actions/runs/45340963701)  
Artifact: [raw JSON report](https://github.com/Elusivedamir/jet/actions/runs/45340963701/artifacts/14894714918)

## Workload and environment

- Python 3.12.16, Ubuntu GitHub-hosted runner.
- PostgreSQL 16 service container; SQLite 3.46.1 local file.
- Five fresh trials per adapter; candidate execution order alternates.
- 100 accepted messages per trial, two recipients per message, 200 outbox items.
- One serial sender and one serial dispatcher.
- Per-operation adapter lifecycle, including current connection creation, is measured.
- Every trial verified 100 stored messages, 200 outbox rows, correct conversation sequence and all outbox items dispatched.

## Median of five trials

| Metric | SQLite POC | PostgreSQL POC |
|---|---:|---:|
| Message acceptance throughput | 844.85 ops/s | 92.59 ops/s |
| Message acceptance p50 | 1.116 ms | 10.708 ms |
| Message acceptance p95 | 1.427 ms | 11.408 ms |
| Outbox claim + ack throughput | 279.25 ops/s | 34.08 ops/s |
| Outbox claim + ack p50 | 3.668 ms | 30.688 ms |
| Outbox claim + ack p95 | 4.901 ms | 34.715 ms |

All five trials passed the data-integrity and full-dispatch checks for both adapters.

## Trial ranges

| Metric | SQLite min–max | PostgreSQL min–max |
|---|---:|---:|
| Acceptance throughput | 794.53–872.61 ops/s | 89.26–93.21 ops/s |
| Acceptance p95 | 1.408–1.499 ms | 11.211–12.835 ms |
| Claim + ack throughput | 267.53–282.52 ops/s | 32.21–42.93 ops/s |
| Claim + ack p95 | 4.675–5.229 ms | 34.029–44.911 ms |

## Interpretation and limitations

This is a repeatability check for a small serial workload, not a production capacity test. SQLite uses a local file; PostgreSQL is a separate service container reached over the runner's local network. The PostgreSQL POC currently opens a new connection for each operation and has no connection pool. The results therefore include a material connection/network lifecycle difference.

The current numbers show that the SQLite prototype is faster for this exact local serial CI setup. They do **not** establish that SQLite is the right production database. The comparison has no concurrent worker load, no connection-pool variant, no controlled cache regime, no dedicated benchmark host, no transport/device traffic and no multi-runner statistical confidence.

## Next experiments

1. Add a PostgreSQL connection-pool adapter variant without changing the current baseline implementation.
2. Compare pooled and unpooled PostgreSQL with the same transaction semantics and workload.
3. Add controlled concurrent senders and dispatchers (1, 4 and 16 workers), with correctness assertions and bounded timeouts.
4. Measure CPU, memory, database connections, lock waits and error rates alongside latency/throughput.
5. Repeat on a controlled host before making architecture or operating-cost recommendations.

No production database is selected by this report.
