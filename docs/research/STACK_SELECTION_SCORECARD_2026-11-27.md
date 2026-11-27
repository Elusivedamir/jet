# Jetson backend stack selection scorecard — 2026-11-27

## Decision status

**Provisional v1 recommendation: Go + PostgreSQL**, documented in [ADR-0002](../architecture/ADR-0002-backend-stack-go.md). This supersedes the earlier Node.js proposal in ADR-0001. It is not production-release authorization: the latest fail-closed security/license CI and 30-second soak are still pending.

## Decision criteria and weights

| Criterion | Weight | Evidence required |
|---|---:|---|
| Correctness and crash recovery | 25% | Shared contract plus hard SIGKILL/restart; atomic rollback, lease recovery, idempotent retry |
| Reproducible builds and supply-chain risk | 15% | Committed dependency metadata, clean install, SBOM, vulnerability and license reports |
| Performance under comparable workload | 15% | Repeated p50/p95/p99 and concurrent write throughput |
| Resource efficiency | 15% | Sampled server RSS, CPU time, runner OS/CPU metadata |
| Product development velocity | 15% | Matched implementation/maintenance tasks for chat, channels, CRM, campaigns, KPI and AI |
| Operational simplicity | 10% | Build artifact, startup, deployment model, runtime footprint, observability and staffing |
| Maintainability | 5% | Code organization, ecosystem maturity, test quality and dependency discipline |

No weighted total is published yet: product development velocity and maintenance-task evidence are not measured. Missing evidence is not converted into a guessed score.

## Comparable CI performance evidence

Runner class: Ubuntu 26.04, Linux 7.0.0-1018-aws, 4 logical CPUs, PostgreSQL 17. Shared workload: five sequential rounds × 100 writes, plus three concurrent rounds × 200 unique writes at concurrency 16. Resource sampling is for the direct server process only and excludes PostgreSQL.

| Candidate / run | Median throughput | Median p50 | Median p95 | Median p99 | Peak sampled RSS | CPU ticks / CPU seconds |
|---|---:|---:|---:|---:|---:|---:|
| **Go 1.26.11 + pgx 5.9.2** [46028089040](https://github.com/Elusivedamir/jet/actions/runs/46028089040) | **723.39 req/s** | 20.674 ms | **26.873 ms** | **30.586 ms** | **18,420 KiB** | **115 / 1.15 s** |
| Node.js 22 / TypeScript [46028089075](https://github.com/Elusivedamir/jet/actions/runs/46028089075) | 576.98 req/s | **17.057 ms** | 69.909 ms | 138.041 ms | 85,384 KiB | 141 / 1.41 s |
| Kotlin 21 / Spring [46028089057](https://github.com/Elusivedamir/jet/actions/runs/46028089057) | 703.05 req/s | 18.925 ms | 52.171 ms | 66.678 ms | 265,864 KiB | 527 / 5.27 s |

Interpretation:
- Go delivered about 25% more requests/second than Node and about 3% more than Kotlin.
- Go had the best p95/p99 and lowest sampled memory: approximately 4.6× less RSS than Node and 14.4× less than Kotlin.
- Go used 1.15 CPU seconds during the measurement window, versus 1.41 seconds for Node and 5.27 seconds for Kotlin.
- Node had the lowest p50, but materially higher p95/p99 in this run.
- Kotlin was close to Go in throughput but used much more memory and CPU.

This is a short CI microbenchmark, not a capacity/SLO forecast. Hosted-runner noise remains possible; the 30-second concurrent soak is now part of the shared harness but awaits the next CI result.

## Correctness and crash recovery

All three candidates passed the shared contract and two hard process-kill scenarios in the same CI generation:
1. SIGKILL during recipient-inbox dispatch transaction; verify rollback, lease expiry and recovery.
2. SIGKILL after the outbox claim commits while the worker is blocked before inbox insertion; verify claim recovery and one durable inbox row.

The third scenario—client closes without reading the committed acceptance response, server restarts, then the client retries the same idempotency key—has been added to the shared harness and awaits its first CI result. A further post-dispatch-commit and lost-ack scenario remains open.

## Dependency and security gates

- **Go:** the patched run's govulncheck output says “No vulnerabilities found.” The job failed later because go-licenses attempted to find a license for the first-party Go module, which is not yet licensed. The workflow now excludes the first-party module from third-party scanning while retaining the project's own license as an explicit owner decision. CI-generated go.mod/go.sum changes were reviewed and committed; the workflow now fails if `go mod tidy` changes the committed metadata. Latest clean allow-list/Trivy confirmation is pending.
- **Node:** npm audit reported zero advisories in the run; the first fail-closed license step stopped because the root package is `UNLICENSED`. The workflow now excludes the root package from the third-party allow-list check. Fresh audit/license/Trivy run is pending.
- **Kotlin:** CycloneDX generated 42 components; Trivy reported zero vulnerabilities. The SBOM lists three components with EPL/LGPL/GPL-with-classpath-exception declarations that require human review. A conservative license gate now blocks unreviewed declarations. A committed 72-coordinate dependency version fingerprint and CI comparison have been added; latest verification is pending.

GitHub Actions are now pinned to immutable commit SHAs. The Maven dependency graph fingerprint plus strict checksums is a version-resolution control, not a cryptographic lock of every artifact.

## Candidate fit

### Go + PostgreSQL — current front-runner
Best measured throughput, p95/p99, memory and CPU efficiency. Patched govulncheck is clean. The remaining gates are the refreshed license allow-list/Trivy run, clean reproducibility check on committed go.sum, 30-second soak, and a matched product-development task to test whether explicit Go code costs materially more to maintain.

### Node.js/TypeScript + PostgreSQL — strong alternative
Best p50 and fast web/product iteration ecosystem. It may reduce implementation time for CRM, campaigns, KPI and admin surfaces. Current benchmark shows lower throughput and worse tail latency than Go, with about 4.6× the memory. Keep TypeScript for web/admin clients even if Go is selected for the backend.

### Kotlin/Spring + PostgreSQL — not preferred for v1
Mature enterprise framework and close throughput to Go, but about 14.4× the measured RSS and 4.6× the CPU time. Three SBOM license declarations need review. Reconsider if enterprise integration requirements justify the runtime footprint.

## Provisional architecture direction

Use a **Go modular monolith + PostgreSQL** for the backend. Keep PostgreSQL as the durable source of truth. Do not introduce Kafka, Redis, microservices or a polyglot backend solely to optimize a PoC benchmark. Use TypeScript for web/admin clients where appropriate. Separate AI and analytics jobs asynchronously when required; do not make a second backend language the default.

## Current gates

- Go: patched toolchain and dependency graph are committed; govulncheck clean on the current candidate run; license-check allow-list and Trivy rerun pending after excluding the first-party module.
- Node: npm audit clean in the previous run; corrected license allow-list and fresh Trivy gate pending.
- Kotlin: SBOM and vulnerability scan clean; license review gate identifies three components; dependency version lock check newly added.
- All candidates: three-case crash harness and 30-second soak are awaiting fresh CI evidence on the latest commit.
- Product velocity, long soak, deployment cost, operational comparison and production security remain open.

## Decision caveats

This recommendation is evidence-led but provisional. Do not claim production readiness, capacity or SLOs. Revisit ADR-0002 if the soak or matched maintenance-task comparison materially changes the trade-off.
