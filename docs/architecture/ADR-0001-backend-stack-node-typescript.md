# ADR-0001: Backend language for Jetson v1

- **Status:** Superseded by ADR-0002 (Go + PostgreSQL); retained as decision history
- **Date:** 2026-11-27
- **Scope:** First backend implementation; does not select mobile/web UI frameworks or authorize production release.

## Context

Jetson needs a maintainable messenger backend and product modules that can evolve quickly: profiles, direct/group conversations, channels, business CRM, consent-based campaigns, analytics and AI integrations. The current research PoC compared Go + PostgreSQL, Node.js/TypeScript + PostgreSQL, and Kotlin/Spring + PostgreSQL with the same HTTP contract and durable outbox model.

The comparison now includes real process SIGKILL/restart testing, clean dependency installation, SBOM/vulnerability/license reports and a repeated three-round concurrent write probe.

## Decision

Use **Node.js + TypeScript + PostgreSQL** as the default backend for v1, organized as a modular monolith.

- PostgreSQL remains the durable source of truth for users, conversations, memberships, messages, inbox state and outbox intents.
- Preserve the tested transaction boundaries: idempotency + message + sequence + outbox commit atomically; dispatch to the durable recipient inbox is separately recoverable.
- Keep product domains as modules inside one deployable backend initially. Avoid premature microservices, Kafka or Redis; add them only when measured throughput or operational requirements justify the added failure modes.
- Use TypeScript contracts at API boundaries and share domain/API types with web/admin clients where appropriate.
- Isolate CPU-heavy work and AI orchestration from the HTTP event loop using dedicated worker processes/queues when required; do not perform long CPU tasks inside request handlers.
- Use the transactional outbox as the durable internal event boundary for campaigns, analytics and downstream work. User consent and opt-out checks remain mandatory regardless of language or throughput.

## Evidence

Latest repeated CI run on Ubuntu 26.04, Linux 7.0.0-1020-azure, 4 logical CPUs, PostgreSQL 17:

| Candidate | Median of 3 × 200 concurrent writes | Median p95 | Median p99 | Sampled peak server RSS | CPU ticks (100 Hz) |
|---|---:|---:|---:|---:|---:|
| Node/TypeScript | 565.87 req/s | 64.592 ms | 94.321 ms | 87,252 KiB | 179 |
| Kotlin/Spring | 599.28 req/s | 62.050 ms | 80.862 ms | 269,716 KiB | 487 |
| Go (earlier, single probe) | 341.2 req/s | 380.520 ms | 384.246 ms | 17,708 KiB | 64 |

- Node and Kotlin both passed hard SIGKILL/restart and the shared contract. Node's lockfile passed `npm ci`; npm audit and Trivy reported zero vulnerabilities in the scanned dependency graph.
- Kotlin's Maven verify, resolved dependency tree and CycloneDX SBOM passed; after PostgreSQL JDBC 42.7.12, Trivy reported zero vulnerabilities in the scanned dependency graph.
- Kotlin's median throughput was only about 6% higher than Node in this short test, while its sampled server RSS was about 3.1× higher and CPU ticks about 2.7× higher.
- Go's very low memory footprint is attractive, but the available performance/security baseline predates the committed remediation. Its first govulncheck scan reported 24 reachable advisories in Go 1.24.13, pgx 5.7.2 and x/text 0.21.0.

See `docs/research/STACK_SELECTION_SCORECARD_2026-11-27.md` and the linked CI artifacts for the full measurements and caveats.

## Alternatives considered

### Go + PostgreSQL — not selected for v1 yet

Advantages: lowest measured memory footprint and compact deployment. It remains a serious future candidate for a dedicated high-throughput delivery worker. The current available baseline has poor concurrent tail latency and a failed vulnerability scan. The remediation (Go 1.26.11, pgx 5.9.2, x/text 0.41.0) is committed but requires a confirmed clean CI run and repeated benchmark before reconsideration.

### Kotlin / Spring + PostgreSQL — not selected for v1

Advantages: mature enterprise framework, rich integration ecosystem and strong domain modeling. In the current PoC its resource footprint is materially higher than Node without a meaningful throughput advantage. Reconsider if enterprise integration requirements or JVM expertise materially change.

## Consequences

Positive:
- One backend language reduces deployment, observability, testing and staffing overhead.
- TypeScript supports fast changes across product APIs, web/admin surfaces and business modules.
- PostgreSQL remains the only mandatory durable infrastructure component in the first backend iteration.

Trade-offs:
- Node consumes more memory than the Go PoC and requires strict separation of CPU-heavy tasks from request handling.
- Event-loop health, connection-pool sizing, backpressure, rate limits and worker concurrency must be monitored and load-tested.
- The short CI benchmark does not establish production capacity or SLOs.

## Revisit conditions

Reopen this ADR if:
1. the patched Go 1.26.11 + pgx 5.9.2 + x/text 0.41.0 run is clean and repeated tests show materially better tail latency or resource/cost efficiency;
2. Node fails sustained-load, soak, memory, or operational targets;
3. a specific product requirement makes Spring/JVM integration materially more valuable;
4. the team chooses a separately deployed Go delivery worker based on measured bottlenecks.

## Release gates still required

This decision does not authorize public deployment. Before production, replace spoofable `X-Test-Account` with real authentication/authorization; implement production migrations, rate limiting, anti-abuse and consent enforcement; complete device/session handling, observability, backups, E2EE/security design and sustained load/soak testing; review all SBOM/license reports; and decide the project's own license.
