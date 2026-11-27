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


## First comparable CI evidence — 2026-11-27

All three candidates have at least one successful hard SIGKILL/restart run with the shared harness. The latest Node and Kotlin results below are from the same runner class (Ubuntu 26.04, Linux kernel 7.0.0-1020-azure, 4 logical CPUs, PostgreSQL 17). Go's currently available run is an earlier baseline and used the pre-remediation Go toolchain; it must be repeated after the dependency update.

| Candidate / run | Crash recovery | Sampled peak RSS | Server CPU ticks / 100 Hz | Concurrent writes | Concurrent p50 / p95 / p99 |
|---|---|---:|---:|---:|---:|
| Go, run 87 [46025003199](https://github.com/Elusivedamir/jet/actions/runs/46025003199) | PASS | 17,708 KiB | 64 (0.64 s) | 341.2 req/s | 15.956 / 380.520 / 384.246 ms |
| Node, run 96 [46026159379](https://github.com/Elusivedamir/jet/actions/runs/46026159379) | PASS | 85,572 KiB | 84 (0.84 s) | 755.12 req/s | 14.363 / 48.446 / 68.062 ms |
| Kotlin, run 96 [46026159044](https://github.com/Elusivedamir/jet/actions/runs/46026159044) | PASS | 274,064 KiB | 392 (3.92 s) | 535.21 req/s | 23.137 / 69.054 / 103.798 ms |

Sequential p50 values across the five rounds:
- Go baseline: approximately 1.63–1.69 ms in four rounds, with one noisy round.
- Node run 96: 1.639–2.005 ms.
- Kotlin run 96: 2.192–3.769 ms.

### Security and reproducibility observations

- Node run 96: committed npm lockfile passed `npm ci`; npm audit reported zero advisories; Trivy found no vulnerabilities in the scanned npm dependency graph. License inventory contained MIT/ISC/Apache-2.0 packages and the project root package is marked `UNLICENSED` (project licensing decision remains open).
- Kotlin run 96: Maven strict-checksum verification, dependency tree and CycloneDX SBOM succeeded; after overriding PostgreSQL JDBC to 42.7.12, Trivy reported no vulnerabilities in the scanned dependency graph. SBOM contains 42 components.
- Go run 87: hard crash recovery and shared contract passed, but govulncheck reported 24 reachable advisories on Go 1.24.13, pgx 5.7.2 and x/text 0.21.0. Remediation is committed (Go 1.26.11, pgx 5.9.2, x/text 0.41.0); the remediated Go CI/security result and refreshed go.sum are not yet confirmed.

### Preliminary interpretation (not a final decision)

- Go has a major memory-footprint advantage in the observed run (about 17 MiB versus 84 MiB Node and 268 MiB Kotlin) and low CPU use, but its concurrent p95/p99 in the only available baseline run were poor and its security gate failed. The patched Go version must be retested before it can be ranked.
- Node currently has the best observed concurrent throughput and tail latency, with substantially lower memory use than Kotlin. It also offers a shared TypeScript ecosystem for web/admin clients and fast iteration on CRM, campaigns, KPI and AI-facing product features.
- Kotlin has a strong framework and enterprise ecosystem, but in this PoC it used roughly 3.2× Node's RSS and had lower throughput. It remains viable if enterprise framework capabilities materially reduce future engineering cost.

**Provisional front-runner: Node.js/TypeScript for the first Jetson backend**, because it currently leads the measured concurrent write probe, has clean npm/Trivy results, and aligns with fast product iteration. This is not a production-stack selection: Go remains a serious alternative if the patched Go run removes the security findings and improves concurrent tail latency. Repeat at least three concurrent probes per candidate before locking the decision.

### Measurement caveats

- The Go row is an earlier run on a vulnerable toolchain and is not directly comparable to the later Node/Kotlin runs.
- RSS is sampled only for the server process, not PostgreSQL or the runner; CPU ticks are process ticks, not whole-host CPU.
- The benchmark is a short 200-write concurrency-16 probe, not a sustained-load test, capacity estimate or SLO.
- Different hosted runners can vary despite matching OS and logical CPU count. Do not rank candidates from a single run.
