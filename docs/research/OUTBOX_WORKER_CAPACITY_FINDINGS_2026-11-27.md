# Durable outbox worker capacity findings — 2026-11-27

## Scope and evidence

This is a comparative PoC observation, not a production capacity test.

- Exact source commit: `7a7301310cb6757cfe17046158c6da185138deea`.
- Hosted runner class: Ubuntu 26.04 / Linux 7.0.0-1020-azure, 4 logical CPUs.
- PostgreSQL: 17.12, pinned by multi-platform manifest digest.
- Each candidate ran the same shared contract harness and a 30-second write soak at concurrency 16.
- The three hard-crash boundaries all passed for all three candidates after the shared harness was corrected: kill during recipient-inbox transaction; kill after committed outbox claim; and lost acceptance response after the database commit, followed by restart and idempotent retry.
- Candidate runs: Go [#46036340867](https://github.com/Elusivedamir/jet/actions/runs/46036340867), Node [#46036340934](https://github.com/Elusivedamir/jet/actions/runs/46036340934), Kotlin [#46036340835](https://github.com/Elusivedamir/jet/actions/runs/46036340835).

## Results

| Candidate | Accepted writes/s | Soak p50 | Soak p95 | Soak p99 | Peak server RSS | Server CPU | Completed outbox rows after soak | Pending rows | Oldest open age |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Go | 1,260.92 | 12.148 ms | 17.933 ms | 21.498 ms | 18,880 KiB | 17.68 s | 2,465 | 36,488 | 30 s |
| Node | 807.32 | 13.387 ms | 52.003 ms | 85.685 ms | 99,660 KiB | 16.58 s | 1,500 | 23,852 | 30 s |
| Kotlin | 816.98 | 15.167 ms | 45.701 ms | 71.322 ms | 307,312 KiB | 36.18 s | 2,147 | 23,480 | 29 s |

All three had zero request errors during the 30-second soak. Each candidate completed the three crash/restart cases and the shared contract probe.

The completed/pending outbox counts include the crash and contract fixture messages created before the soak. The terminal-failure count was 0 for Go and Kotlin and 1 for Node; the Node row's origin has not yet been identified and must be inspected before treating it as a production failure or a harmless fixture.

## Main finding: producer throughput is not delivery throughput

All three workers currently claim a batch and dispatch items sequentially:

- Go: `RunOutboxWorker` claims 20 rows and dispatches each row in a serial loop.
- Node: `runWorker` claims 20 rows and awaits each dispatch serially.
- Kotlin: the scheduled poll claims 20 rows and calls `dispatch` in a serial `forEach`.

The soak accepted approximately 807–1,261 writes/s, while the outbox had tens of thousands of pending rows at the end of 30 seconds. The oldest open delivery was 29–30 seconds old and p95 completed-delivery latency was approximately 27–28 seconds. The current single-worker/serial-dispatch design is therefore a shared throughput bottleneck and the API acceptance rate must not be presented as end-to-end delivered-message throughput.

This is not evidence that the underlying language is inherently responsible: the same serial worker design exists in all three candidates. The current stack comparison is incomplete until worker concurrency and queue-drain behavior are tested on equivalent terms.

## Next experiment required before final stack selection

1. Add a bounded parallel dispatch worker pool to each candidate, keeping transaction boundaries, lease fencing, idempotency and retry semantics unchanged.
2. Test at least concurrency 1, 4, 8 and 16 with the same batch size and lease duration; do not silently change several parameters at once.
3. Add a fixed drain window after the 30-second producer soak and record queue depth, oldest-open age, completed deliveries/s, p50/p95/p99 delivery latency, retries and terminal failures.
4. Repeat on the same runner class and compare medians across at least three runs per configuration.
5. Add a test proving no duplicate ownership and no stale-worker completion under concurrent dispatch and process restart.
6. Revisit the Go ADR only after this matched end-to-end worker comparison.

No production SLO, capacity estimate or production-readiness claim follows from these short hosted-runner tests.

## Kotlin license gate remains open

Kotlin's crash-recovery and contract checks passed, but the workflow remains failed because the conservative license policy requires human/legal review for:

- `logback-classic 1.5.18`: EPL-1.0 / LGPL;
- `logback-core 1.5.18`: EPL-1.0 / LGPL;
- `jakarta.annotation-api 2.1.1`: EPL-2.0 / GPL-2.0-with-classpath-exception.

These entries were not auto-allowed. The Kotlin candidate is not fully supply-chain-cleared until an owner-approved legal decision or a dependency change resolves the gate.
