# Jetson backend stack selection scorecard — 2026-11-27

## Decision status

**No production stack is selected yet.** The three candidates remain Go + PostgreSQL, Node.js/TypeScript + PostgreSQL, and Kotlin/Spring + PostgreSQL. This scorecard defines the decision method before reading benchmark results, to avoid choosing a favorite after seeing noisy numbers.

## Decision criteria and weights

| Criterion | Weight | Evidence required |
|---|---:|---|
| Correctness and crash recovery | 25% | Shared contract plus hard SIGKILL/restart test; atomic rollback, lease recovery, idempotent retry |
| Reproducible builds and supply-chain risk | 15% | Committed lock/checksum metadata, clean install, SBOM, vulnerability and license reports |
| Performance under comparable workload | 15% | Sequential p50/p95/p99 and concurrent write throughput/p50/p95/p99 from same workload |
| Resource efficiency | 15% | Sampled server RSS, CPU ticks, runner OS/CPU metadata; same runner class and PostgreSQL service |
| Product development velocity | 15% | Clarity of code, testability, iteration cost for chat, channels, CRM, campaigns, KPI and AI integration |
| Operational simplicity | 10% | Build artifact, startup, deployment model, runtime footprint, observability and staffing burden |
| Maintainability | 5% | Type safety, code organization, ecosystem maturity, test quality and dependency discipline |

Weighted total is calculated only after every candidate has evidence. A missing or failed gate is not converted into a guessed score.

## Candidate hypotheses (not scores)

### Go + PostgreSQL
- Likely strengths: compact deployment, low runtime overhead, explicit concurrency, mature networking and database drivers.
- Risks to validate: more code must be written explicitly; domain/business feature iteration may take more effort than TypeScript; operational conventions need to be established.
- Fit hypothesis: strong candidate for the message-delivery core if crash recovery passes and measured resource/latency advantages are material.

### Node.js / TypeScript + PostgreSQL
- Likely strengths: fast product iteration, broad web ecosystem, TypeScript shared with web clients and admin interfaces, straightforward integration with AI/business workflows.
- Risks to validate: runtime memory and event-loop behavior under CPU-heavy or highly concurrent workloads; dependency graph and npm supply-chain churn.
- Fit hypothesis: strong candidate for a product-led modular backend if its measured throughput and resource use meet the target without excessive operational complexity.

### Kotlin / Spring + PostgreSQL
- Likely strengths: mature enterprise framework, explicit domain modeling, strong JVM tooling, transaction and integration ecosystem.
- Risks to validate: JVM memory/startup footprint, framework and build complexity, and whether the additional structure provides enough value for the current team and stage.
- Fit hypothesis: attractive if enterprise integrations, complex workflows and JVM expertise dominate; otherwise may be heavier than required for the first messenger core.

## Benchmark protocol

The same shared Python harness runs against all three candidates:
- five sequential rounds × 100 unique message writes;
- one concurrent write probe of 200 unique messages at concurrency 16;
- same PostgreSQL 17 service class, fixture shape, HTTP contract and CI runner class;
- p50/p95/p99/mean latency and requests/second;
- direct server process RSS sampled every 200 ms during the shared probe and CPU tick delta;
- runner platform, logical CPU count and kernel clock tick rate recorded alongside measurements.

Hosted CI runners are not a controlled laboratory: separate jobs may land on different physical hosts and measurements have noise. Treat differences below roughly 10–15% as inconclusive unless repeated runs confirm them. The current benchmark is a comparative PoC microbenchmark, not a production capacity test or SLO forecast.

## Hard gates before selecting a backend

1. Shared contract passes for all candidates.
2. Hard process-kill/restart test passes for all candidates.
3. No unexplained data loss, duplicate inbox records, or stale-worker completion.
4. Every candidate has an auditable dependency graph and SBOM; critical/high vulnerabilities and license exceptions are reviewed.
5. The selected candidate's resource and latency profile is acceptable at the expected first-year scale.
6. A second independent run confirms any material performance advantage.

## Provisional architecture direction

Keep PostgreSQL as the durable source of truth for the current PoC. Do not introduce Kafka, Redis, microservices or a separate broker solely to make the benchmark look more scalable. The production architecture should remain a modular monolith until measured throughput, operational needs or team boundaries justify a split.

The eventual decision may choose one backend language while keeping TypeScript for web/mobile-facing clients. A polyglot production backend is not the default: it increases deployment, observability, testing and staffing costs and must earn its complexity through measured value.

## Current evidence state

- Previous code-level contract/integration CI passed on the earlier implementation revision; that is not evidence for the newly added hard-crash harness.
- New CI runs are in progress for all three candidates.
- Go and Node lock artifacts are generated in CI for review, but are not yet committed lockfiles.
- Kotlin resolved dependency tree is generated in CI; this is not yet a full transitive lockfile.
- SBOM, vulnerability and license reports are not yet reviewed.
- No final stack ranking or production selection is made in this document.
