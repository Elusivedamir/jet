# PostgreSQL adapter experiment

Status: experimental comparison adapter. Not production code and not a production database decision.

## Run locally

Requires PostgreSQL 16+, Python 3.12+ and the pinned driver:

```sh
python -m pip install "psycopg[binary]==3.2.6"
export POSTGRES_DSN="postgresql://USER:PASSWORD@127.0.0.1:5432/DATABASE"
python -m unittest discover -s tests/postgres_adapter -p 'test_*.py' -v
```

The tests create a unique schema for each test and drop it afterward. The supplied CI profile starts an isolated PostgreSQL 16 service; its credentials are test-only.

## Scope

The adapter mirrors the existing SQLite experiment's public operation shapes:
- create conversation;
- transactional message acceptance, idempotency and per-recipient outbox creation;
- claim one due outbox row using row-level locking and `SKIP LOCKED`;
- acknowledge, release/retry and dead-letter;
- snapshot for test assertions.

The adapter-specific suite tests atomic acceptance, rollback, unknown commit outcome recovery, same-key concurrent submissions, concurrent worker claims, lease fencing, retry timing and dead-letter ordering. The shared behavioral suite in `adapter_contract/message_store_contract.py` also runs nine identical contract scenarios against PostgreSQL and SQLite.

## Validation evidence

GitHub Actions run [#45337489838](https://github.com/Elusivedamir/jet/actions/runs/45337489838) passed 9 PostgreSQL integration tests on PostgreSQL 16 with Python 3.12 and psycopg 3.2.6. In the same run, 26 reference-model and 25 SQLite adapter tests also passed (60 total).

## Important limits

- This is a narrow POC; it is not wired into product/runtime code.
- It has not been tested for host/power-loss recovery, replication, backup/restore, failover, high availability or production load.
- It does not implement a scheduler, transport, receiver dedup store, operator replay/skip workflow, alerting or E2EE.
- PostgreSQL version and psycopg driver are pinned in CI for reproducibility, not approved as production choices.
- Nine shared behavioral scenarios now run against both SQLite and PostgreSQL; the PostgreSQL-specific suite remains separate for database-specific integration coverage.
- The schema initializer handles clean schemas; a versioned forward migration from a prior PostgreSQL schema is not implemented.
- A green CI run demonstrates only the listed integration tests against the CI PostgreSQL service.

The existing SQLite adapter remains unchanged as the comparison baseline.
