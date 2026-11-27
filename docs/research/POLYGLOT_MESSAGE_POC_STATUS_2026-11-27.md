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

## CI evidence

At document creation, three workflows had been queued against head commit 3d2f8638ab99aae7c9a7262a0d72f6ccc6efa730:

- [Go durable-message PoC](https://github.com/Elusivedamir/jet/actions/runs/46014572078)
- [Node TypeScript message PoC](https://github.com/Elusivedamir/jet/actions/runs/46014572116)
- [Kotlin Spring message PoC](https://github.com/Elusivedamir/jet/actions/runs/46014572103)

Their final conclusions must be updated after completion. No candidate is scored or selected by this status note.

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
