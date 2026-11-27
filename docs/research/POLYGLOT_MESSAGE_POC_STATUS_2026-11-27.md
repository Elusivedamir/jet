# Jetson message-core candidate PoCs — status (2026-11-27)

## Why these prototypes exist

Task 05 requires comparable, disposable candidate implementations before any backend stack is selected. This work uses the same PostgreSQL 17 message schema and core contract across Go, Node.js/TypeScript and Kotlin/Spring. It is not a production implementation.

## Implemented scope

| Capability | Go | Node.js / TS | Kotlin / Spring |
|---|---:|---:|---:|
| Sender-scoped idempotency | Implemented | Implemented | Implemented |
| Message + sequence + outbox transaction | Implemented | Implemented | Implemented |
| Membership authorization | Implemented | Implemented | Implemented |
| Lease claim with SKIP LOCKED | Implemented | Implemented | Implemented |
| Expiring lease + fencing token | Implemented | Implemented | Implemented |
| Durable recipient inbox | Implemented | Implemented | Implemented |
| Retry and terminal failure | Implemented | Implemented | Implemented |
| Cursor history | Implemented | Implemented | Implemented |
| SSE reconnect cursor | Implemented | Implemented | Implemented |
| Recipient acknowledgement | Implemented | Implemented | Implemented |
| PostgreSQL integration tests | Implemented | Implemented | Implemented |
| Hard process-kill fault injection | Not yet | Not yet | Not yet |
| Equivalent load/resource benchmark | Not yet | Not yet | Not yet |

"Implemented" describes code present, not a passing CI result. See the run table below; never infer pass from workflow configuration.

## CI evidence — latest verified revision

All three candidate workflows passed on the same latest implementation revision, `bcc14766b381d9ffe9ef2e81695221a9e500c32c`:

- [Go durable-message PoC — run #46016133216](https://github.com/Elusivedamir/jet/actions/runs/46016133216): gofmt, go vet, PostgreSQL 17 integration/race tests with `-count=100`, shared HTTP/SSE contract and latency probe.
- [Node TypeScript message PoC — run #46016133262](https://github.com/Elusivedamir/jet/actions/runs/46016133262): TypeScript build, five PostgreSQL integration tests, shared HTTP/SSE contract and latency probe.
- [Kotlin Spring message PoC — run #46016133220](https://github.com/Elusivedamir/jet/actions/runs/46016133220): actual Kotlin main/test compilation, five JUnit integration tests, PostgreSQL 17, shared HTTP/SSE contract and latency probe.

The shared black-box contract passed on all three: same two-party fixture, sender idempotency, payload conflict, 12 concurrent duplicate submissions, non-member history denial, SSE recipient delivery, idempotent acknowledgement and cursor reconnect without replaying the consumed message.

### Preliminary latency probe

Each candidate ran five sequential rounds of 100 message submissions on GitHub-hosted Ubuntu with PostgreSQL 17.12. Values below are medians of the five per-round statistics (milliseconds):

| Candidate | p50 | p95 | p99 | Mean |
|---|---:|---:|---:|---:|
| Go | 2.139 | 2.616 | 5.854 | 2.318 |
| Node.js / TypeScript | 2.934 | 3.685 | 5.930 | 3.111 |
| Kotlin / Spring | 2.465 | 3.654 | 5.238 | 2.656 |

These are preliminary CI microbenchmarks, not capacity tests or SLO evidence. They are sequential client-side HTTP timings; they do not measure server CPU/RSS, throughput under sustained concurrency, queue lag under load, cold start, binary/image size or database connection saturation. Hosted runner noise is visible in outlier rounds (especially Kotlin p99). Do not use this table alone to select a stack.

The first intermediate runs exposed issues in the test harness and Kotlin source/test wiring; those were corrected. The results above refer to the final successful run IDs and exact revision listed above.

## Important limits

- All candidates use spoofable X-Test-Account; this is only a local test identity adapter.
- Only a two-party direct conversation is accepted; exactly one recipient besides the sender.
- SSE is polling-backed and is a transport experiment, not a production push recommendation.
- Outbox completion means the recipient inbox row was durably created, not that a device displayed the message.
- Acknowledgement is an explicit recipient API action, separate from SSE write.
- No production authentication, sessions, key management, E2EE, attachment handling, abuse prevention, privacy review, production migration plan, SLO or capacity claim.
- Node package lockfile, Go go.sum and complete transitive dependency/license inventory remain to be finalized.
- CI tests do not replace process-kill-at-commit/claim/dispatch/ack tests or five-run performance benchmarking.

## Next gates

1. Resolve all candidate CI failures and pin lockfiles/checksums.
2. Add hard process termination at the specified failure boundaries.
3. Add a shared black-box contract harness that drives the same HTTP/SSE/ack scenarios against each candidate.
4. Benchmark identical hardware, PostgreSQL, connection budgets and payloads; at least five independent warm runs, report median and p95/p99.
5. Produce dependency SBOM/license review and one comparable maintenance task.
6. Only then update the candidate scorecard/ADR. If evidence is insufficient, keep the stack decision Open.

## Governance

All code remains under poc/. No product requirement, business-plan PDF, roadmap, pricing or user journey changed. No upstream messenger implementation was adopted. No changes to main, no deployment and no merge authorization.


## Follow-up correctness review — 2026-11-27

A cross-candidate review found that a fencing token alone is insufficient if an expired lease has not yet been reclaimed. Dispatch completion and retry writes now also require the lease to remain active at the instant of the write, using PostgreSQL `clock_timestamp()` rather than transaction-start `now()` so a long-running transaction cannot pass an expired-lease check with a stale timestamp. This invariant has been applied to Go, Node.js/TypeScript and Kotlin/Spring.

Additional integration coverage was added for:
- Expired lease rejection before another worker reclaims the row (all three candidates).
- Concurrent claims by five workers over ten rows without duplicate ownership (Go, Node, Kotlin).
- Terminal failure after the maximum attempt count (Go, Node, Kotlin).
- Existing stale-token-after-reclaim checks remain in place.

The Go run for the first new test commit failed only at the formatting gate (`store_test.go`); formatting was corrected. A Kotlin run failed because two newly appended tests were outside the test class; test placement was corrected. These failed intermediate runs are retained in Actions history and are not represented as passing. Final verification must use the exact current head and the three corresponding workflow runs.

Hard process-kill tests at transaction/claim/dispatch/ack boundaries, production identity/security, complete committed dependency lockfiles/checksums, SBOM/license inventory and sustained-load/resource benchmarks remain open. No stack selection is authorized.
