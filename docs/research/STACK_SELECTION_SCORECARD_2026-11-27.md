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


## Repeated concurrent CI evidence — 2026-11-27

The shared harness now performs three independent rounds of 200 writes at concurrency 16. The latest Node and Kotlin runs use the same runner class (Ubuntu 26.04, Linux kernel 7.0.0-1020-azure, 4 logical CPUs, PostgreSQL 17). Go's available result remains an earlier single-probe baseline on the pre-remediation toolchain.

| Candidate / run | Crash recovery | Sampled peak RSS | CPU ticks / 100 Hz | Median throughput | Median concurrent p50 / p95 / p99 |
|---|---|---:|---:|---:|---:|
| Go baseline, run 87 [46025003199](https://github.com/Elusivedamir/jet/actions/runs/46025003199) | PASS | 17,708 KiB | 64 (0.64 s) | 341.2 req/s (one probe) | 15.956 / 380.520 / 384.246 ms |
| Node, run 101 [46026586747](https://github.com/Elusivedamir/jet/actions/runs/46026586747) | PASS | 87,252 KiB | 179 (1.79 s) | 565.87 req/s | 21.127 / 64.592 / 94.321 ms |
| Kotlin, run 101 [46026586769](https://github.com/Elusivedamir/jet/actions/runs/46026586769) | PASS | 269,716 KiB | 487 (4.87 s) | 599.28 req/s | 20.612 / 62.050 / 80.862 ms |

Node's three throughput rounds were 489.55, 566.14 and 565.87 req/s. Kotlin's were 581.78, 599.28 and 622.78 req/s. Kotlin's approximately 6% median throughput advantage is small enough to be within expected hosted-runner and short-test variance; its p95 was also close. Kotlin used about 3.1× Node's sampled RSS and 2.7× its process CPU ticks during the probe.

### Security and reproducibility observations

- Node run 101: committed npm v3 lockfile passed `npm ci`; npm audit reported zero advisories; Trivy found zero vulnerabilities in the scanned npm dependency graph. The license inventory includes MIT/ISC/Apache-2.0 dependencies; the root project package is `UNLICENSED`, so the product's own licensing decision remains open.
- Kotlin run 101: Maven strict-checksum verification, dependency tree and CycloneDX SBOM succeeded; after PostgreSQL JDBC was raised to 42.7.12, Trivy reported zero vulnerabilities in the scanned dependency graph. SBOM contains 42 components.
- Go run 87: hard crash recovery and shared contract passed, but govulncheck reported 24 reachable advisories on Go 1.24.13, pgx 5.7.2 and x/text 0.21.0. Remediation is committed (Go 1.26.11, pgx 5.9.2, x/text 0.41.0); a confirmed post-remediation Go run, refreshed go.sum and clean security report are still outstanding.

### Decision

**Recommend Node.js/TypeScript for Jetson's first backend implementation**, as a provisional architecture decision:
- Node is close to Kotlin on the repeated concurrency probe (566 versus 599 req/s) and tail latency, while using roughly one-third of Kotlin's server memory and CPU in this workload.
- The npm lockfile is committed and clean-install CI passes; current npm audit and Trivy reports are clean.
- TypeScript supports fast end-to-end product iteration across messenger, CRM, campaigns, KPI and AI-facing modules, and can share types/tooling with web/admin clients.
- Kotlin's framework strengths do not currently justify its materially higher runtime footprint for this first product stage.
- Go's low memory footprint remains compelling, but the currently available Go baseline has poor concurrent tail latency and failed its first vulnerability scan. The remediation is committed but not yet evidenced by a visible post-fix Go CI result.

Go remains the preferred candidate for a future isolated high-volume delivery worker only if a patched-toolchain run is clean and repeated benchmarks show a material advantage. Do not introduce a polyglot backend in v1 without that evidence.

This is a backend implementation recommendation for the PoC-to-product transition, not production release authorization. The current benchmark is still a short microbenchmark; load, soak, memory under sustained concurrency and deployment costs remain open.

### Measurement caveats

- The Go row is an earlier run on a vulnerable toolchain and is not directly comparable to the later Node/Kotlin runs.
- RSS is sampled only for the server process, not PostgreSQL or the runner; CPU ticks are process ticks, not whole-host CPU.
- The benchmark is a short 200-write concurrency-16 probe, not a sustained-load test, capacity estimate or SLO.
- Different hosted runners can vary despite matching OS and logical CPU count. Do not rank candidates from a single run.
