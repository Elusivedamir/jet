# Go durable-message PoC — implementation report (2026-11-27)

**Status:** partial implementation; not a production decision and not a completed Task 05 comparison.

## Implemented

The isolated `poc/go-server` prototype uses Go 1.24+ and PostgreSQL via pgx v5. It contains:

- Conversation and membership tables, conversation counters, logical messages and a durable recipient outbox.
- Sender-scoped idempotency serialization using a PostgreSQL transaction advisory lock.
- One transaction covering message identity, conversation position and recipient delivery-intent rows.
- A 202 Accepted response only after successful transaction commit.
- Idempotent retry behavior for the same sender/key/conversation/payload; conflicts for changed payload or conversation; independent key scopes across senders.
- Membership authorization on both send and history retrieval, including a membership recheck on retries.
- Cursor-based history retrieval and integration tests for retries, conflicts, sender scoping, concurrency and membership isolation.
- CI workflow with PostgreSQL service, go vet, formatting check, race detector and 100 repeated test runs.

## Explicitly incomplete

This is not yet the required full vertical slice. It has no WebSocket/SSE connection, no outbox consumer/lease fencing, no recipient delivery acknowledgement, no reconnect client, and no hard-crash fault injection. The outbox rows are persisted but remain pending. The identity header is test-only and spoofable. Schema application at process startup is a PoC convenience only. No production security, migration, cryptographic or deployment claim is made.

## Design notes and known risks

- The transaction-scoped advisory lock hashes sender + operation key. Hash collisions can serialize unrelated operations (a performance cost) but do not merge their idempotency records. This must be reviewed before a production design.
- The current PoC intentionally supports exactly one recipient besides the sender; group fan-out is rejected.
- A successful database commit followed by a lost HTTP response is reconciled by retrying the same operation key. The integration test exercises sequential and concurrent retries, but a process-kill-at-the-commit-boundary test is still required.
- Outbox delivery semantics are unproven until a worker and deterministic failure injection are added.
- Dependencies are pinned by the direct module requirement; the CI step runs go mod tidy. A committed go.sum and reviewed transitive dependency/license inventory remain required before candidate scoring.

## Verification status

- Latest branch commit at verification: `683d988f7d7e54b8cdc52f7346fca47db48620d7`.
- GitHub Actions run [#46013315702](https://github.com/Elusivedamir/jet/actions/runs/46013315702) completed **successfully** on this exact latest commit.
- `go mod tidy`: passed.
- `gofmt` check: passed.
- `go vet ./...`: passed.
- PostgreSQL 17 integration tests under `go test -race -count=100 -v ./...`: passed. Five integration test functions were each repeated 100 times; the concurrent-retry test exercised 12 simultaneous requests per repetition.
- A prior intermediate commit failed static analysis because the schema helper file had not yet been added to that snapshot. The final branch includes the helper and the latest run above passes. Do not treat the superseded failed run as the current head result.
- No local compilation or test execution is claimed; verification was performed in GitHub Actions.

## Next implementation steps

1. Ensure Go code formats/compiles and commit go.sum after dependency resolution.
2. Add HTTP handler tests and PostgreSQL fault-injection tests.
3. Implement an outbox worker with bounded leases, fencing tokens, retry state and crash recovery.
4. Add recipient delivery stream/ack and cursor reconnect test harness.
5. Run STACK-001..012, record actual repetitions and artifacts.
6. Implement equivalent Node/TypeScript and Kotlin/Spring candidates before any comparative score or stack selection.
