# Persistence and dispatch adapter comparison plan

Status: experiment plan only. No production technology is selected by this document.

## Objective

Compare the existing SQLite adapter experiment with one independent persistence candidate and, only where useful, a broker-backed dispatch sandbox. The comparison must use the adapter-neutral message and outbox contracts. It must not turn a prototype result into a production architecture decision.

## Candidate strategy

1. Keep the existing SQLite adapter as the baseline; do not rewrite it during the comparison.
2. Evaluate PostgreSQL as the first independent transactional-store candidate because it can exercise row-level locking, transactional outbox writes, concurrent workers and operational backup/restore workflows that differ materially from SQLite.
3. Do not add Redis or a message broker merely to increase component count. Consider a broker only after the PostgreSQL adapter establishes whether database polling/claiming is an actual bottleneck or operational liability.
4. Keep all candidate-specific code behind the same narrow adapter contract. No product code or production dependency is introduced by the comparison.

PostgreSQL is a test candidate, not an approved production choice. A broker is not assumed necessary.

## Required contract parity

Every candidate must demonstrate, with deterministic automated tests:

- atomic message + idempotency + per-recipient outbox-intent persistence;
- safe handling of an unknown commit outcome and repeated client idempotency keys;
- exclusive claims under concurrent workers;
- lease expiry, reclaim and fencing against stale acknowledgements;
- bounded retries, durable retry timestamps and dead-letter transition;
- per-recipient/per-conversation ordering without blocking unrelated recipients;
- receiver-side idempotency for the crash-after-side-effect-before-ack boundary;
- schema migration from the immediately previous candidate schema;
- restart recovery and documented failure behavior.

A candidate that cannot meet a contract item must report the gap explicitly rather than weaken the shared contract.

## Comparative dimensions

| Dimension | Evidence required |
|---|---|
| Correctness | Same contract suite and candidate-specific integration tests |
| Transaction boundary | Demonstrate message, idempotency record and outbox intent commit/rollback together |
| Claim concurrency | Multi-worker contention test; no duplicate active lease for one item |
| Fencing | Expired/stale worker cannot ack, release or overwrite a newer lease |
| Ordering/isolation | Same-recipient order preserved; independent recipient/conversation progresses |
| Recovery | Process termination at defined transaction/dispatch boundaries; recovery procedure recorded |
| Migration | Forward migration from previous schema and repeatable clean install |
| Backup/restore | Documented local procedure and restore verification; no unsupported durability claims |
| Operations | Required services, deployment steps, health checks, logs, metrics and operator intervention |
| Cost | Explicit local/dev and small-production resource assumptions; distinguish measured from estimated costs |
| Complexity | Number of services, dependencies, failure modes and operational responsibilities |

## Test protocol

- Pin candidate and tool versions in the experiment record.
- Run the same contract-level tests against each adapter.
- Use isolated databases/schemas per test and deterministic fixtures.
- Use barriers/latches for concurrency tests rather than timing sleeps where possible.
- Record test counts, runtime, environment, commit SHA and all skipped/unavailable tests.
- Run failure injection only at documented boundaries; label process-kill tests separately from host/power-loss tests.
- Run a small repeatable throughput/latency experiment only after correctness parity. Report workload, concurrency, payload sizes, hardware/runtime and percentile methodology. Do not extrapolate it into a production SLO.
- Record resource use and operational steps. Separate observed measurements from estimates and assumptions.

## Decision gates

1. **Contract gate:** no candidate comparison is meaningful until the full shared contract suite passes.
2. **Recovery gate:** transaction, lease and retry recovery scenarios pass or have explicitly accepted gaps.
3. **Operations gate:** backup/restore, migration, health and observability procedures are documented.
4. **Cost/complexity gate:** compare total operational burden, not only query speed.
5. **Architecture gate:** only after evidence review may a recommendation be made. The recommendation must remain consistent with the canonical business plan and its staged rollout.

## Explicit non-goals

- No production database, broker, cloud, transport or deployment topology is selected here.
- No exactly-once network delivery claim.
- No E2EE protocol or cryptographic library decision.
- No production throughput, availability, durability or security certification.
- No changes to the canonical business-plan PDF, product stages, pricing or feature commitments.
- No changes to `main`.

## Immediate implementation sequence

1. Inspect the current CI workflow and test discovery rules.
2. Define the adapter interface and conformance test harness without changing SQLite behavior.
3. Add PostgreSQL integration tests behind an explicit service-enabled CI job; keep the default lightweight CI deterministic.
4. Verify migration, concurrency, lease fencing, retries and crash recovery.
5. Publish a measured comparison and recommendation with limitations.

