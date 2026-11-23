# Message Reliability — Implementation-Neutral Test Plan

**Status:** Engineering proposal; not an implementation or a product-scope approval.  
**Source of truth:** `docs/product/BUSINESS_PLAN_BASELINE.md`; acceptance trace: `docs/product/PRODUCT_REQUIREMENTS_AND_ACCEPTANCE.md` (`CORE-003`, `CORE-004`, Gate A and cross-cutting reliability).  
**Research inputs:** `docs/research/AGENT_REPORT_MESSAGE_RELIABILITY.md` and `docs/research/JETSON_ARCHITECTURE_SYNTHESIS.md`.  
**No stack assumption:** tests are expressed as observable contracts and fault points. They can be adapted to any eventual persistence, broker, transport or client implementation.

## 1. Objective and non-goals

Prove that a direct message acknowledged as accepted is durably recoverable, that retries and crashes do not silently lose it or create unintended duplicate user-visible messages, and that reconnect returns a gap-free conversation history within the defined product semantics.

This plan does **not** claim exactly-once network delivery. A distributed system may execute an operation more than once. The required outcome is idempotent user-visible effect for the same logical client submission, with durable reconciliation of uncertain outcomes.

Out of scope for this first test slice: choosing a database/broker/protocol, defining E2EE/key lifecycle, attachment semantics, edits/deletes/reactions, global ordering, numerical throughput/SLO, legal retention, group size/role policy, push-provider behavior and read-receipt privacy. Group chat receives a limited fan-out extension after direct-message invariants pass.

## 2. Vocabulary and observable states

| State/event | Meaning | What it does not prove |
|---|---|---|
| Received | Server received and parsed a request | Authorization, persistence or acceptance |
| Rejected | Request failed validation/authorization/policy | That a message was stored |
| Persisted | Message record and conversation sequence committed durably | Recipient device received it |
| Accepted | Server acknowledged the stable client operation as persisted | Online delivery or read |
| Fan-out pending | Durable delivery work remains to be processed | A worker has attempted delivery |
| Dispatch attempted | A delivery attempt was made | Recipient received or displayed it |
| Device delivered | A defined recipient-device acknowledgement was observed | Human read the content |
| Read | A separate read event was recorded under product rules | That every device/user saw it |
| Unknown outcome | Caller cannot know whether the operation committed | Failure; blindly retrying may duplicate work |

Acceptance response MUST identify the stable logical submission (client operation ID or equivalent) and the persisted message identity/sequence needed for reconciliation. Exact wire format remains OPEN.

## 3. Core invariants (test oracles)

- **INV-01 Durable acknowledgement:** no success/accepted response before the message and its conversation sequence are durably committed.
- **INV-02 Retry identity:** retries of one logical submission reuse a stable idempotency identity. Same identity + same payload resolves to the same logical message; same identity + different payload is rejected as a conflict.
- **INV-03 No silent loss after acceptance:** every accepted message is retrievable from history after process restart and reconnect, or a clearly surfaced integrity failure exists. It must not disappear silently.
- **INV-04 No unintended duplicate effect:** repeated requests, queue redelivery or worker restart may repeat internal execution, but must not create a second logical message or a second recipient-visible copy for the same operation.
- **INV-05 Conversation order:** each conversation has a deterministic committed order. Concurrent submissions receive unique, monotonic conversation positions. Do not assert global order across conversations.
- **INV-06 Durable fan-out recovery:** after persistence, unfinished recipient delivery work is recoverable after a crash. A persisted message cannot be stranded forever solely because the process died between persistence and dispatch scheduling.
- **INV-07 Receipt separation:** server acceptance, device delivery and read are distinct facts. One cannot be inferred from another.
- **INV-08 Authorization:** sender and recipient history/sync reads are scoped to the authenticated account and conversation membership/permissions.
- **INV-09 Cursor safety:** reconnect/sync cursor advancement cannot skip a committed message. Replaying a prior cursor may return duplicates at the transport layer, but client application must deduplicate by stable message identity.
- **INV-10 Explicit failure:** terminal rejection/failure is distinguishable from retryable failure and unknown outcome. No false success is shown.
- **INV-11 Observability without leakage:** logs/metrics expose correlation IDs, state transitions and error classes, but not message bodies, credentials or sensitive content.
- **INV-12 Retention boundary:** test fixtures are isolated and disposable; no production-user data is used.

## 4. Test environment contract

Minimum logical actors:
- Account A: sender, one active device.
- Account B: recipient, initially online; later offline/reconnecting.
- Account C: unrelated account used for authorization isolation.
- Server under test with controllable process stop/restart.
- Durable-store adapter with injectable write/commit failure.
- Delivery-work adapter with pause, duplicate, delay, reorder and failure controls.
- Client harness capable of preserving the same operation ID across retries and recording every user-visible message identity.

The harness must expose deterministic barriers at these boundaries:
1. request received and validated;
2. durable message write started;
3. durable transaction committed;
4. acceptance response emitted;
5. delivery work recorded/queued;
6. delivery attempt started;
7. recipient acknowledgement received;
8. sync page returned and cursor advanced.

A barrier is a test seam, not a required production API. If the selected implementation cannot inject a failure at a boundary, document the substitute and its limitation.

Use isolated test data and a controllable clock. Every test records build/revision, environment, seed, account/device IDs, operation IDs, message IDs, conversation positions, injected fault, observed event timeline and final store/client state.

## 5. Prioritized test cases

| ID | Priority | Scenario / injected condition | Required assertions |
|---|---|---|---|
| MSG-001 | P0 | Happy-path direct send, both users online | One durable message; sender receives accepted only after commit; recipient receives same message identity; state transitions are correctly distinguished. |
| MSG-002 | P0 | Store write fails before commit | No accepted response; sender sees retryable/terminal error according to classified cause; no history entry or delivery event. |
| MSG-003 | P0 | Crash immediately before durable commit | After restart, no accepted ghost; retry with same operation ID creates at most one message. |
| MSG-004 | P0 | Crash immediately after commit, before acceptance response | Client sees timeout/unknown outcome; retry/reconcile with same operation ID returns the already committed message; no second logical message. |
| MSG-005 | P0 | Duplicate concurrent request with same operation ID and payload | Both callers resolve consistently to one message identity and one conversation position. |
| MSG-006 | P0 | Same operation ID reused with a different payload | Deterministic conflict; original message unchanged; no second message. |
| MSG-007 | P0 | Crash after commit but before delivery work is recorded | Recovery discovers pending delivery from durable state/outbox/equivalent; recipient eventually receives one logical message. |
| MSG-008 | P0 | Delivery worker crashes after sending but before recording completion | Redelivery may occur internally; recipient/client deduplicates by stable identity; one visible message. |
| MSG-009 | P0 | Recipient offline during send; server restarts; recipient reconnects | Accepted message remains durable and appears in history/sync; cursor advances without skipping it. |
| MSG-010 | P0 | Sync page delivered but client crashes before persisting cursor | Repeating same cursor is safe; no message loss and no duplicate visible message after client deduplication. |
| MSG-011 | P0 | Cursor persisted by client, then next page request fails | Retry resumes from the last committed client cursor; no gaps. Cursor must only advance according to documented page-application semantics. |
| MSG-012 | P0 | Two or more concurrent sends in one conversation | Unique positions; deterministic order; no duplicate position; order matches documented server commit serialization, not client wall-clock assumptions. |
| MSG-013 | P0 | Two concurrent sends in different conversations | Independent progress; no accidental global serialization requirement or cross-conversation leakage. |
| MSG-014 | P0 | Account C requests A/B conversation history or sync cursor | Access denied; no content, metadata or cursor leakage. |
| MSG-015 | P1 | Recipient acknowledges delivery, then read event arrives later | Delivery and read remain separate timestamps/events; read cannot precede message existence. |
| MSG-016 | P1 | Duplicate/out-of-order delivery and receipt events | State converges monotonically according to explicit rules; older events do not regress delivered/read state. |
| MSG-017 | P1 | Store unavailable during recovery/restart | Service does not acknowledge undurable sends; recovery resumes safely after store returns; no silent queue discard. |
| MSG-018 | P1 | Delivery subsystem unavailable while message storage works | Message can be accepted only if durable delivery intent is also recorded; backlog visible and recoverable. |
| MSG-019 | P1 | Poison/invalid delivery item | Bounded retry and quarantine/dead-letter policy; other conversations continue; operator-visible reason; no infinite hot loop. |
| MSG-020 | P1 | Retry storm / repeated network timeout | Backoff and bounded concurrency prevent unbounded amplification; one logical message per operation ID; service remains responsive. |
| MSG-021 | P1 | User removed/blocked or membership revoked before dispatch | Authorization/policy is rechecked at the correct boundary; no unauthorized delivery. Exact product policy must be decided before this test becomes a release gate. |
| MSG-022 | P1 | Group fan-out to multiple recipients, one recipient path fails | Per-recipient outcomes are represented; successful recipients are not resent unnecessarily; failed recipient work is recoverable. Only run after group semantics are specified. |
| MSG-023 | P1 | Backup restore to a clean environment | Accepted messages, operation-id dedup records, sequence/cursor state and pending delivery intent restore consistently; post-restore retry does not duplicate. |
| MSG-024 | P2 | Long history pagination with inserts during pagination | Documented snapshot/cursor semantics prevent gaps; duplicates are deduplicable; no global ordering claim. |
| MSG-025 | P2 | Clock skew between client/server/workers | Ordering and idempotency do not depend on synchronized wall clocks; timestamps are metadata, sequence is authoritative within its defined scope. |

P0 tests are mandatory before Gate A can pass. P1/P2 priorities are proposed engineering sequencing, not changes to business-plan scope.

## 6. Fault-injection schedule

For each P0 test, run each applicable boundary at least once:
- kill server process (hard termination, not graceful shutdown);
- terminate worker process;
- drop client connection before and after server commit;
- make durable store reject write, timeout, or lose connection at commit;
- make delivery adapter timeout before send, after send, and before completion record;
- restart with pending work;
- duplicate and reorder delivery-work events.

A test report must state which boundaries were actually exercised. Do not describe a test as "crash-safe" based only on a graceful restart.

## 7. Pass/fail rules

A P0 test passes only if all its assertions hold over repeated deterministic runs and a randomized repetition set with recorded seeds. The initial engineering baseline is 100 deterministic repetitions per P0 case and 1,000 randomized operation sequences for the reference/state-machine test layer. These are test-count proposals, not throughput or availability SLOs. If runtime cost is prohibitive, record the reduced count and do not silently call it equivalent.

Any accepted-message loss, duplicate logical message, cursor gap, unauthorized data exposure, acceptance-before-durability, or inability to recover pending delivery is a P0 failure and blocks Gate A.

A test is **Blocked** when required product semantics or a controllable fault seam is undefined. A test is **Not run** until execution evidence exists. Static review is not a passing test.

## 8. Required evidence artifact per run

Record:
- test ID and exact assertion version;
- source commit and build identifier;
- environment/topology and dependency versions;
- deterministic seed and operation sequence;
- fault injection point and timing;
- expected versus actual event timeline;
- persisted rows/records (redacted identifiers only), message IDs, conversation positions, cursors and delivery attempts;
- logs/metrics with content redacted;
- pass/fail/blocked/not-run status;
- issue link for every failure and reproduction instructions.

Do not store real message bodies, tokens, personal data or production identifiers in test artifacts.

## 9. Execution sequence and stop conditions

1. Build a deterministic state-machine/reference test layer for INV-01..INV-10, independent of any database or transport.
2. Build the direct-message integration harness against the first candidate implementation only after its persistence and delivery seams are defined.
3. Run MSG-001..MSG-014 (P0) and fix every blocker/failure.
4. Add MSG-015..MSG-023 (P1) and the restore exercise.
5. Add pagination/clock-skew cases (P2).
6. Only after correctness passes, define workload profiles and run performance tests. Do not infer throughput from unit tests.

Stop and investigate immediately on accepted-message loss, duplicate logical message, cursor gap, unauthorized data exposure, or a success acknowledgement before durable commit.

## 10. Open decisions required before integration tests

- Exact meaning and wire representation of "accepted".
- Client operation ID generation, retention window and conflict response.
- Conversation sequence allocation/serialization rules.
- Sync cursor ownership, page application and advancement semantics.
- Definition of recipient-device delivery acknowledgement.
- Whether/when read receipts exist and their privacy controls.
- Membership/block/removal policy at send and dispatch time.
- Group fan-out and partial-delivery semantics.
- RPO/RTO and retention policy.
- First supported client platforms and multi-device scope.

These are intentionally OPEN. The test plan does not decide them on behalf of the product owner.

## 11. Traceability

| Product requirement | Test coverage |
|---|---|
| CORE-003 — Direct messages | MSG-001..MSG-021 |
| CORE-004 — Basic chats | MSG-012, MSG-022, subject to group semantics |
| Reliability: durable acknowledged messages | INV-01, INV-03; MSG-001..MSG-004, MSG-007 |
| Reliability: retries and duplicates | INV-02, INV-04; MSG-004..MSG-008, MSG-020 |
| Reliability: ordering and reconnect | INV-05, INV-09; MSG-009..MSG-013, MSG-024 |
| Security and authorization | INV-08; MSG-014, MSG-021 |
| Backup/restore | INV-03, INV-06; MSG-023 |
| Receipt semantics | INV-07; MSG-015, MSG-016 |

**Current execution status: Not run.** This document defines tests; it is not evidence that a Jetson implementation exists or passes them.
