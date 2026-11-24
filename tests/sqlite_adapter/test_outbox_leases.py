import tempfile
import unittest
from pathlib import Path

from sqlite_message_store import OutboxClaimError, SQLiteMessageStore


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
                self.message_id, "B", "old-token", delivered_at=111
            )
        self.store.acknowledge_delivery(
            self.message_id, "B", "new-token", delivered_at=112
        )
        states = self.store.snapshot("room-1")[1]
        self.assertEqual(
            [(self.message_id, "B", "dispatched"),
             (self.message_id, "C", "pending")],
            states,
        )

    def test_worker_can_release_claim_for_retry(self):
        first = self.store.claim_next("worker-1", "token-1", 100, 30)
        self.store.release_claim(first["message_id"], first["recipient_id"], "token-1")
        retry = self.store.claim_next("worker-2", "token-2", 101, 30)
        self.assertEqual(first["message_id"], retry["message_id"])
        self.assertEqual(first["recipient_id"], retry["recipient_id"])
        self.assertEqual(2, retry["attempt"])

    def test_claim_cannot_be_acknowledged_twice(self):
        claim = self.store.claim_next("worker-1", "token-1", 100, 30)
        self.store.acknowledge_delivery(
            claim["message_id"], claim["recipient_id"], "token-1", delivered_at=105
        )
        with self.assertRaises(OutboxClaimError):
            self.store.acknowledge_delivery(
                claim["message_id"], claim["recipient_id"], "token-1", delivered_at=106
            )

    def test_expired_worker_cannot_ack_before_reclaim(self):
        claim = self.store.claim_next("worker-1", "token-1", 100, 10)
        with self.assertRaises(OutboxClaimError):
            self.store.acknowledge_dispatch(
                claim["message_id"], claim["recipient_id"], "token-1", dispatched_at=110
            )
        states = self.store.snapshot("room-1")[1]
        self.assertEqual("leased", states[0][2])


if __name__ == "__main__":
    unittest.main(verbosity=2)
