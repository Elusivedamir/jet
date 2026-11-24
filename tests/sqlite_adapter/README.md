# SQLite durability experiment

This directory tests one concrete storage adapter against the implementation-neutral message contract.

Run:

```sh
python -m unittest discover -s tests/sqlite_adapter -p 'test_*.py' -v
```

The tests use Python's standard-library `sqlite3` module and temporary local database files. They exercise atomic persistence of the logical message, idempotency record, per-recipient outbox intents and conversation sequence; rollback before commit; recovery after a committed transaction whose response was lost; reopening the database; concurrent sequence allocation; and hard child-process termination before and after commit.

## Scope boundary

This is an isolated adapter experiment, **not** a decision to use SQLite in Jetson and not a production messaging server. It does not test network delivery, real devices, multi-process service deployment, replication, backups, restore, E2EE, throughput, or production operations. Hard process-kill tests validate local SQLite transaction recovery at the tested boundaries; they do not prove host/power-loss durability or production deployment behavior. A production adapter must repeat these contracts against its selected database and delivery infrastructure.

Current evidence: local adapter tests only. No production integration or load claim is made.
