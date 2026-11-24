# PostgreSQL adapter experiment

This is a second, independent persistence/outbox adapter experiment against the implementation-neutral contracts. It is intentionally isolated from the SQLite code and is not production Jetson code or a technology selection.

## Run

Requires PostgreSQL 16+ and Python 3.10+.

```sh
python -m pip install -r tests/postgres_adapter/requirements.txt
POSTGRES_DSN='postgresql://postgres:postgres@localhost:5432/jetson_test' \
  python -m unittest discover -s tests/postgres_adapter -p 'test_*.py' -v
```

The tests create a unique temporary schema per test and remove it afterward. The adapter uses psycopg 3, transactional sequence allocation, conversation-scoped idempotency, atomic message/idempotency/outbox insertion, recipient-scoped claims with PostgreSQL row locks and `SKIP LOCKED`, lease-token fencing, retry scheduling, bounded dead-lettering and per-recipient ordering.

## Evidence boundary

A passing local PostgreSQL service-container CI run proves only the tested adapter behavior against that PostgreSQL version and test workload. It does not prove production topology, host/power-loss behavior, failover, replication, backup/restore, connection-pool sizing, security hardening, throughput, availability, E2EE or operational cost. The test uses deterministic caller-supplied timestamps; production clock and scheduler policy remain open.

No exactly-once network-delivery claim is made. A dispatcher acknowledgement is not a device-delivery or read receipt. PostgreSQL remains an experimental comparison candidate, not a selected production database.
