# Adapter boundary and conformance harness design

Status: design contract for the persistence comparison experiment. This document does not define a production API or select a technology.

## Design rule

The reference model remains the behavioral oracle. A persistence adapter is responsible for durable state transitions and transaction boundaries; a dispatcher/transport is responsible for external handoff. Tests must not let adapter-specific convenience APIs leak into the shared contract.

The first implementation should be the smallest interface that expresses the existing contracts. Do not build a generic ORM, repository framework, plugin system or dependency-injection container.

## Responsibility split

### Message acceptance / persistence adapter

Owns:
- atomic creation of the accepted message, idempotency record, conversation sequence and one outbox intent per recipient;
- lookup of a prior idempotent submission and rejection of conflicting reuse;
- durable outbox claim, lease renewal only if explicitly supported, acknowledgement and retry release;
- durable dead-letter transition;
- transaction and migration boundaries.

Does not own:
- network delivery;
- device-delivery/read receipts;
- scheduling timers or background process lifecycle;
- receiver-side deduplication storage;
- encryption/session protocol.

### Dispatcher

Owns:
- polling or receiving eligible work from an adapter;
- invoking a transport with the stable delivery identity;
- mapping transport outcomes to ack/retry/dead-letter operations;
- bounded concurrency and graceful shutdown;
- structured operational telemetry.

Does not own durable message acceptance or invent delivery semantics that the adapter contract does not define.

### Receiver/transport

Must accept a stable idempotency/delivery key where the downstream system supports it. The dispatcher must preserve that key across retries. If the receiver cannot deduplicate, document duplicate-side-effect risk; do not claim exactly-once delivery.

## Minimal logical operations

Names below are illustrative and must be reconciled with existing code before implementation.

1. `accept_message(command) -> accepted_message`
   - atomically allocate sequence and persist message, idempotency key and recipient outbox intents;
   - same idempotency key + same request returns the prior result;
   - same key + conflicting request returns a typed conflict.
2. `claim_due(now, limit, lease_duration, worker_id) -> claims`
   - atomically claim only due items whose predecessor constraints permit dispatch;
   - each claim contains stable item identity, attempt number, lease expiry and opaque fencing token.
3. `ack(claim, transport_receipt, now) -> outcome`
   - only current unexpired claim token may ack.
4. `retry(claim, next_attempt_at, failure_class, now) -> outcome`
   - only current unexpired token may release for retry; attempt policy is bounded.
5. `mark_dead_letter(claim, reason, now) -> outcome`
   - terminal state is durable and participates in per-recipient ordering.
6. `health() -> diagnostic`
   - reports adapter connectivity/schema readiness without exposing secrets.

Use typed domain outcomes for expected conflicts, stale claims, expired leases and missing items. Reserve exceptions for infrastructure faults and programming errors. Do not silently convert database errors into retryable transport errors.

## Contract test organization

Separate tests into three layers:

### A. Pure reference tests
- No external services.
- Fast and deterministic.
- Define expected state transitions and edge cases.
- Remain runnable in every CI invocation.

### B. Adapter conformance tests
- Reuse the same behavioral scenarios against each adapter.
- Adapter fixture creates an isolated database/schema and cleans it reliably.
- Test setup must not depend on execution order or shared mutable global state.
- Include transaction rollback, idempotency conflict, concurrent claims, lease expiry, fencing, retry timing, dead-letter order and recipient isolation.
- Mark tests that require real process termination separately from ordinary unit tests.

### C. Environment/operations tests
- Service health/readiness, schema migration, backup/restore and graceful shutdown.
- Run only in explicit service-enabled CI jobs or a controlled local profile.
- A skipped service job must be reported as skipped, never as passed.

## Determinism and isolation rules

- Inject logical time into domain operations; do not sleep to test expiry boundaries.
- Use unique database/schema names per test worker.
- Use explicit barriers for concurrency races; avoid fragile timing-only assertions.
- Every test owns its fixtures and closes connections/processes in teardown.
- No test may rely on a prior test having acknowledged, deleted or inserted a row.
- Assert both returned outcomes and durable state after reopening a fresh connection.
- Record database version, driver version, Python/runtime version and CI service image.
- Use bounded timeouts so deadlocks fail clearly instead of hanging CI.

## PostgreSQL-specific evidence to collect

- Atomic transaction across message, idempotency, sequence and outbox writes.
- Claim query uses row-level locking/skip-locked behavior only if supported by the chosen server version; verify with competing independent connections.
- Lease fencing is enforced in the write predicate, not only in application memory.
- Isolation-level assumptions are explicit and tested.
- Unique constraints, indexes and foreign keys enforce invariants where appropriate.
- Deadlock/serialization failures are classified and retried only at the transaction boundary with a bounded policy.
- Migration runs on an empty database and from the previous experiment schema.
- Backup and restore are demonstrated on a disposable local instance.

Do not infer production behavior from a single-process unit test or an in-memory fake.

## CI profiles

- `fast`: pure reference tests, static checks and existing SQLite suite; no new service dependency.
- `postgres`: explicit PostgreSQL service job with pinned image/version, health check, isolated database and adapter conformance suite.
- `operations`: opt-in migration, backup/restore and process-recovery checks; may be scheduled or manually dispatched.

The existing default workflow must remain green and usable without PostgreSQL credentials or an external cloud account. Service-enabled jobs must fail visibly when the service is configured but unhealthy.

## Required evidence in every comparison report

- commit SHA and exact test command;
- environment and dependency versions;
- tests passed/failed/skipped;
- concurrency configuration and observed outcomes;
- measured timings with methodology;
- recovery and migration results;
- known gaps and untested assumptions;
- operational steps and cost assumptions.

## Implementation gate

Before adding a PostgreSQL adapter, inspect and map the existing SQLite adapter's actual public methods, data model and test fixtures to this boundary. Preserve current tests and semantics. If an existing operation cannot be mapped without changing the contract, document the discrepancy and resolve it explicitly before coding.
