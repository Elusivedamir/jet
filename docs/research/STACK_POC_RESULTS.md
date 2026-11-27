# Stack PoC results — 2026-11-27

## Decision summary

**Provisional recommendation: Node.js / TypeScript + PostgreSQL for Jetson v1.** See [ADR-0001](../architecture/ADR-0001-backend-stack-node-typescript.md). This is not production-release authorization. Go's post-remediation security and performance evidence is still outstanding.

## Correctness and recovery

All candidates passed the shared contract and the first executable hard-crash boundary:
- Go baseline: [Actions run 46025003199](https://github.com/Elusivedamir/jet/actions/runs/46025003199)
- Node: [Actions run 46026586747](https://github.com/Elusivedamir/jet/actions/runs/46026586747)
- Kotlin: [Actions run 46026586769](https://github.com/Elusivedamir/jet/actions/runs/46026586769)

The harness kills the actual server process during a recipient-inbox transaction while the lease is valid, verifies rollback, waits for expiry, restarts the server and checks one inbox row plus idempotent retry.

## Performance — latest repeated CI run

Runner class: Ubuntu 26.04, Linux 7.0.0-1020-azure, 4 logical CPUs, PostgreSQL 17. Shared probe: 3 rounds × 200 unique writes, concurrency 16. Server RSS/CPU only; database excluded.

| Candidate | Median req/s | p50 ms | p95 ms | p99 ms | Sampled peak RSS | CPU ticks at 100 Hz |
|---|---:|---:|---:|---:|---:|---:|
| Node/TypeScript | 565.87 | 21.127 | 64.592 | 94.321 | 87,252 KiB | 179 |
| Kotlin/Spring | 599.28 | 20.612 | 62.050 | 80.862 | 269,716 KiB | 487 |
| Go baseline* | 341.2 | 15.956 | 380.520 | 384.246 | 17,708 KiB | 64 |

* Go numbers are from an earlier single concurrent probe on the vulnerable baseline and must not be treated as a final apples-to-apples result.

Node and Kotlin are close on throughput; Kotlin's approximately 6% median advantage is within short-run hosted CI noise. Node uses about one-third the RSS and less CPU. Go is markedly lean in memory, but its available run has a very high concurrent tail and predates remediation.

## Dependency and security gates

- **Node:** committed npm v3 lockfile; `npm ci` passes; npm audit = 0 advisories; Trivy = 0 vulnerabilities in scanned npm graph. Project root package is `UNLICENSED`; own licensing decision open.
- **Kotlin:** Maven `-C verify`, dependency tree and CycloneDX SBOM (42 components) pass; PostgreSQL JDBC 42.7.12; Trivy = 0 vulnerabilities in scanned graph. Full transitive Maven lock remains open.
- **Go:** first govulncheck scan reported 24 reachable advisories on Go 1.24.13, pgx 5.7.2 and x/text 0.21.0. Remediation committed to Go 1.26.11, pgx 5.9.2 and x/text 0.41.0; post-fix scan and refreshed checksums not yet confirmed.

## Engineering caveats

- Only one hard-crash boundary is covered; lost HTTP acceptance response, claim-before-dispatch, after-inbox-before-completion, after-dispatch and acknowledgement-response loss remain.
- No sustained load/soak, production capacity, SLO, deployment cost or maintenance-task comparison has been established.
- Production auth/session, migrations, E2EE, rate limiting, abuse controls, device model and observability remain unimplemented.
- PoC identity header `X-Test-Account` is spoofable; do not expose candidates publicly.

## References

- [Weighted scorecard and caveats](STACK_SELECTION_SCORECARD_2026-11-27.md)
- [ADR-0001 backend recommendation](../architecture/ADR-0001-backend-stack-node-typescript.md)
- [Dependency reproducibility and supply-chain audit](DEPENDENCY_REPRODUCIBILITY_AUDIT_2026-11-27.md)
- [Hard crash/recovery test plan and execution record](../testing/HARD_CRASH_RECOVERY_TEST_PLAN_2026-11-27.md)
- [Engineering validation log](../testing/ENGINEERING_VALIDATION_LOG.md)
