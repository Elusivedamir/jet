import os
import threading
import unittest
import uuid

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo

from postgres_message_store import (
    IdempotencyConflict, OutboxClaimError, PostgresMessageStore,
    SendRejected, UnknownOutcome,
)


class PostgresAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dsn = os.environ.get("POSTGRES_DSN")
        if not cls.base_dsn:
            raise unittest.SkipTest("POSTGRES_DSN is required for PostgreSQL integration tests")

    def setUp(self):
        self.schema = "jet_test_" + uuid.uuid4().hex
        with psycopg.connect(self.base_dsn, autocommit=True) as admin:
            admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
        self.dsn = make_conninfo(self.base_dsn, options=f"-c search_path={self.schema}")
        self.store = PostgresMessageStore(self.dsn)
        self.store.create_conversation("room-1", ("A", "B", "C"))

    def tearDown(self):
        with psycopg.connect(self.base_dsn, autocommit=True) as admin:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(self.schema)))

    def test_send_commits_message_idempotency_and_recipient_outbox_atomically(self):
        message_id = self.store.send("A", "room-1", "op-1", "hello")
        messages, outbox, next_position = self.store.snapshot("room-1")
        self.assertEqual([(message_id, 1, "A", "hello")], messages)
        self.assertEqual([(message_id, "B", "pending"), (message_id, "C", "pending")], outbox)
        self.assertEqual(2, next_position)

    def test_failure_before_commit_leaves_no_partial_state(self):
        with self.assertRaises(SendRejected):
            self.store.send("A", "room-1", "op-1", "hello", fail_before_commit=True)
        self.assertEqual(([], [], 1), self.store.snapshot("room-1"))

    def test_unknown_outcome_recovers_same_message_after_reopen(self):
        with self.assertRaises(UnknownOutcome):
            self.store.send("A", "room-1", "op-1", "hello", lose_response_after_commit=True)
        reopened = PostgresMessageStore(self.dsn)
        self.assertEqual("msg:room-1:1", reopened.send("A", "room-1", "op-1", "hello"))
        messages, outbox, next_position = reopened.snapshot("room-1")
        self.assertEqual(1, len(messages))
        self.assertEqual(2, len(outbox))
        self.assertEqual(2, next_position)

    def test_conflicting_idempotency_payload_is_rejected(self):
        self.store.send("A", "room-1", "op-1", "original")
        with self.assertRaises(IdempotencyConflict):
            self.store.send("A", "room-1", "op-1", "different")
        self.assertEqual("original", self.store.snapshot("room-1")[0][0][3])

    def test_nonmember_cannot_send(self):
        with self.assertRaises(SendRejected):
            self.store.send("outsider", "room-1", "op-1", "hello")
        self.assertEqual(([], [], 1), self.store.snapshot("room-1"))

    def test_workers_claim_distinct_recipients_and_ack(self):
        self.store.send("A", "room-1", "op-1", "hello")
        first = self.store.claim_next("worker-1", "token-1", 100, 30)
        second = self.store.claim_next("worker-2", "token-2", 100, 30)
        self.assertEqual({"B", "C"}, {first["recipient_id"], second["recipient_id"]})
        self.store.acknowledge_dispatch(first["message_id"], first["recipient_id"],
                                        first["claim_token"], 101)
        with self.assertRaises(OutboxClaimError):
            self.store.acknowledge_dispatch(first["message_id"], first["recipient_id"],
                                            first["claim_token"], 102)

    def test_expired_lease_is_reclaimed_and_stale_token_is_fenced(self):
        self.store.send("A", "room-1", "op-1", "hello")
        first = self.store.claim_next("worker-1", "old", 100, 10)
        reclaimed = self.store.claim_next("worker-2", "new", 110, 20)
        self.assertEqual(first["recipient_id"], reclaimed["recipient_id"])
        self.assertEqual(2, reclaimed["attempt"])
        with self.assertRaises(OutboxClaimError):
            self.store.acknowledge_dispatch(first["message_id"], first["recipient_id"], "old", 111)
        self.store.acknowledge_dispatch(reclaimed["message_id"], reclaimed["recipient_id"], "new", 112)

    def test_retry_delay_and_bounded_dead_letter(self):
        self.store.send("A", "room-1", "op-1", "hello")
        first = self.store.claim_next("worker-1", "first", 100, 30, max_attempts=2)
        other = self.store.claim_next("worker-2", "clear-c", 100, 30, max_attempts=2)
        self.store.acknowledge_dispatch(other["message_id"], other["recipient_id"],
                                        other["claim_token"], 101)
        state = self.store.release_claim(first["message_id"], first["recipient_id"], "first",
                                         failed_at=101, retry_at=105, max_attempts=2,
                                         error="temporary failure")
        self.assertEqual("pending", state)
        self.assertIsNone(self.store.claim_next("worker-3", "too-early", 104, 30, max_attempts=2))
        second = self.store.claim_next("worker-3", "second", 105, 30, max_attempts=2)
        self.assertEqual(2, second["attempt"])
        state = self.store.release_claim(second["message_id"], second["recipient_id"], "second",
                                         failed_at=106, retry_at=106, max_attempts=2,
                                         error="still failing")
        self.assertEqual("dead_letter", state)
        self.assertIsNone(self.store.claim_next("worker-4", "later", 107, 30, max_attempts=2))
        self.assertEqual("dead_letter", self.store.snapshot("room-1")[1][0][2])

    def test_later_message_waits_behind_earlier_recipient_item(self):
        first_id = self.store.send("A", "room-1", "op-1", "first")
        second_id = self.store.send("A", "room-1", "op-2", "second")
        b = self.store.claim_next("worker-1", "b-first", 100, 30)
        c = self.store.claim_next("worker-2", "c-first", 100, 30)
        self.assertEqual({first_id}, {b["message_id"], c["message_id"]})
        self.assertIsNone(self.store.claim_next("worker-3", "blocked", 100, 30))
        self.store.acknowledge_dispatch(first_id, "B", "b-first", 101)
        next_b = self.store.claim_next("worker-3", "b-second", 102, 30)
        self.assertEqual((second_id, "B"), (next_b["message_id"], next_b["recipient_id"]))

    def test_concurrent_workers_do_not_claim_same_outbox_row(self):
        self.store.send("A", "room-1", "op-1", "hello")
        barrier = threading.Barrier(2)
        claims, errors = [], []

        def worker(name, token):
            try:
                barrier.wait()
                claims.append(self.store.claim_next(name, token, 100, 30))
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(target=worker, args=("worker-1", "parallel-1")),
            threading.Thread(target=worker, args=("worker-2", "parallel-2")),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)
        self.assertEqual([], errors)
        self.assertEqual(2, len(claims))
        self.assertEqual(2, len({(c["message_id"], c["recipient_id"]) for c in claims}))


if __name__ == "__main__":
    unittest.main(verbosity=2)
