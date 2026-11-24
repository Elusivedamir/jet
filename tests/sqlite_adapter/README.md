# SQLite durability experiment

Project-wide evidence and integration status: [Engineering validation log](../../docs/testing/ENGINEERING_VALIDATION_LOG.md).

This directory tests one concrete storage adapter against the implementation-neutral message contract.

Run:

```sh
python -m unittest discover -s tests/sqlite_adapter -p 'test_*.py' -v
```

The tests use Python's standard-library `sqlite3` module and temporary local database files. They exercise atomic persistence of messages, conversation-scoped idempotency, per-recipient outbox intents and sequence allocation; rollback before commit; recovery after a committed transaction whose response was lost; hard child-process termination before and after commit; concurrent sends; leased outbox claims; lease expiry and reclamation; stale-token rejection; retry release; dispatch acknowledgement, deterministic capped exponential retry scheduling, bounded attempts, dead-letter marking, and receiver-side idempotency behavior under a simulated crash after the external side effect but before acknowledgement.

The outbox state `dispatched` means a worker acknowledged the dispatch operation. Retryable failures receive a caller-supplied `next_attempt_at`; the adapter does not own a wall-clock scheduler. Attempts are bounded by a caller-supplied limit. Exhausted or expired final attempts are marked `dead_letter`. A dead-lettered message blocks later messages for that recipient in the same conversation until an explicit operator policy is designed; this experiment does not implement replay or skip controls. It does **not** mean the recipient's device received, displayed or read the message. Those are separate lifecycle events and are outside this adapter experiment.

## Scope boundary

This is an isolated adapter experiment, **not** a decision to use SQLite in Jetson and not a production messaging server. It does not test network delivery, real devices, multi-process service deployment, replication, backups, restore, E2EE, throughput, or production operations. Hard process-kill tests validate local SQLite transaction recovery at the tested boundaries; they do not prove host/power-loss durability or production deployment behavior. A production adapter must repeat these contracts against its selected database and delivery infrastructure.

## Validation record

| GitHub Actions run | Commit | Result |
|---|---|---|
| #26 | `e5c30d24e6cada4b6bfe0a4372de364bf94e1168` | 16 tests passed |
| #30 | `c5850610d9e76f416a3b73b80bb9b9661c1752e6` | 17 tests passed |
| #64 | `67bdf12bdccce9a2fd16b0886454502acec5a12b` | 25 SQLite adapter tests passed; combined run also passed 13 reference-model tests |

Run #30 includes the per-recipient ordering regression. Run #64 adds bounded retry timing, max-attempt dead-lettering, legacy schema migration, expired-lease rejection and fake receiver deduplication after a simulated crash. The combined run compiled both packages and passed 38 tests total on GitHub Actions (Python 3.12 / Ubuntu).

At project integration level, the same CI workflow runs the in-memory reference-model suite and the SQLite adapter suite (currently 13 + 25 = 38 tests). The workflow is enabled for pull requests targeting `project/greenfield-reset`.

The retry helper uses deterministic capped exponential delays for testability; production jitter, durable scheduling policy, operator replay/skip workflow and alerting remain open. The receiver dedup test uses an in-memory fake and proves only the required idempotency-key behavior, not a real network transport.

Current evidence: automated adapter tests only. No production integration or load claim is made.
