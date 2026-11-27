# Durable outbox worker capacity findings — 2026-11-27

## Scope and evidence

This is a comparative PoC observation, not a production capacity test.

- Exact source commit for the latest revalidation: `9dbec25214df3011d2c1bfc48b7da35f6f802e53` (the harness code is unchanged from the prior validated run).
- Hosted runner class: Ubuntu 26.04 / Linux 7.0.0-1020-azure, 4 logical CPUs.
- PostgreSQL: 17.12, pinned by multi-platform manifest digest.
- Each candidate ran the same shared contract harness and a 30-second write soak at concurrency 16.
- The three hard-crash boundaries all passed for all three candidates after the shared harness was corrected: kill during recipient-inbox transaction; kill after committed outbox claim; and lost acceptance response after the database commit, followed by restart and idempotent retry.
- Candidate runs: Go [#46037451522](https://github.com/Elusivedamir/jet/actions/runs/46037451522), Node [#46037451549](https://github.com/Elusivedamir/jet/actions/runs/46037451549), Kotlin [#46037451443](https://github.com/Elusivedamir/jet/actions/runs/46037451443).

## Results

| Candidate | Accepted writes/s | Soak p50 | Soak p95 | Soak p99 | Peak server RSS | Server CPU | Completed outbox rows after soak | Pending rows | Oldest open age |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Go | **1,134.86** | 13.745 ms | **19.104 ms** | **22.622 ms** | **19,208 KiB** | 17.34 s | 2,325 | 32,837 | 30 s |
| Node | 772.24 | **13.296 ms** | 55.471 ms | 88.676 ms | 99,632 KiB | 20.38 s | 1,500 | 22,801 | 30 s |
| Kotlin | 708.64 | 17.108 ms | 55.011 ms | 83.092 ms | 412,868 KiB | 37.91 s | 2,181 | 20,196 | 29 s |

All three had zero request errors during the 30-second soak. Each candidate completed the three crash/restart cases and the shared contract probe.

The completed/pending outbox counts include the crash and contract fixture messages created before the soak. The terminal-failure count was 0 for Go and Kotlin and 1 for Node; the Node row's origin has not yet been identified and must be inspected before treating it as a production failure or a harmless fixture.

## Main finding: producer throughput is not delivery throughput

All three workers currently claim a batch and dispatch items sequentially:

- Go: `RunOutboxWorker` claims 20 rows and dispatches each row in a serial loop.
- Node: `runWorker` claims 20 rows and awaits each dispatch serially.
- Kotlin: the scheduled poll claims 20 rows and calls `dispatch` in a serial `forEach`.

The soak accepted approximately 807–1,261 writes/s, while the outbox had tens of thousands of pending rows at the end of 30 seconds. The oldest open delivery was 29–30 seconds old and p95 completed-delivery latency was approximately 26.6–28.1 seconds. The current single-worker/serial-dispatch design is therefore a shared throughput bottleneck and the API acceptance rate must not be presented as end-to-end delivered-message throughput.

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


## Bounded concurrency implementation — awaiting CI evidence

The comparison branch now has configurable, bounded outbox dispatch in all three PoCs:
- Go: semaphore-limited goroutines; configuration `OUTBOX_WORKER_CONCURRENCY`.
- Node.js/TypeScript: bounded async worker loops; configuration `OUTBOX_WORKER_CONCURRENCY`.
- Kotlin/Spring: fixed-size executor and fixed-delay batch poller; configuration `JET_WORKER_CONCURRENCY`.
- Valid range is 1..16; default remains 1. Each poll claims at most 20 rows and does not claim another batch until the current batch finishes.
- CI uses a normalized PostgreSQL client pool maximum of 40 for each candidate.
- Each worker-concurrency matrix cell (1, 4, 8, 16) runs the shared crash/contract harness, three sequential 30-second producer-soak repetitions, and a queue-drain window up to 60 seconds with 5-second samples.
- The 12-cell matrix is pending. No new performance claim is made until every relevant run and artifact has been inspected. The three crash-recovery cases remain mandatory at each setting.


## First full matrix — pre-fix diagnostic, not final comparison

Run head: `a890811e6b26b597f3d4e556d98d667b05df6cea`  
Runs: Node [46040365281](https://github.com/Elusivedamir/jet/actions/runs/46040365281), Go [46040365209](https://github.com/Elusivedamir/jet/actions/runs/46040365209), Kotlin [46040365411](https://github.com/Elusivedamir/jet/actions/runs/46040365411).

All 12 concurrency cells passed the three crash-recovery cases, including the lost-acceptance-response scenario. All producer-soak repetitions had zero HTTP request errors. Kotlin's functional and crash tests passed at all four settings; its workflow failed only the conservative dependency-license gate, as expected from the three review-required artifacts. Node and Go workflows passed their complete candidate gates.

The measured median producer-acceptance rates and 60-second queue-drain rates were:

| Candidate | Workers | Median producer writes/s | Drain deliveries/s | Peak RSS MiB | CPU seconds | Pending after drain | Terminal failures |
|---|---:|---:|---:|---:|---:|---:|---:|
| Go | 1 | 640 | 79.9 | 19.3 | 61.6 | 47,751 | 0 |
| Go | 4 | 580 | 79.9 | 19.8 | 56.3 | 42,367 | 0 |
| Go | 8 | 624 | 79.9 | 20.6 | 59.0 | 45,664 | 0 |
| Go | 16 | 692 | 79.9 | 21.9 | 64.6 | 51,516 | 0 |
| Node | 1 | 443 | 67.3 | 99.5 | 36.1 | 31,092 | 1 |
| Node | 4 | 1,010 | 76.9 | 97.9 | 55.1 | 80,097 | 1 |
| Node | 8 | 553 | 75.3 | 102.0 | 60.5 | 39,289 | 1 |
| Node | 16 | 531 | 75.3 | 97.4 | 59.3 | 37,125 | 1 |
| Kotlin | 1 | 721 | 73.6 | 389.9 | 71.8 | 53,384 | 0 |
| Kotlin | 4 | 819 | 76.6 | 267.6 | 73.6 | 61,293 | 0 |
| Kotlin | 8 | 1,294 | 76.9 | 382.9 | 61.2 | 106,071 | 0 |
| Kotlin | 16 | 1,428 | 77.3 | 286.2 | 74.7 | 115,644 | 0 |

**Interpretation and limitations**
- GitHub-hosted runners were separate and noisy: API acceptance rate varied substantially between cells, so these numbers are diagnostic only and must not be used to select a language/runtime winner.
- Delivery throughput clustered tightly at roughly 67–80 deliveries/s for every candidate and concurrency level. This is not a meaningful response to raising worker concurrency.
- Code inspection identified a shared structural throttle: each implementation waited 250ms after every claimed batch, even when the batch contained all 20 rows and the queue was still backlogged. That limits the claim loop to approximately 20 / 0.25 = 80 rows/s, explaining the observed delivery plateau.
- The worker loops have now been changed so a full 20-row batch is followed by an immediate next claim; the 250ms delay applies only after an empty/partial batch or a transient DB error. Bounded dispatch concurrency, batch size, lease duration and DB pool size are unchanged.
- The complete matrix above is **superseded** for final stack selection. A corrected-head matrix must be run and all artifacts inspected.
- Node emitted one terminal-failure row in each concurrency cell. The cause has not yet been classified; this remains an open investigation, not an accepted baseline.
- Queue did not drain to zero in any 60-second window. This confirms the worker bottleneck but is not a production SLO or capacity claim.


## Corrected worker matrix — results at head `6593d501dcdb8921e221edffc142c368f2ea1e0b`

The corrected 12-cell matrix completed on the exact current head. Each cell ran the full functional contract and three 30-second producer periods (the first with the complete contract; the next two producer-only), then sampled the outbox drain at 5-second intervals for up to 60 seconds. Each cell retained batch 20, 250ms idle poll, 15s lease and pool max 40.

Runs:
- Go [#46041977725](https://github.com/Elusivedamir/jet/actions/runs/46041977725) — all four concurrency cells passed.
- Node [#46041977599](https://github.com/Elusivedamir/jet/actions/runs/46041977599) — all four concurrency cells passed.
- Kotlin [#46041977715](https://github.com/Elusivedamir/jet/actions/runs/46041977715) — all four functional/crash/soak cells passed; the overall workflow failed only the conservative CycloneDX license policy (and one inventory-generation step in one cell). No license exceptions were added.
- Security [#46041977777](https://github.com/Elusivedamir/jet/actions/runs/46041977777) — all seven jobs passed.

| Candidate | Workers | Median producer writes/s | Median producer p95 ms | Peak RSS MiB | Server CPU s | Open rows after soak | Drain seconds | Zero by 60s | Terminal rows |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| Go | 1 | 1,017 | 55.3 | 19.9 | 52.6 | 41,151 | >60 | no | 0 |
| Go | 4 | 697 | 80.5 | 20.1 | 50.1 | 17,596 | 35.67 | yes | 0 |
| Go | 8 | 495 | 117.0 | 21.4 | 40.2 | 4,625 | 10.22 | yes | 0 |
| Go | 16 | 675 | 85.3 | 22.9 | 52.3 | 0 | 0.08 | yes | 0 |
| Node | 1 | 581 | 89.5 | 98.0 | 50.8 | 15,735 | 35.69 | yes | 1 |
| Node | 4 | 399 | 129.1 | 98.2 | 56.0 | 120 | 5.16 | yes | 1 |
| Node | 8 | 570 | 91.5 | 100.3 | 50.6 | 2,350 | 5.14 | yes | 1 |
| Node | 16 | 423 | 118.6 | 97.9 | 55.5 | 0 | 0.07 | yes | 1 |
| Kotlin | 1 | 1,169 | 43.1 | 305.9 | 74.5 | 9,707 | 15.42 | yes | 0 |
| Kotlin | 4 | 1,091 | 45.9 | 290.0 | 64.7 | 36,806 | 56.14 | yes | 0 |
| Kotlin | 8 | 785 | 66.3 | 315.2 | 67.3 | 0 | 0.10 | yes | 0 |
| Kotlin | 16 | 1,133 | 44.6 | 323.8 | 66.5 | 37,509 | 60.09 | yes | 0 |

**Interpretation**
- The 250ms-per-full-batch ceiling is removed: queue drain now progresses and all cells except Go/1 reached zero within the 60-second drain window. Go/1 still had 9,491 open rows at the end of the window.
- A zero/near-zero drain time means the worker kept up during the preceding producer soak; it does not mean the post-soak worker was faster than another cell.
- Backlog sizes differ substantially because producer acceptance rates and hosted runner load differed. Drain times must be read alongside the starting backlog, not compared as isolated speed scores.
- Go and Node ran on 4-vCPU Azure-hosted runners; Kotlin ran on a 4-vCPU AWS-hosted runner. Hosted runner noise and host differences prevent a defensible language/runtime ranking from this matrix alone.
- Node produced exactly one terminal row in each cell, consistently `attempt_count=2` and `last_error='Error: final injected failure'`. HTTP request errors were zero. The deterministic row appears tied to a failure-injection path, but its precise intended test origin has not yet been proven; keep this as an open item rather than silently treating it as benign.
- Kotlin's functional, crash-recovery and producer-soak checks passed; its license gate remains a real blocker. The known review-required dependency licenses remain unresolved, and no blanket policy exception is appropriate.
- This matrix confirms the worker-loop correction but does not establish a production SLO or select the final backend. Keep worker concurrency default at 1 until the terminal-row origin, Kotlin licensing, and a controlled repeatability pass are resolved.



## Node terminal-row root cause confirmed — 2026-11-27

Source inspection traced the deterministic Node terminal row to test-fixture leakage, not to an unexpected live-worker delivery failure:

1. `poc/node-server/test/store.test.ts` contains the test “parallel workers claim distinct outbox rows and max attempts terminate”. It intentionally sets the claimed item's in-memory `attempt_count=8` and calls `store.retry(terminal, new Error("final injected failure"))` to exercise the terminal transition.
2. The test asserts the terminal state but previously did not remove the inserted message/outbox fixtures after the suite.
3. The Node CI workflow runs `npm test` and then starts the live server and shared crash/soak harness against the same PostgreSQL service/database. The harness therefore counted the test's deliberately terminal row in its later outbox snapshot.
4. This exactly explains the stable `attempt_count=2` / `Error: final injected failure` evidence observed in each matrix cell: the DB attempt counter reflects one claim, while the in-memory item passed to `retry` was changed to 8. The unit test did not update the persisted attempt counter.

Regression patch: the Node test suite now calls a shared fixture-reset helper in both setup and teardown, with teardown running before the pool closes. The terminal-transition unit test also asserts the exact expected `last_error`. This prevents its fixture from contaminating the subsequent live-server harness while retaining explicit coverage of terminal-state behavior.

**Validation status:** root cause is source-confirmed; patch is committed, but it is not considered fixed until the exact-head Node CI run passes and the crash/soak artifact reports `terminal_failure=0` for all four worker-concurrency cells. Keep this distinction in future reporting.
