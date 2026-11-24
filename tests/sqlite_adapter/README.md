# SQLite durability experiment

This directory tests one concrete storage adapter against the implementation-neutral message contract.

Run:

```sh
python -m unittest discover -s tests/sqlite_adapter -p 'test_*.py' -v
```

The tests use Python's standard-library `sqlite3` module and a temporary local database file. They exercise atomic persistence of the logical message, idempotency record, per-recipient outbox intents and conversation sequence; rollback before commit; recovery after a committed transaction whose response was lost; reopening the database; and concurrent sequence allocation.

## Scope boundary

This is an isolated adapter experiment, **not** a decision to use SQLite in Jetson and not a production messaging server. It does not test network delivery, real devices, multi-process deployment, replication, backups, restore, E2EE, throughput, or production operations. The simulated lost response occurs after the database commit; it is not a hard process-kill test at the operating-system boundary. A production adapter must repeat these contracts against its selected database and delivery infrastructure.

Current evidence: unit tests for this SQLite adapter only. No production integration or load claim is made.
