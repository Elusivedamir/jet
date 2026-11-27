# Stack PoC results — 2026-11-27

## Decision summary

**Owner-selected primary backend direction: Node.js / TypeScript + PostgreSQL**, recorded in [ADR-0003](../architecture/ADR-0003-backend-stack-node-typescript-owner-selected.md). Go remains the comparative performance/resource leader in some short PoC measurements, but the owner selected Node for the product direction. This is not production-release authorization; the selected Node PoC still requires terminal-fixture cleanup CI confirmation, controlled repeatability and full production engineering gates.

## Correctness and recovery

All three candidates passed the shared contract and two executable hard-crash scenarios in CI:
- Go: [Actions run 46028089040](https://github.com/Elusivedamir/jet/actions/runs/46028089040)
- Node: [Actions run 46028089075](https://github.com/Elusivedamir/jet/actions/runs/46028089075)
- Kotlin: [Actions run 46028089057](https://github.com/Elusivedamir/jet/actions/runs/46028089057)

The two scenarios:
1. Kill the server inside recipient-inbox dispatch transaction; verify rollback, lease expiry and exactly one durable inbox row after restart.
2. Hold an AccessExclusiveLock on recipient_inbox, wait until the worker's outbox claim is committed and dispatch is blocked, kill the server, release the lock, wait for lease expiry and verify recovery with one inbox row.

A third scenario now passes on all three candidates: the client keeps the connection open without reading the acceptance response until PostgreSQL confirms commit, then closes; the server is killed/restarted and the same idempotency key returns the original message.

## Performance — same runner class

Runner: Ubuntu 26.04, Linux 7.0.0-1018-aws, 4 logical CPUs, PostgreSQL 17. Shared probe: five sequential rounds × 100 writes, then three concurrent rounds × 200 unique writes at concurrency 16. RSS/CPU are sampled for the direct server process only, excluding PostgreSQL.

| Candidate | Median req/s | Median p50 | Median p95 | Median p99 | Peak sampled RSS | CPU ticks / CPU seconds |
|---|---:|---:|---:|---:|---:|---:|
| **Go 1.26.11 + pgx 5.9.2** | **723.39** | 20.674 ms | **26.873 ms** | **30.586 ms** | **18,420 KiB** | **115 / 1.15 s** |
| Node.js 22 / TypeScript | 576.98 | **17.057 ms** | 69.909 ms | 138.041 ms | 85,384 KiB | 141 / 1.41 s |
| Kotlin 21 / Spring | 703.05 | 18.925 ms | 52.171 ms | 66.678 ms | 265,864 KiB | 527 / 5.27 s |

Go's median throughput was about 25% higher than Node and 3% higher than Kotlin. Go had the best p95/p99 and used about 4.6× less memory than Node and 14.4× less than Kotlin. Node had the lowest p50. Kotlin was close in throughput but used significantly more memory and CPU.

This is a short microbenchmark, not a capacity/SLO forecast. The shared harness now runs a 30-second concurrent write soak at concurrency 16 and records outbox backlog, p95 completed-delivery latency and oldest open-delivery age. The latest results are below.

## Dependencies, SBOM and security

- **Go:** the patched run's govulncheck output explicitly says “No vulnerabilities found.” The job failed afterward because go-licenses attempted to identify a license for the first-party Go module, which has no declared license. The workflow now excludes the first-party module from third-party scanning, and the project's own license remains an owner decision. CI-generated go.mod/go.sum metadata was reviewed and committed; the next workflow enforces no drift after `go mod tidy`. Latest go-licenses third-party allow-list and Trivy passed.
- **Node:** npm audit JSON reported 0 advisories. The fail-closed third-party license check initially stopped on the root package's `UNLICENSED` declaration. The workflow now excludes the first-party package from the third-party allow-list; the latest license/Trivy run passed.
- **Kotlin:** CycloneDX SBOM has 42 components; Trivy reported 0 vulnerabilities in the scanned dependency graph. Three components have EPL/LGPL/GPL-with-classpath-exception license declarations and require human review. A conservative SBOM license gate blocks three unreviewed declarations (logback-classic, logback-core and jakarta.annotation-api); the Kotlin candidate's overall CI remains failed pending human/legal review. The 72-coordinate dependency version fingerprint passed.

GitHub Actions are pinned to immutable commit SHAs. The Maven dependency graph fingerprint plus strict checksums detects version drift; it is not a cryptographic lock of every artifact.

## Historical comparative performance observation

Go led several earlier short-run throughput, tail-latency and memory measurements. Those results remain research evidence, not the current owner decision or a final language ranking. The product owner selected Node.js / TypeScript; see ADR-0003. Avoid introducing a polyglot backend unless a measured need justifies it.

## Open gates

- Confirm Go third-party license allow-list and Trivy pass on the corrected workflow.
- Confirm committed Go module graph/checksum reproduces with no diff.
- Confirm Node's corrected license allow-list and fail-closed Trivy run.
- Review Kotlin's three license findings and verify its dependency version lock.
- Run a bounded-parallelism outbox-worker comparison and queue-drain soak on all candidates.
- Compare matched product-development/maintenance tasks, deployment cost and long-duration resource behavior.
- Production authentication/authorization, migrations, E2EE/security design, rate limiting, abuse controls, consent enforcement, device/session handling, observability and backups remain unimplemented.

## References

- [ADR-0003 — owner-selected Node.js backend](../architecture/ADR-0003-backend-stack-node-typescript-owner-selected.md)
- [ADR-0002 — superseded Go recommendation](../architecture/ADR-0002-backend-stack-go.md)
- [ADR-0001 — superseded Node.js proposal](../architecture/ADR-0001-backend-stack-node-typescript.md)
- [Weighted scorecard and decision caveats](STACK_SELECTION_SCORECARD_2026-11-27.md)
- [Dependency reproducibility and supply-chain audit](DEPENDENCY_REPRODUCIBILITY_AUDIT_2026-11-27.md)
- [Hard crash/recovery test plan and execution record](../testing/HARD_CRASH_RECOVERY_TEST_PLAN_2026-11-27.md)
- [Engineering validation log](../testing/ENGINEERING_VALIDATION_LOG.md)


## Runtime pinning — 2026-11-27

GitHub Actions are pinned to immutable commit SHAs. Runtime/service versions are pinned in CI: Go 1.26.11, Node.js 22.23.5 via `.nvmrc`, Temurin JDK 21.0.13 and PostgreSQL 17.12.


## Latest comparable crash recovery and 30-second soak — 2026-11-27

Latest docs-head revalidation: `9dbec25214df3011d2c1bfc48b7da35f6f802e53`. All three candidates passed all three crash/restart cases, the shared contract and had zero request errors during the 30-second soak. Exact runs: Go [46037451522](https://github.com/Elusivedamir/jet/actions/runs/46037451522), Node [46037451549](https://github.com/Elusivedamir/jet/actions/runs/46037451549), Kotlin [46037451443](https://github.com/Elusivedamir/jet/actions/runs/46037451443).

| Candidate | Soak accepted writes/s | p50 | p95 | p99 | Peak RSS | CPU seconds | Pending outbox after soak | p95 completed delivery |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Go | **1,134.86** | 13.745 ms | **19.104 ms** | **22.622 ms** | **19,208 KiB** | 17.34 | 32,837 | 28,090 ms |
| Node | 772.24 | **13.296 ms** | 55.471 ms | 88.676 ms | 99,632 KiB | 20.38 | 22,801 | 28,078 ms |
| Kotlin | 708.64 | 17.108 ms | 55.011 ms | 83.092 ms | 412,868 KiB | 37.91 | 20,196 | 26,630 ms |

**Important qualification:** these are API acceptance writes/s, not delivered-message throughput. Each implementation claims batches of 20 and dispatches serially. After 30 seconds, each had roughly 23k–36k pending rows and oldest-open age 29–30 seconds. This common worker design is the current bottleneck. Go remains a comparative performance/resource candidate in these historical measurements; the product owner has since selected Node.js / TypeScript in ADR-0003. The matrix is not a language ranking. Full details: [OUTBOX_WORKER_CAPACITY_FINDINGS](OUTBOX_WORKER_CAPACITY_FINDINGS_2026-11-27.md).

Kotlin crash recovery passed, but the Kotlin workflow is not fully green: its conservative license gate requires human/legal review of three components. No license exception was automatically added.
