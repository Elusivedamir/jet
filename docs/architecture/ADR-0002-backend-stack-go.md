# ADR-0002: Backend language for Jetson v1

- **Status:** Proposed decision — Go + PostgreSQL; pending latest fail-closed CI and 30-second soak
- **Date:** 2026-11-27
- **Supersedes:** ADR-0001 (Node.js/TypeScript proposal)
- **Scope:** First backend implementation; does not select mobile/web UI frameworks or authorize production release.

## Context

Jetson needs a maintainable messenger backend and product modules that can evolve: profiles, direct/group conversations, channels, business CRM, consent-based campaigns, analytics and AI integrations. Three independent PoCs implement the same durable-message contract on PostgreSQL: Go, Node.js/TypeScript and Kotlin/Spring.

The comparison now includes two hard process-kill/restart scenarios, a shared black-box contract, a repeated concurrent write probe, process RSS/CPU sampling, SBOMs and dependency/security checks. A third crash scenario and a 30-second concurrent soak have been added to the harness and await the next CI execution.

## Decision

Use **Go + PostgreSQL** as the default backend for Jetson v1, organized as a modular monolith.

- PostgreSQL remains the durable source of truth for users, conversations, memberships, messages, inbox state and outbox intents.
- Preserve the tested transaction boundaries: sender-scoped idempotency + message + sequence + outbox commit atomically; recipient-inbox dispatch is separately recoverable through a leased transactional outbox.
- Keep product domains as modules in one deployable backend initially. Avoid premature microservices, Kafka or Redis; introduce additional infrastructure only when measured requirements justify it.
- Use explicit service interfaces and generated/validated API contracts. Keep business offers, interests, mutuality, consent, campaigns, KPI and AI orchestration as domain modules with strict authorization and audit boundaries.
- Run CPU-heavy AI or analytics work asynchronously; do not hold HTTP handlers open for long-running work.
- Use the transactional outbox as the durable internal event boundary. Subscription status never grants permission to contact users; consent, unsubscribe, suppression and abuse controls remain mandatory.

## Evidence — same runner class and workload

The following three candidate runs used Ubuntu 26.04, Linux kernel 7.0.0-1018-aws, 4 logical CPUs and PostgreSQL 17. Each concurrent probe ran three rounds of 200 unique writes at concurrency 16. The process RSS and CPU sampling window covered the shared contract and benchmark, not PostgreSQL or the crash-wait periods.

| Candidate | Median throughput | Median p50 | Median p95 | Median p99 | Sampled peak RSS | CPU ticks / CPU seconds |
|---|---:|---:|---:|---:|---:|---:|
| Go 1.26.11 + pgx 5.9.2 | **723.39 req/s** | 20.674 ms | **26.873 ms** | **30.586 ms** | **18,420 KiB** | **115 / 1.15 s** |
| Node.js 22 / TypeScript | 576.98 req/s | **17.057 ms** | 69.909 ms | 138.041 ms | 85,384 KiB | 141 / 1.41 s |
| Kotlin 21 / Spring | 703.05 req/s | 18.925 ms | 52.171 ms | 66.678 ms | 265,864 KiB | 527 / 5.27 s |

Sources:
- Go: [Actions run 46028089040](https://github.com/Elusivedamir/jet/actions/runs/46028089040)
- Node: [Actions run 46028089075](https://github.com/Elusivedamir/jet/actions/runs/46028089075)
- Kotlin: [Actions run 46028089057](https://github.com/Elusivedamir/jet/actions/runs/46028089057)

Interpretation:
- Go delivered about 25% more requests per second than Node and about 3% more than Kotlin in this probe.
- Go had the best p95/p99 and the lowest sampled server RSS: about 4.6× less than Node and 14.4× less than Kotlin.
- Go used 1.15 CPU seconds during the measurement window, compared with 1.41 seconds for Node and 5.27 seconds for Kotlin.
- Node had the lowest p50, but its tail latency and throughput were worse in this run.
- Kotlin was close to Go in throughput but used materially more memory and CPU.

This is a short CI microbenchmark, not a capacity/SLO claim. Hosted-runner noise remains possible; the new 30-second soak will provide another signal.

## Correctness and recovery

All three candidates passed the shared contract and two hard process-kill scenarios in the same CI generation:
1. SIGKILL during recipient-inbox dispatch transaction, proving rollback and recovery after lease expiry.
2. SIGKILL after the outbox claim committed while the worker was blocked before recipient-inbox insertion, proving lease reclaim and recovery.

The third scenario—client closes without reading the committed acceptance response, server restarts, then the client retries the same idempotency key—has been implemented but is pending its first CI result.

## Supply chain and security

- Go's patched run reported **“No vulnerabilities found”** from govulncheck. The job then failed at the third-party license check because the repository's own Go module has no declared open-source license. The workflow now excludes the first-party module from third-party dependency checking, while retaining the project's own license as an explicit owner decision.
- The CI-generated Go module graph and checksum diff were reviewed. Updated `go.mod` and `go.sum` are now committed, including pgx 5.9.2 and x/text 0.41.0. The workflow now fails if `go mod tidy` changes the committed module metadata.
- Node's npm audit reported zero advisories, but its first fail-closed license step correctly stopped on the root package's `UNLICENSED` declaration. The workflow now excludes the first-party package from the third-party allow-list check; a fresh run is pending.
- Kotlin's Trivy scan reported zero vulnerabilities and CycloneDX generated 42 components. Three components have EPL/LGPL/GPL-with-classpath-exception license declarations and require human review. A conservative SBOM license gate now reports and blocks unreviewed licenses.
- The Maven transitive graph is now recorded in `poc/kotlin-server/dependency-versions.lock` and checked against the resolved dependency tree in CI. This is a version-graph lock/fingerprint combined with Maven strict checksums, not a cryptographic lock of every artifact.

## Alternatives considered

### Node.js/TypeScript + PostgreSQL — not selected for the backend

Advantages: excellent product iteration speed, npm lockfile, broad web/admin ecosystem. The measured p50 was lowest. In the same-runner probe, throughput was lower, p95/p99 were materially worse and RSS was about 4.6× Go. Keep TypeScript for web/admin clients where it is a natural fit.

### Kotlin/Spring + PostgreSQL — not selected

Advantages: mature enterprise framework and integration ecosystem. Throughput was close to Go, but sampled RSS was about 14.4× Go and CPU time about 4.6× Go. The SBOM also surfaced three dependency components requiring license review.

## Consequences

Positive:
- Low memory footprint and good measured tail latency leave more headroom for database, observability and product workloads.
- One backend language reduces deployment, monitoring and staffing overhead.
- PostgreSQL remains the only mandatory durable infrastructure component in the first backend iteration.

Trade-offs:
- Go may require more explicit implementation work for business/product modules than TypeScript; this has not yet been measured with a matched maintenance-task exercise.
- API contracts, validation and domain boundaries must be deliberately maintained.
- Event-driven workloads, connection-pool sizing, backpressure, rate limits and worker concurrency still require production design and soak testing.

## Revisit conditions

Reopen this ADR if:
1. the 30-second soak shows unacceptable Go tail latency, memory growth, queue backlog or instability;
2. a matched product-development task demonstrates materially higher total delivery/maintenance cost in Go;
3. a refreshed same-runner comparison materially changes the performance/resource ranking;
4. a specific enterprise integration requirement justifies Kotlin/Spring.

## Release gates still required

This decision does not authorize public deployment. Complete the latest fail-closed CI run, review third-party and first-party licensing, execute the three crash scenarios and soak on all candidates, implement production authentication/authorization, migrations, rate limiting, anti-abuse and consent enforcement, device/session handling, observability, backups, E2EE/security design and sustained load/soak testing.
