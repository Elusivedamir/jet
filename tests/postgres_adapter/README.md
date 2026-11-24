# PostgreSQL adapter experiment

Status: experimental comparison adapter. Not production code and not a production database decision.

## Run locally

Requires PostgreSQL 16+, Python 3.12+ and the pinned driver:

```sh
python -m pip install "psycopg[binary]==3.2.6" "psycopg-pool==3.2.6"
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

The adapter-specific suite tests atomic acceptance, rollback, unknown commit outcome recovery, same-key concurrent submissions, concurrent worker claims, lease fencing, retry timing and dead-letter ordering. The pooled variant uses `psycopg_pool` with a 1–4 connection pool and runs the same shared contract scenarios as both unpooled adapters. The shared behavioral suite in `adapter_contract/message_store_contract.py` also runs nine identical contract scenarios against PostgreSQL and SQLite. A schema-migration suite verifies clean initialization, idempotent reinitialization and adoption of the existing unversioned POC schema without losing data.

## Validation evidence

GitHub Actions run [#45337489838](https://github.com/Elusivedamir/jet/actions/runs/45337489838) passed 9 PostgreSQL integration tests on PostgreSQL 16 with Python 3.12 and psycopg 3.2.6. In the same run, 26 reference-model and 25 SQLite adapter tests also passed (60 total).

## Schema versioning and backup/restore

The adapter now records baseline schema version 1 in `schema_migrations`. Existing POC schemas without a registry are adopted as baseline version 1; this is a bootstrap marker, not a full chain of historical DDL migrations. Future incompatible schema changes must add ordered, forward-only migrations and tests from each supported prior version.

CI prepares a disposable schema, runs `pg_dump -Fc`, creates a second database, restores with `pg_restore`, and verifies the message, sequence and outbox states. GitHub Actions run [#45339014346](https://github.com/Elusivedamir/jet/actions/runs/45339014346) passed 3 schema-registry tests and the backup/restore workflow; the full run passed 81 tests across the reference model and both adapters. This is a logical backup/restore smoke test on one PostgreSQL 16 service, not a backup policy, point-in-time recovery, disaster-recovery or failover proof.

## Connection pooling experiment

`PooledPostgreSQLMessageStore` is a test-only variant. It reuses the same SQL and contract behavior through `psycopg_pool`; it does not add product/runtime dependencies. The benchmark compares fresh-connection and pooled PostgreSQL operation lifecycles side by side. Pool size 1–4 is only a test setting, not a production recommendation.

## Important limits

- This is a narrow POC; it is not wired into product/runtime code.
- It has not been tested for host/power-loss recovery, replication, backup/restore, failover, high availability or production load.
- It does not implement a scheduler, transport, receiver dedup store, operator replay/skip workflow, alerting or E2EE.
- PostgreSQL version and psycopg driver are pinned in CI for reproducibility, not approved as production choices.
- Nine shared behavioral scenarios now run against both SQLite and PostgreSQL; the PostgreSQL-specific suite remains separate for database-specific integration coverage.
- Schema version 1 currently records/adopts the baseline; a chain of future schema transformations is not yet implemented.
- A green CI run demonstrates only the listed integration tests against the CI PostgreSQL service.

The existing SQLite adapter remains unchanged as the comparison baseline.
