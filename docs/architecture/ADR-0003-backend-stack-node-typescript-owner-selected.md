# ADR-0003: Owner-selected backend for Jetson v1

- **Status:** Accepted direction — Node.js / TypeScript + PostgreSQL; implementation and production gates remain open
- **Date:** 2026-11-27
- **Supersedes:** ADR-0002 (provisional Go recommendation)
- **Related history:** ADR-0001 (initial Node.js / TypeScript proposal)
- **Decision authority:** Product owner

## Context

Jetson needs one maintainable backend direction for the greenfield messenger: accounts and profiles, direct/group conversations, channels, Business CRM, consent-based offers/campaigns, interests and recommendations, mutuality, KPI and AI modules.

The repository contains comparative Go, Node.js/TypeScript and Kotlin/Spring PostgreSQL PoCs. Their corrected bounded-outbox-worker matrix is useful engineering evidence but is not a defensible language performance ranking: hosted runner environments differed, starting backlogs varied, and Kotlin's dependency-license gate remains open. The matrix and limitations are documented in [outbox worker findings](../research/OUTBOX_WORKER_CAPACITY_FINDINGS_2026-11-27.md).

The product owner explicitly selected Node.js / TypeScript after reviewing the comparison and trade-offs. This is a deliberate product/engineering direction, not a claim that Node won every benchmark metric.

## Decision

Proceed with **Node.js + TypeScript + PostgreSQL** as Jetson's primary backend direction, structured as a modular monolith.

- PostgreSQL remains the current PoC and initial architecture database direction; final production database operations, hosting and topology still require design and approval.
- Keep product domains inside one deployable backend initially: identity, profiles, conversations, channels, Business, offers, interests/recommendations, mutuality, consent, campaigns, KPI and AI orchestration.
- Preserve atomic sender idempotency + message + sequence + outbox commit.
- Preserve durable inbox insertion and outbox completion in one transaction, using lease tokens/fencing and idempotent recipient inbox keys.
- Keep CPU-heavy AI/analytics work out of HTTP request handlers; use bounded asynchronous workers.
- Do not introduce Kafka, Redis or microservices without measured requirements.
- TypeScript API contracts and validation must be explicit; authentication/authorization must be real before any public deployment.
- Consent, unsubscribe, suppression, opt-in and abuse controls are product invariants, not optional optimizations.

## Evidence and known issues

### Corrected worker matrix

At tested code head `6593d501dcdb8921e221edffc142c368f2ea1e0b`, all four Node concurrency cells passed the functional/crash/soak workflow [#46041977599](https://github.com/Elusivedamir/jet/actions/runs/46041977599). Producer HTTP request errors were zero.

The Node matrix also showed one terminal-failure row per cell. Source inspection established the cause:
- `poc/node-server/test/store.test.ts` deliberately changes a claimed test item's in-memory `attempt_count` to 8 and calls `store.retry(..., new Error("final injected failure"))` to test the terminal transition.
- The test suite previously left its fixture rows in the shared CI PostgreSQL service.
- The subsequent live-server crash/soak harness reused that same database and counted the intentionally persisted unit-test fixture as a terminal delivery failure.
- This was test-fixture leakage, not evidence that the worker spontaneously failed a production delivery. The earlier reports correctly kept it open pending source confirmation.

The regression fix adds a teardown reset to the Node integration test suite, using the same fixture cleanup as setup, and asserts the exact expected terminal error in the unit test. The next Node CI run must verify the live harness sees zero terminal failures after test teardown. Do not mark the regression fixed until that exact-head CI evidence passes.

### Performance caveats

The matrix is not a final capacity estimate, SLO or language ranking. Go/Node and Kotlin ran on different hosted runner providers; producer acceptance and starting backlog varied by cell. Node's memory footprint and tail latency deserve attention during future controlled repeatability and sustained-load testing.

### Worker configuration

Keep `OUTBOX_WORKER_CONCURRENCY=1` as the default until a controlled Node repeatability pass validates correctness, queue behavior, resource use and lease fencing. Do not copy the fastest-looking matrix setting into defaults.

## Consequences

Positive:
- One backend language aligns API, web/admin and product-domain iteration around TypeScript.
- The existing Node PoC and lockfile provide a concrete starting point for the vertical slice.
- Go and Kotlin experiments remain available as research, not competing implementation tracks.

Trade-offs:
- Node's measured memory use is higher than Go's PoC and event-loop health must be observed.
- Tail latency and sustained outbox throughput require controlled testing.
- TypeScript does not replace runtime validation, authorization, security review or operational design.

## Required next work

1. Confirm the test-fixture teardown change passes `npm test` and the subsequent shared crash/soak harness reports zero terminal failures.
2. Run a controlled repeatability pass on Node with pinned runner class, PostgreSQL version, configuration and three independent full runs where feasible.
3. Keep default worker concurrency at 1 until the evidence is reviewed.
4. Implement the first real vertical slice as a modular Node/TypeScript backend, not by promoting the current PoC unchanged.
5. Define API contracts, migrations, auth/session model, authorization, rate limits, abuse protections, consent enforcement, observability, backups and recovery.
6. Review all dependencies/SBOM/licenses and complete security, privacy/legal and product acceptance gates.

This ADR does not authorize merge, deployment, paid infrastructure, or a production-readiness claim.