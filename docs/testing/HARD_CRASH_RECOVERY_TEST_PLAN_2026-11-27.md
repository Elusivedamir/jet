# Hard crash/restart recovery test plan — 2026-11-27

## Status

**Executable harness implemented.** All three process-kill scenarios and the 30-second concurrent soak passed on Go and Node. Kotlin passed all crash/contract/soak checks but its overall workflow remains failed by the conservative SBOM license gate.

## Objective

Prove that a message whose message row and outbox intent committed survives an abrupt application-process death while dispatch is in progress, and is delivered exactly once to the durable recipient inbox after restart and lease expiry.

Run the same scenario against Go, Node.js/TypeScript and Kotlin/Spring using PostgreSQL 17 and the same HTTP contract.

## Fault boundary

1. **Kill during dispatch transaction**
   - Start the direct server process and seed a two-member conversation.
   - Install a test-only PostgreSQL trigger on `recipient_inbox` that sleeps for five seconds for the test conversation.
   - Submit a message and verify HTTP 202.
   - Wait for PostgreSQL `pg_stat_activity` to show the worker inside `pg_sleep`, while the 15-second outbox lease is still valid.
   - Send SIGKILL to the actual server process.
   - Verify the recipient-inbox insert rolled back and the outbox row remains `processing`.
   - Drop the trigger, wait for lease expiry, restart the same server and verify one inbox row, completed outbox and idempotent retry.

2. **Kill after committed outbox claim, before dispatch completes**
   - Hold an AccessExclusiveLock on `recipient_inbox` using a separate PostgreSQL session.
   - Submit a message; wait until the outbox claim is committed in `processing` and the worker is blocked on the inbox insert.
   - Confirm the lease is still valid, then SIGKILL the server.
   - Release the table lock, verify no inbox row exists and the committed outbox state remains `processing`.
   - Wait for lease expiry, restart and verify one inbox row, completed outbox and idempotent retry.

3. **Lost acceptance response**
   - Send a complete HTTP request, keep the client socket open without reading the server response, and wait until a separate PostgreSQL connection observes the committed message row.
   - Only after the commit is observed, close the client socket without reading the response.
   - SIGKILL and restart the server.
   - Retry the same sender-scoped operation key and payload; verify the original message ID and one durable inbox row.

## Required assertions

- The accepted message and outbox intent survive process death.
- An uncommitted recipient-inbox insert is rolled back when the process dies.
- A committed processing lease is reclaimable after expiry and restart.
- The message is eventually present in the recipient inbox exactly once.
- The outbox reaches completed state with no stale lease token.
- A client that did not receive the acceptance response can retry idempotently.
- The harness records the observed SQL fault boundary, lease remaining, process SIGKILL, row counts, outbox state and HTTP retry result.
- A timeout, duplicate inbox row, missing message, stuck outbox, surviving process or inability to prove the fault boundary is a failure, not a skipped pass.

## Isolation and safety

- Use only the disposable PostgreSQL service database in CI.
- Use isolated test conversations and unique sender operation keys; cleanup only the harness fixtures.
- The sleep trigger is created and dropped by the harness. CI database teardown is the final cleanup boundary if the harness itself fails.
- Never expose a public HTTP crash/fault-injection endpoint or production environment variable.
- Launch the compiled/runtime process directly so SIGKILL targets the server, not a package-manager/build-tool parent.
- Keep ordinary integration and shared contract tests; crash scenarios supplement rather than replace them.

## Executed shared scenario — current result

**Implemented and executed** in the Go, Node.js and Kotlin CI candidate workflows through `poc/shared/crash_recovery_harness.py`.

The harness starts the direct server executable, creates an isolated PostgreSQL trigger that pauses recipient-inbox insertion for five seconds, confirms the worker lease still has about ten seconds remaining, sends SIGKILL to the server process, and verifies:
- no recipient inbox row was committed;
- the outbox row remains in processing state;
- after lease expiry and server restart, the outbox reaches completed;
- exactly one recipient inbox row exists;
- retrying the original sender/operation key returns the original message ID.

Observed PASS evidence:
- Go baseline run 87: [46025003199](https://github.com/Elusivedamir/jet/actions/runs/46025003199) — crash recovery and shared contract passed. Its later vulnerability step failed on the old toolchain; this does not invalidate the crash-test result.
- Node run 101: [46026586747](https://github.com/Elusivedamir/jet/actions/runs/46026586747) — crash recovery, shared contract, three-round benchmark, npm clean install and Trivy completed successfully.
- Kotlin run 101: [46026586769](https://github.com/Elusivedamir/jet/actions/runs/46026586769) — crash recovery, shared contract, three-round benchmark, Maven verification, CycloneDX and Trivy completed successfully.

This proves one crash boundary: process death during the recipient-inbox dispatch transaction. It does not prove every possible crash point or production-grade exactly-once device delivery.

## Remaining crash boundaries still required

- Process death after dispatch transaction commit but before the worker's next poll; assert the completed outbox is not replayed and the inbox remains unique.
- Recipient acknowledgement commits but its HTTP response is genuinely lost; retry acknowledgement and assert idempotency.
- Repeated kill/restart loops and recovery with multiple concurrent workers.

The 30-second concurrent write soak at concurrency 16 is also part of the shared harness; its result is pending the next three-candidate CI run.

## Acceptance gate

A candidate is marked PASS only when the executable test is committed, run in its own CI workflow, logs the fault boundary, and passes on the exact commit SHA. A design document or lease-expiry unit/integration test is not a substitute. Keep the production-release decision open until all three candidates have equivalent evidence and the remaining product/security gates are closed.


## Expanded executable harness — 2026-11-27

The shared `poc/shared/crash_recovery_harness.py` now executes three distinct process-failure scenarios:

1. **Kill during dispatch transaction:** a test-only PostgreSQL trigger pauses recipient-inbox insertion while the lease is valid; SIGKILL must roll back inbox insertion and outbox completion; restart after lease expiry must deliver one inbox row.
2. **Kill after committed claim, before dispatch completes:** the harness holds an AccessExclusiveLock on `recipient_inbox`, waits until the worker's committed outbox claim is in `processing` and the worker is blocked on the inbox insert, kills the server, releases the lock, waits for lease expiry and verifies recovery with one inbox row.
3. **Lost acceptance response:** the test client sends a complete HTTP request and closes without reading the response, waits for the committed message row, kills the server, restarts, then retries the same sender/operation key and verifies the original message ID and one durable inbox row.

Scenarios 1 and 2 have PASS evidence on Go run [46028089040](https://github.com/Elusivedamir/jet/actions/runs/46028089040), Node run [46028089075](https://github.com/Elusivedamir/jet/actions/runs/46028089075) and Kotlin run [46028089057](https://github.com/Elusivedamir/jet/actions/runs/46028089057). Scenario 3 (lost acceptance response) is implemented but awaits its first CI execution on the latest harness.

CI workflow hardening on this branch:
- All three workflows have read-only repository permissions.
- Research-branch push triggers run each candidate workflow when its source/shared files change.
- npm audit now fails the job for advisories at low severity or above; the license checker uses an explicit allow-list.
- Go's govulncheck and go-licenses checks are required; Trivy exits nonzero for HIGH/CRITICAL findings.
- Kotlin generates a third-party license inventory; Trivy exits nonzero for HIGH/CRITICAL findings.
- The updated Go dependency graph/checksum diff is retained as a CI artifact for review; do not claim the committed `go.sum` is refreshed until the artifact is reviewed and committed.

## Remaining crash boundaries

Still not implemented:
- process death after dispatch transaction commit but before the worker's next poll;
- recipient acknowledgement commit followed by a genuinely lost acknowledgement response;
- repeated kill/restart loops and recovery under concurrent worker processes.


## Latest exact-head execution — 2026-11-27

Source commit: `7a7301310cb6757cfe17046158c6da185138deea`.

- Go [run 46036340867](https://github.com/Elusivedamir/jet/actions/runs/46036340867): all three crash cases, shared contract, 30-second soak, govulncheck, third-party license allow-list and Trivy passed.
- Node [run 46036340934](https://github.com/Elusivedamir/jet/actions/runs/46036340934): all three crash cases, shared contract, 30-second soak, npm audit, license inventory and Trivy passed.
- Kotlin [run 46036340835](https://github.com/Elusivedamir/jet/actions/runs/46036340835): all three crash cases, shared contract and soak passed; the job later failed only at the conservative license policy check for three components requiring human/legal review.

### Harness defects found and corrected

1. Semgrep identified dynamic URL handling. Both shared HTTP harnesses now validate credential-free HTTP(S) origins and use `http.client`; regression tests cover real 204 health responses and JSON request/response behavior.
2. The crash harness function was named `http`, shadowing the imported `http.client` module. This prevented health probes from being sent while exceptions were swallowed. The helper is now named `http_request`, and health-check timeout errors include the last probe failure.
3. The original lost-response test closed the socket immediately after sending, before proving the server had committed. This made Go's request context cancel before persistence could finish. The helper now leaves the socket open without reading the response until PostgreSQL confirms the commit, then closes it. A regression test verifies the response is not read before close.

The corrected harness is more precise: it now tests a genuinely committed message with an intentionally discarded acceptance response, rather than a client disconnect racing the transaction.
