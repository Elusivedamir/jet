"""Real PostgreSQL process-exit recovery tests.

These tests terminate a child process without Python cleanup handlers. They
verify that PostgreSQL rolls back an open transaction after client death and
that a committed send is recovered through the same idempotency key.
"""
import os
import subprocess
import sys
import unittest
import uuid
from pathlib import Path

import psycopg
from psycopg.conninfo import make_conninfo

from postgres_message_store import PostgreSQLMessageStore


class PostgreSQLProcessCrashRecoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dsn = os.environ["POSTGRES_DSN"]
        cls.module_dir = str(Path(__file__).resolve().parent)

    def setUp(self):
        self.schema = "jet_crash_" + uuid.uuid4().hex
        with psycopg.connect(self.base_dsn) as db:
            db.execute(f'CREATE SCHEMA "{self.schema}"')
        self.dsn = make_conninfo(
            self.base_dsn, options=f"-c search_path={self.schema}"
        )
        self.store = PostgreSQLMessageStore(self.dsn)
        self.store.create_conversation("room-crash", ("A", "B", "C"))

    def tearDown(self):
        with psycopg.connect(self.base_dsn) as db:
            db.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')

    def run_child(self, script, exit_code):
        return subprocess.run(
            [sys.executable, "-c", script, self.dsn, self.module_dir, str(exit_code)],
            capture_output=True,
            text=True,
            timeout=20,
        )

    def test_hard_process_exit_inside_transaction_rolls_back_all_rows(self):
        script = r"""
import os, sys, psycopg
dsn, _, exit_code = sys.argv[1], sys.argv[2], int(sys.argv[3])
db = psycopg.connect(dsn, autocommit=True)
db.execute("BEGIN")
db.execute(
    "SELECT next_position FROM conversations WHERE conversation_id=%s FOR UPDATE",
    ("room-crash",),
)
message_id = "msg:room-crash:1"
db.execute(
    "INSERT INTO messages(message_id, conversation_id, position, sender_id, operation_key, payload) "
    "VALUES (%s, %s, %s, %s, %s, %s)",
    (message_id, "room-crash", 1, "A", "crash-before-commit", "payload"),
)
db.execute(
    "INSERT INTO idempotency(conversation_id, sender_id, operation_key, payload, message_id) "
    "VALUES (%s, %s, %s, %s, %s)",
    ("room-crash", "A", "crash-before-commit", "payload", message_id),
)
with db.cursor() as cursor:
    cursor.executemany(
        "INSERT INTO outbox(message_id, recipient_id) VALUES (%s, %s)",
        [(message_id, "B"), (message_id, "C")],
    )
db.execute(
    "UPDATE conversations SET next_position=2 WHERE conversation_id=%s",
    ("room-crash",),
)
os._exit(exit_code)
"""
        child = self.run_child(script, 71)
        self.assertEqual(71, child.returncode, child.stderr)
        messages, outbox, next_position = self.store.snapshot("room-crash")
        self.assertEqual([], messages)
        self.assertEqual([], outbox)
        self.assertEqual(1, next_position)

    def test_hard_process_exit_after_commit_recovers_same_operation(self):
        script = r"""
import os, sys
sys.path.insert(0, sys.argv[2])
from postgres_message_store import PostgreSQLMessageStore
store = PostgreSQLMessageStore(sys.argv[1])
store.send("A", "room-crash", "crash-after-commit", "payload")
os._exit(int(sys.argv[3]))
"""
        child = self.run_child(script, 72)
        self.assertEqual(72, child.returncode, child.stderr)

        restarted = PostgreSQLMessageStore(self.dsn)
        recovered = restarted.send(
            "A", "room-crash", "crash-after-commit", "payload"
        )
        messages, outbox, next_position = restarted.snapshot("room-crash")
        self.assertEqual("msg:room-crash:1", recovered)
        self.assertEqual(1, len(messages))
        self.assertEqual(2, len(outbox))
        self.assertEqual(2, next_position)


if __name__ == "__main__":
    unittest.main(verbosity=2)
