import tempfile
import unittest
from pathlib import Path

from sqlite_message_store import (
    OutboxClaimError,
    SQLiteMessageStore,
    exponential_backoff_seconds,
)


class FakeIdempotentReceiver:
    """A test double: repeated message IDs cause one external side effect."""

    def __init__(self):
        self.seen = set()
        self.effects = []

    def accept(self, message_id, payload):
        if message_id not in self.seen:
            self.seen.add(message_id)
            self.effects.append((message_id, payload))


class OutboxLeaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "outbox.sqlite3"
        self.store = SQLiteMessageStore(self.db_path)
        self.store.create_conversation("room-1", ("A", "B", "C"))
        self.message_id = self.store.send("A", "room-1", "op-1", "hello")

    def tearDown(self):
        self.temp.cleanup()

    def test_only_one_worker_claims_a_pending_recipient(self):
        first = self.store.claim_next("worker-1", "token-1", 100, 30)
        second = self.store.claim_next("worker-2", "token-2", 100, 30)
        self.assertEqual("B", first["recipient_id"])
        self.assertEqual(1, first["attempt"])
        self.assertEqual("C", second["recipient_id"])
        self.assertEqual(1, second["attempt"])

    def test_expired_lease_can_be_reclaimed_and_old_token_is_rejected(self):
        first = self.store.claim_next("worker-1", "old-token", 100, 10)
        self.assertEqual("B", first["recipient_id"])
        reclaimed = self.store.claim_next("worker-2", "new-token", 110, 20)
        self.assertEqual("B", reclaimed["recipient_id"])
        self.assertEqual(2, reclaimed["attempt"])
        with self.assertRaises(OutboxClaimError):
            self.store.acknowledge_dispatch(
                self.message_id, "B", "old-token", dispatched_at=111
            )
        self.store.acknowledge_dispatch(
            self.message_id, "B", "new-token", dispatched_at=112
        )
        states = self.store.snapshot("room-1")[1]
        self.assertEqual(
            [(self.message_id, "B", "dispatched"),
             (self.message_id, "C", "pending")],
            states,
        )

    def test_worker_can_release_claim_for_retry(self):
        first = self.store.claim_next("worker-1", "token-1", 100, 30)
        self.store.release_claim(
            first["message_id"], first["recipient_id"], "token-1",
            failed_at=101, retry_at=101,
        )
        retry = self.store.claim_next("worker-2", "token-2", 101, 30)
        self.assertEqual(first["message_id"], retry["message_id"])
        self.assertEqual(first["recipient_id"], retry["recipient_id"])
        self.assertEqual(2, retry["attempt"])

    def test_claim_cannot_be_acknowledged_twice(self):
        claim = self.store.claim_next("worker-1", "token-1", 100, 30)
        self.store.acknowledge_dispatch(
            claim["message_id"], claim["recipient_id"], "token-1", dispatched_at=105
        )
        with self.assertRaises(OutboxClaimError):
            self.store.acknowledge_dispatch(
                claim["message_id"], claim["recipient_id"], "token-1", dispatched_at=106
            )

    def test_expired_worker_cannot_ack_before_reclaim(self):
        claim = self.store.claim_next("worker-1", "token-1", 100, 10)
        with self.assertRaises(OutboxClaimError):
            self.store.acknowledge_dispatch(
                claim["message_id"], claim["recipient_id"], "token-1", dispatched_at=110
            )
        states = self.store.snapshot("room-1")[1]
        self.assertEqual("leased", states[0][2])

    def test_later_message_for_same_recipient_waits_for_earlier_dispatch(self):
        first_id = self.message_id
        second_id = self.store.send("A", "room-1", "op-2", "second")
        first_b = self.store.claim_next("worker-1", "b-first", 100, 30)
        first_c = self.store.claim_next("worker-2", "c-first", 100, 30)
        self.assertEqual((first_id, "B"), (first_b["message_id"], first_b["recipient_id"]))
        self.assertEqual((first_id, "C"), (first_c["message_id"], first_c["recipient_id"]))

        # Both recipients still have the earlier message in flight.
        self.assertIsNone(self.store.claim_next("worker-3", "later", 100, 30))

        self.store.acknowledge_dispatch(first_id, "B", "b-first", dispatched_at=105)
        next_b = self.store.claim_next("worker-3", "b-second", 106, 30)
        self.assertEqual((second_id, "B"), (next_b["message_id"], next_b["recipient_id"]))

    def test_exponential_backoff_is_capped(self):
        self.assertEqual(2, exponential_backoff_seconds(1))
        self.assertEqual(4, exponential_backoff_seconds(2))
        self.assertEqual(8, exponential_backoff_seconds(3))
        self.assertEqual(10, exponential_backoff_seconds(10, base_seconds=2, max_seconds=10))
        with self.assertRaises(ValueError):
            exponential_backoff_seconds(0)

    def test_retry_is_not_claimable_before_next_attempt_time(self):
        claim = self.store.claim_next("worker-1", "token-1", 100, 30)
        self.store.release_claim(
            claim["message_id"], claim["recipient_id"], "token-1",
            failed_at=101, retry_at=110,
        )
        self.assertIsNone(self.store.claim_next("worker-2", "too-early", 109, 30))
        retry = self.store.claim_next("worker-2", "due", 110, 30)
        self.assertEqual(2, retry["attempt"])

    def test_retry_limit_moves_row_to_dead_letter(self):
        first = self.store.claim_next("worker-1", "try-1", 100, 30, max_attempts=2)
        state = self.store.release_claim(
            first["message_id"], first["recipient_id"], "try-1",
            failed_at=101, retry_at=101, max_attempts=2, error="temporary failure",
        )
        self.assertEqual("pending", state)

        second = self.store.claim_next("worker-2", "try-2", 101, 30, max_attempts=2)
        self.assertEqual(2, second["attempt"])
        state = self.store.release_claim(
            second["message_id"], second["recipient_id"], "try-2",
            failed_at=102, retry_at=102, max_attempts=2, error="still failing",
        )
        self.assertEqual("dead_letter", state)
        self.assertEqual("dead_letter", self.store.snapshot("room-1")[1][0][2])
        self.assertIsNone(
            self.store.claim_next("worker-3", "try-3", 102, 30, max_attempts=2)
        )

    def test_expired_final_attempt_is_dead_lettered(self):
        claim = self.store.claim_next("worker-1", "last-attempt", 100, 10, max_attempts=1)
        self.assertEqual(1, claim["attempt"])
        self.assertIsNone(
            self.store.claim_next("worker-2", "over-limit", 110, 10, max_attempts=1)
        )
        self.assertEqual("dead_letter", self.store.snapshot("room-1")[1][0][2])

    def test_dead_letter_blocks_later_messages_to_preserve_order(self):
        self.store.create_conversation("room-2", ("X", "Y"))
        first_id = self.store.send("X", "room-2", "first", "first")
        self.store.send("X", "room-2", "second", "second")
        claim = self.store.claim_next("worker-1", "only-attempt", 100, 30, max_attempts=1)
        self.assertEqual((first_id, "Y"), (claim["message_id"], claim["recipient_id"]))
        self.store.release_claim(
            claim["message_id"], claim["recipient_id"], "only-attempt",
            failed_at=101, retry_at=101, max_attempts=1, error="permanent failure",
        )
        self.assertIsNone(
            self.store.claim_next("worker-2", "blocked-later", 102, 30, max_attempts=3)
        )

    def test_receiver_dedup_handles_crash_after_side_effect_before_ack(self):
        receiver = FakeIdempotentReceiver()
        first = self.store.claim_next("worker-1", "before-crash", 100, 10)
        receiver.accept(first["message_id"], "hello")
        # Simulate worker crash: external side effect happened, no DB ack was written.
        retried = self.store.claim_next("worker-2", "after-restart", 110, 10)
        self.assertEqual(first["message_id"], retried["message_id"])
        receiver.accept(retried["message_id"], "hello")
        self.assertEqual([(self.message_id, "hello")], receiver.effects)
        self.store.acknowledge_dispatch(
            retried["message_id"], retried["recipient_id"], "after-restart",
            dispatched_at=111,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
