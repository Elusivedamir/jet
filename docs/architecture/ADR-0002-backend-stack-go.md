# ADR-0002: Backend language for Jetson v1

- **Status:** Provisional recommendation — Go + PostgreSQL; final stack decision pending bounded outbox-worker concurrency comparison, queue-drain soak and matched maintenance-task evidence
- **Date:** 2026-11-27
- **Supersedes:** ADR-0001 (Node.js/TypeScript proposal)
- **Scope:** First backend implementation; does not select mobile/web UI frameworks or authorize production release.

## Context

Jetson needs a maintainable messenger backend and product modules that can evolve: profiles, direct/group conversations, channels, business CRM, consent-based campaigns, analytics and AI integrations. Three independent PoCs implement the same durable-message contract on PostgreSQL: Go, Node.js/TypeScript and Kotlin/Spring.

The comparison now includes three hard process-kill/restart scenarios, a shared black-box contract, repeated concurrent writes, a 30-second soak, process RSS/CPU sampling, SBOMs and dependency/security checks. All three crash boundaries pass on all candidates. The new soak exposes a common outbox delivery bottleneck: the API accepts 807–1,261 writes/s while serial workers complete only about 50–82 deliveries/s and leave a large queue backlog. See [OUTBOX_WORKER_CAPACITY_FINDINGS](../research/OUTBOX_WORKER_CAPACITY_FINDINGS_2026-11-27.md).

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

This earlier short CI microbenchmark is not a capacity/SLO claim. The later 30-second soak confirms the Go API-acceptance advantage but also shows that end-to-end delivery is constrained by the shared serial worker design. Hosted-runner noise remains possible.

## Correctness and recovery

All three candidates passed the shared contract and all three hard crash/restart boundaries on the latest comparable CI generation:
1. SIGKILL during recipient-inbox dispatch transaction, proving rollback and recovery after lease expiry.
2. SIGKILL after the outbox claim commits while dispatch is blocked before inbox insertion, proving lease reclaim and recovery.
3. Lost acceptance response: the client keeps the socket open without reading the HTTP response until PostgreSQL confirms the message commit, then closes; the server is killed/restarted and an idempotent retry returns the original message ID.

Latest candidate runs on source commit `7a7301310cb6757cfe17046158c6da185138deea`:
- Go: [Actions run 46036340867](https://github.com/Elusivedamir/jet/actions/runs/46036340867) — PASS, including all three crash cases, contract, Go supply-chain checks and Trivy.
- Node: [Actions run 46036340934](https://github.com/Elusivedamir/jet/actions/runs/46036340934) — PASS, including all three crash cases, contract, npm audit and Trivy.
- Kotlin: [Actions run 46036340835](https://github.com/Elusivedamir/jet/actions/runs/46036340835) — crash cases, contract and Trivy passed; overall job remains FAIL because three dependency license declarations require human/legal review.

## Latest 30-second soak and outbox delivery

The latest same-runner comparison is recorded in [OUTBOX_WORKER_CAPACITY_FINDINGS](../research/OUTBOX_WORKER_CAPACITY_FINDINGS_2026-11-27.md). Go led API acceptance at 1,260.92 writes/s, versus 807.32 for Node and 816.98 for Kotlin, with 0 request errors. However, each candidate's serial outbox worker left 23,480–36,488 pending rows, an oldest-open age of 29–30 seconds and p95 completed-delivery latency around 27–28 seconds.

The worker bottleneck is shared by all three candidates and must be fixed/measured before choosing a final production stack. The current API write benchmark is not an end-to-end delivery benchmark.

## Supply chain and security

- Go: govulncheck, go-licenses third-party allow-list and Trivy all passed in the latest candidate run.
- Node: npm audit reported zero advisories; third-party license allow-list and Trivy passed.
- Kotlin: Trivy vulnerability scan passed, but the conservative license gate remains blocked pending human/legal review of `logback-classic 1.5.18`, `logback-core 1.5.18` and `jakarta.annotation-api 2.1.1`. No automatic allow-list exception was added.
- The separate continuous security workflow passed Gitleaks, Semgrep, CodeQL for Go/TypeScript/Kotlin, and both changed-workflow and full-repository zizmor audits on the same source generation.

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
1. a bounded-parallelism outbox-worker experiment does not resolve Go's queue backlog or shows unacceptable delivery tail latency, memory growth or instability;
2. a matched product-development task demonstrates materially higher total delivery/maintenance cost in Go;
3. a refreshed same-runner comparison materially changes the performance/resource ranking;
4. a specific enterprise integration requirement justifies Kotlin/Spring.

## Release gates still required

This decision does not authorize public deployment. Complete a matched bounded-worker-concurrency and queue-drain comparison; resolve Kotlin's open license review if Kotlin remains under consideration; run longer sustained load/soak; and implement production authentication/authorization, migrations, rate limiting, anti-abuse and consent enforcement, device/session handling, observability, backups and E2EE/security design.
