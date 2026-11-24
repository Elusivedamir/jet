import os
import threading
import unittest
import uuid

import psycopg
from psycopg.conninfo import make_conninfo

from postgres_message_store import (
    IdempotencyConflict, OutboxClaimError, PostgreSQLMessageStore,
    SendRejected, UnknownOutcome,
)


class PostgreSQLAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dsn = os.environ["POSTGRES_DSN"]

    def setUp(self):
        self.schema = "jet_test_" + uuid.uuid4().hex
        with psycopg.connect(self.base_dsn) as db:
            db.execute(f'CREATE SCHEMA "{self.schema}"')
        self.dsn = make_conninfo(
            self.base_dsn, options=f"-c search_path={self.schema}"
        )
        self.store = PostgreSQLMessageStore(self.dsn)
        self.store.create_conversation("room-1", ("A", "B", "C"))

    def tearDown(self):
        with psycopg.connect(self.base_dsn) as db:
            db.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')

    def test_atomic_acceptance_and_outbox_rows(self):
        message_id = self.store.send("A", "room-1", "op-1", "hello")
        messages, outbox, next_position = self.store.snapshot("room-1")
        self.assertEqual([(message_id, 1, "A", "hello")], messages)
        self.assertEqual(
            [(message_id, "B", "pending"), (message_id, "C", "pending")],
            outbox,
        )
        self.assertEqual(2, next_position)

    def test_failure_before_commit_rolls_back_everything(self):
        with self.assertRaises(SendRejected):
            self.store.send("A", "room-1", "op-1", "hello", fail_before_commit=True)
        self.assertEqual(([], [], 1), self.store.snapshot("room-1"))

    def test_unknown_commit_outcome_is_idempotently_recovered(self):
        with self.assertRaises(UnknownOutcome):
            self.store.send(
                "A", "room-1", "op-1", "hello", lose_response_after_commit=True
            )
        restarted = PostgreSQLMessageStore(self.dsn)
        recovered = restarted.send("A", "room-1", "op-1", "hello")
        self.assertEqual("msg:room-1:1", recovered)
        self.assertEqual(1, len(restarted.snapshot("room-1")[0]))
        self.assertEqual(2, len(restarted.snapshot("room-1")[1]))

    def test_idempotency_conflict_does_not_mutate(self):
        self.store.send("A", "room-1", "op-1", "original")
        with self.assertRaises(IdempotencyConflict):
            self.store.send("A", "room-1", "op-1", "different")
        self.assertEqual("original", self.store.snapshot("room-1")[0][0][3])

    def test_concurrent_same_key_returns_one_message(self):
        barrier = threading.Barrier(8)
        results, errors = [], []
        def worker():
            try:
                barrier.wait(timeout=5)
                results.append(self.store.send("A", "room-1", "same-key", "same-payload"))
            except Exception as exc:
                errors.append(exc)
        threads = [threading.Thread(target=worker) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)
        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual([], errors)
        self.assertEqual(1, len(set(results)))
        messages, outbox, next_position = self.store.snapshot("room-1")
        self.assertEqual(1, len(messages))
        self.assertEqual(2, len(outbox))
        self.assertEqual(2, next_position)

    def test_concurrent_claims_are_exclusive_and_recipient_scoped(self):
        barrier = threading.Barrier(2)
        claims, errors = [], []
        def worker(name, token):
            try:
                barrier.wait(timeout=5)
                claims.append(self.store.claim_next(name, token, 100, 30))
            except Exception as exc:
                errors.append(exc)
        threads = [
            threading.Thread(target=worker, args=("w1", "t1")),
            threading.Thread(target=worker, args=("w2", "t2")),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)
        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual([], errors)
        self.assertEqual(2, len(claims))
        self.assertEqual({"B", "C"}, {claim["recipient_id"] for claim in claims})
        self.assertEqual(1, len({claim["message_id"] for claim in claims}))

    def test_expired_claim_is_fenced_from_stale_ack(self):
        first = self.store.claim_next("w1", "old", 100, 10)
        reclaimed = self.store.claim_next("w2", "new", 110, 20)
        self.assertEqual(first["recipient_id"], reclaimed["recipient_id"])
        with self.assertRaises(OutboxClaimError):
            self.store.acknowledge_dispatch(
                first["message_id"], first["recipient_id"], "old", 111
            )
        self.store.acknowledge_dispatch(
            reclaimed["message_id"], reclaimed["recipient_id"], "new", 112
        )

    def test_retry_and_dead_letter_preserve_order(self):
        first = self.store.claim_next("w1", "try1", 100, 30, max_attempts=1)
        # Clear the other recipient so the next assertion isolates recipient B.
        other = self.store.claim_next("w2", "other", 100, 30, max_attempts=1)
        self.store.acknowledge_dispatch(
            other["message_id"], other["recipient_id"], "other", 101
        )
        state = self.store.release_claim(
            first["message_id"], first["recipient_id"], "try1",
            failed_at=101, retry_at=101, max_attempts=1, error="permanent",
        )
        self.assertEqual("dead_letter", state)
        self.store.send("A", "room-1", "op-2", "later")
        self.assertIsNone(self.store.claim_next("w3", "later", 102, 30))
        states = self.store.snapshot("room-1")[1]
        self.assertEqual("dead_letter", states[0][2])

    def test_retry_time_and_expired_final_lease(self):
        claim = self.store.claim_next("w1", "retry", 100, 10, max_attempts=2)
        other = self.store.claim_next("w2", "other", 100, 10, max_attempts=2)
        self.store.acknowledge_dispatch(
            other["message_id"], other["recipient_id"], "other", 101
        )
        self.store.release_claim(
            claim["message_id"], claim["recipient_id"], "retry",
            failed_at=101, retry_at=120, max_attempts=2,
        )
        self.assertIsNone(self.store.claim_next("w3", "early", 119, 10, max_attempts=2))
        second = self.store.claim_next("w3", "second", 120, 10, max_attempts=2)
        self.assertEqual(2, second["attempt"])
        self.assertIsNone(self.store.claim_next("w4", "expired", 130, 10, max_attempts=2))
        self.assertEqual("dead_letter", self.store.snapshot("room-1")[1][0][2])


if __name__ == "__main__":
    unittest.main(verbosity=2)
