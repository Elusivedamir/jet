"""Disposable PostgreSQL logical backup/restore smoke check for CI."""
import os
import sys

import psycopg
from psycopg.conninfo import make_conninfo

from postgres_message_store import PostgreSQLMessageStore


SCHEMA = "jet_backup_fixture"


def prepare():
    source = os.environ["POSTGRES_DSN"]
    with psycopg.connect(source) as db:
        db.execute(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE')
        db.execute(f'CREATE SCHEMA "{SCHEMA}"')
    dsn = make_conninfo(source, options=f"-c search_path={SCHEMA}")
    store = PostgreSQLMessageStore(dsn)
    store.create_conversation("backup-room", ("sender", "recipient-b", "recipient-c"))
    message_id = store.send("sender", "backup-room", "backup-op", "backup-payload")
    claim = store.claim_next("backup-worker", "backup-token", 100, 60)
    assert claim["message_id"] == message_id
    assert claim["recipient_id"] == "recipient-b"
    print("Prepared one accepted message and a leased/pending outbox pair for backup.")


def verify():
    restored = os.environ["POSTGRES_RESTORE_DSN"]
    dsn = make_conninfo(restored, options=f"-c search_path={SCHEMA}")
    store = PostgreSQLMessageStore(dsn)
    messages, outbox, next_position = store.snapshot("backup-room")
    assert messages == [("msg:backup-room:1", 1, "sender", "backup-payload")]
    assert outbox == [
        ("msg:backup-room:1", "recipient-b", "leased"),
        ("msg:backup-room:1", "recipient-c", "pending"),
    ]
    assert next_position == 2
    print("Restored schema, message, sequence and both outbox states verified.")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"prepare", "verify"}:
        raise SystemExit("usage: backup_restore_check.py prepare|verify")
    {"prepare": prepare, "verify": verify}[sys.argv[1]]()
