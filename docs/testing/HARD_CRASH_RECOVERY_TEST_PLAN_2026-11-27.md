# Hard crash/restart recovery test plan — 2026-11-27

## Status

**Designed; not implemented or executed yet.** This document is a test specification, not evidence that any candidate passed a process-kill test. The existing lease-expiry, stale-token and transaction-rollback integration tests remain state-level tests.

## Objective

Prove that a message whose message row and outbox intent committed survives an abrupt application-process death while dispatch is in progress, and is delivered exactly once to the durable recipient inbox after restart and lease expiry.

Run the same scenario against Go, Node.js/TypeScript and Kotlin/Spring using PostgreSQL 17 and the same HTTP contract.

## Fault boundary

The first hard-crash scenario targets **after claim commit, during recipient-inbox dispatch, before dispatch transaction commit**:

1. Start PostgreSQL and seed a two-member conversation.
2. Install a test-only PostgreSQL trigger on recipient-inbox insertion. The trigger writes a marker row and sleeps long enough for the harness to observe it. It must be confined to the ephemeral CI database and removed after the scenario.
3. Start exactly one candidate server process with a short, explicit test lease (for example 3 seconds); verify health.
4. Submit one message using a stable operation key. Require HTTP 202, then verify the message and outbox row are committed.
5. Wait until the trigger marker proves the worker claimed the outbox row and entered the dispatch transaction.
6. Send SIGKILL to the **actual server process**, not a package-manager/build-tool parent. Verify the process is gone and PostgreSQL rolled back the in-flight dispatch transaction.
7. Remove the sleeping trigger while the application is stopped.
8. Restart the same candidate against the same database with the normal worker enabled.
9. Wait for lease expiry and recovery. Verify exactly one recipient-inbox row exists for the message, the outbox row is completed, and the original message/position remain unchanged.
10. Re-submit the same sender-scoped operation key and payload; verify the original logical message is returned and no second outbox/inbox delivery is created.

## Required assertions

- The accepted message and outbox intent survive process death.
- The uncommitted recipient-inbox insert is rolled back when the process dies.
- The expired processing lease becomes reclaimable after restart.
- The message is eventually present in the recipient inbox exactly once.
- The outbox reaches completed state with no stale lease token.
- The sender retry is idempotent and does not create another logical message.
- The harness records process exit status, marker observation, recovery duration, SQL row counts and HTTP results.
- A timeout, duplicate inbox row, missing message, stuck outbox, surviving process or inability to prove the fault boundary is a failure, not a skipped pass.

## Isolation and safety

- Use only the disposable PostgreSQL service database in CI.
- Use a unique conversation/message per run; clean up only those fixture rows.
- The sleep trigger and marker table must be created and dropped by the harness, with cleanup in a finally/trap path.
- Never expose a public HTTP crash/fault-injection endpoint or production environment variable.
- Launch the compiled/runtime process directly so SIGKILL targets the server, not a wrapper. Confirm PID identity before killing.
- Keep the existing ordinary integration and shared contract tests; this scenario supplements rather than replaces them.

## Additional crash boundaries still required

The first scenario does not cover every failure point. Separate tests are still required for:
- commit succeeds but the HTTP acceptance response is lost;
- process death immediately after outbox claim commit and before dispatch begins;
- process death after recipient inbox insert but before outbox completion commit;
- process death after dispatch commit but before worker acknowledgement/next poll;
- recipient acknowledgement commit followed by lost HTTP response.

For each, assert idempotent retry/recovery and no lost or duplicate logical delivery.

## Acceptance gate

A candidate is marked PASS only when the executable test is committed, run in its own CI workflow, logs the fault boundary, and passes on the exact commit SHA. A design document or lease-expiry unit/integration test is not a substitute. Keep all candidate scores and the production-stack decision Open until all three candidates have equivalent evidence.
