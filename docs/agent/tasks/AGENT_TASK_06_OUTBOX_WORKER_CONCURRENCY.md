# Agent task 06 — bounded outbox worker concurrency comparison

**Status:** implementation committed to the comparison branch; CI matrix and correctness validation pending. Blocks final backend stack selection.  
**Priority:** high.  
**Scope:** comparative PoC only; no production-readiness claim.

## Why this task exists

The latest shared 30-second soak accepted 807–1,261 writes/s but left 23,480–36,488 pending outbox rows. Oldest open delivery was 29–30 seconds and p95 completed-delivery latency was approximately 27–28 seconds. All three candidates currently claim batches of 20 and dispatch sequentially. The same worker architecture is the bottleneck, so the current API-acceptance ranking is not an end-to-end delivery ranking.

Evidence: `docs/research/OUTBOX_WORKER_CAPACITY_FINDINGS_2026-11-27.md`.

## Objective

Run a matched experiment on Go, Node.js/TypeScript and Kotlin/Spring to determine how bounded dispatch concurrency changes:
- completed deliveries/s;
- queue depth and oldest-open age;
- p50/p95/p99 completed-delivery latency;
- retries and terminal failures;
- server RSS/CPU and database connection pressure;
- crash recovery and duplicate-claim safety.

## Experimental matrix

- Worker concurrency: **1, 4, 8, 16**.
- Hold claim batch size at **20**, poll interval at **250 ms**, and lease duration at **15 seconds** for the first matrix. Do not tune several dimensions simultaneously.
- Normalize and document database pool capacity across candidates before testing. Pool capacity must be high enough for the tested worker concurrency plus producer requests; do not silently let one runtime default to a smaller pool.
- Producer load: 16 concurrent clients, same message contract, 30-second write soak.
- After producers stop, run a **60-second drain window** and sample queue state every 5 seconds.
- Three independent 30-second producer/contract repetitions per candidate/concurrency level on the same runner class and PostgreSQL version, followed by a 60-second drain window sampled every 5 seconds.

## Implementation progress — 2026-11-27

- Added bounded, configurable dispatch concurrency (1..16; default 1) to Go, Node.js/TypeScript and Kotlin/Spring.
- Each candidate claims at most 20 rows per batch and waits for that batch to finish before claiming again; no unbounded in-memory backlog is introduced.
- Normalized CI database pool maximum to 40 connections for all three candidates.
- CI workflows now use a 4-value matrix (1/4/8/16) with fail-fast disabled.
- Shared crash harness now performs three 30-second contract/producer soak repetitions per matrix cell, records per-repetition results and process resource metrics, then samples outbox state every 5 seconds for up to 60 seconds.
- The matrix has not yet completed; no concurrency winner or throughput improvement is claimed.

## Implementation constraints

1. Preserve atomic sender-idempotency + message + sequence + outbox commit.
2. Preserve `FOR UPDATE SKIP LOCKED`, lease tokens, expiry fencing and idempotent recipient-inbox insertion.
3. No worker may dispatch the same claimed row twice concurrently.
4. A stale worker must not complete or retry after its lease expires or is reclaimed.
5. Retry and terminal-failure behavior must remain identical across candidates.
6. Concurrency must be bounded and configurable for the PoC; default remains 1 until results are reviewed.
7. Do not introduce Kafka, Redis, a new broker or microservices for this experiment.

## Required tests

- Parallel workers never claim the same outbox row.
- Worker pool concurrency never exceeds the configured bound.
- Kill one worker during a recipient-inbox transaction; recovery after lease expiry produces exactly one inbox row.
- Kill/restart the application during a batch; all committed messages eventually reach the inbox exactly once.
- Expired/stale lease tokens cannot mark delivery complete or schedule retries.
- No lost acceptance response; retry returns the original message ID.
- Queue-drain phase ends with an explicit remaining-row count, not a presumed empty queue.

## Deliverables

- Same-runner evidence table for all 12 matrix cells (3 candidates × 4 concurrency levels), with three-run medians and ranges.
- Queue-depth-over-time samples and drain curves.
- Updated `OUTBOX_WORKER_CAPACITY_FINDINGS_2026-11-27.md`, `STACK_POC_RESULTS.md`, scorecard and ADR-0002.
- Engineering validation log with exact commits, CI run URLs, failed experiments and fixes.
- Manual self-review (not independent) after each implementation; no separate agents.

## Acceptance

The task is complete only when correctness/recovery tests pass for each candidate and the report shows the measured throughput/backlog/latency trade-off. Do not choose a final backend solely by accepted HTTP writes/s. If no configuration drains the queue within the 60-second window, record the remaining backlog and design the next experiment; do not relax the acceptance criteria to manufacture a pass.
