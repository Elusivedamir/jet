import unittest

from outbox_model import (
    OutboxConflict,
    OutboxReferenceModel,
    StaleClaim,
    exponential_backoff_seconds,
)


class FakeReceiver:
    def __init__(self):
        self.seen = set()
        self.effects = []

    def accept(self, delivery_key):
        if delivery_key not in self.seen:
            self.seen.add(delivery_key)
            self.effects.append(delivery_key)


class OutboxReferenceModelTests(unittest.TestCase):
    def setUp(self):
        self.model = OutboxReferenceModel(max_attempts=2)
        self.model.enqueue("m1", "room-1", 1, "B")

    def test_enqueue_is_idempotent_and_rejects_conflicting_metadata(self):
        self.assertFalse(self.model.enqueue("m1", "room-1", 1, "B"))
        self.assertEqual(1, len(self.model.snapshot()))
        with self.assertRaises(OutboxConflict):
            self.model.enqueue("m1", "room-2", 1, "B")

    def test_claim_increments_attempt_and_records_lease(self):
        claim = self.model.claim_next("worker-1", "token-1", 100, 20)
        self.assertEqual(("m1", "B"), (claim["message_id"], claim["recipient_id"]))
        self.assertEqual(1, claim["attempts"])
        self.assertEqual(120, claim["lease_until"])
        self.assertEqual("leased", self.model.snapshot()[0]["state"])

    def test_only_current_unexpired_token_can_acknowledge(self):
        claim = self.model.claim_next("worker-1", "token-1", 100, 20)
        with self.assertRaises(StaleClaim):
            self.model.acknowledge_dispatch("m1", "B", "wrong-token", 105)
        self.model.acknowledge_dispatch("m1", "B", claim["claim_token"], 105)
        self.assertEqual("dispatched", self.model.snapshot()[0]["state"])
        with self.assertRaises(StaleClaim):
            self.model.acknowledge_dispatch("m1", "B", "token-1", 106)

    def test_expired_lease_reclaims_and_fences_old_worker(self):
        first = self.model.claim_next("worker-1", "old-token", 100, 10)
        second = self.model.claim_next("worker-2", "new-token", 110, 20)
        self.assertEqual(2, second["attempts"])
        with self.assertRaises(StaleClaim):
            self.model.acknowledge_dispatch("m1", "B", first["claim_token"], 111)
        self.model.acknowledge_dispatch("m1", "B", second["claim_token"], 112)

    def test_future_retry_time_is_not_claimable_early(self):
        claim = self.model.claim_next("worker-1", "token-1", 100, 30)
        state = self.model.release_claim(
            "m1", "B", claim["claim_token"], failed_at=101, retry_at=110, error="busy"
        )
        self.assertEqual("pending", state)
        self.assertIsNone(self.model.claim_next("worker-2", "early", 109, 30))
        retry = self.model.claim_next("worker-2", "due", 110, 30)
        self.assertEqual(2, retry["attempts"])

    def test_exponential_backoff_is_capped_and_validated(self):
        self.assertEqual(2, exponential_backoff_seconds(1))
        self.assertEqual(4, exponential_backoff_seconds(2))
        self.assertEqual(8, exponential_backoff_seconds(3))
        self.assertEqual(10, exponential_backoff_seconds(20, 2, 10))
        with self.assertRaises(ValueError):
            exponential_backoff_seconds(0)

    def test_final_failed_attempt_becomes_dead_letter(self):
        first = self.model.claim_next("worker-1", "try-1", 100, 30)
        self.model.release_claim(
            "m1", "B", first["claim_token"], failed_at=101, retry_at=101, error="busy"
        )
        second = self.model.claim_next("worker-2", "try-2", 101, 30)
        state = self.model.release_claim(
            "m1", "B", second["claim_token"], failed_at=102, retry_at=102, error="failed"
        )
        self.assertEqual("dead_letter", state)
        self.assertEqual("dead_letter", self.model.snapshot()[0]["state"])
        self.assertIsNone(self.model.claim_next("worker-3", "try-3", 103, 30))

    def test_expired_final_lease_becomes_dead_letter(self):
        self.model.max_attempts = 1
        self.model.claim_next("worker-1", "last", 100, 10)
        self.assertIsNone(self.model.claim_next("worker-2", "too-late", 110, 10))
        self.assertEqual("dead_letter", self.model.snapshot()[0]["state"])

    def test_dead_letter_blocks_later_message_for_same_recipient(self):
        first = self.model.claim_next("worker-1", "only", 100, 30)
        self.model.release_claim(
            "m1", "B", first["claim_token"], failed_at=101, retry_at=101, error="permanent"
        )
        self.model.enqueue("m2", "room-1", 2, "B")
        self.assertIsNone(self.model.claim_next("worker-2", "later", 102, 30))

    def test_other_recipient_can_progress_while_one_is_dead_lettered(self):
        first = self.model.claim_next("worker-1", "only", 100, 30)
        self.model.release_claim(
            "m1", "B", first["claim_token"], failed_at=101, retry_at=101, error="permanent"
        )
        self.model.enqueue("m1", "room-1", 1, "C")
        claim_c = self.model.claim_next("worker-2", "c-token", 102, 30)
        self.assertEqual("C", claim_c["recipient_id"])

    def test_receiver_dedup_handles_crash_after_side_effect_before_ack(self):
        receiver = FakeReceiver()
        first = self.model.claim_next("worker-1", "before-crash", 100, 10)
        receiver.accept(first["message_id"])
        retry = self.model.claim_next("worker-2", "after-restart", 110, 10)
        receiver.accept(retry["message_id"])
        self.assertEqual(["m1"], receiver.effects)
        self.model.acknowledge_dispatch("m1", "B", retry["claim_token"], 111)

    def test_other_conversation_is_independent(self):
        first = self.model.claim_next("worker-1", "room1", 100, 30)
        self.model.enqueue("m2", "room-2", 1, "B")
        second = self.model.claim_next("worker-2", "room2", 100, 30)
        self.assertNotEqual(first["conversation_id"], second["conversation_id"])
        self.assertEqual("room-2", second["conversation_id"])

    def test_later_message_waits_until_prior_dispatch_is_acknowledged(self):
        self.model.enqueue("m2", "room-1", 2, "B")
        first = self.model.claim_next("worker-1", "first", 100, 30)
        self.assertIsNone(self.model.claim_next("worker-2", "blocked", 100, 30))
        self.model.acknowledge_dispatch("m1", "B", first["claim_token"], 105)
        second = self.model.claim_next("worker-2", "second", 106, 30)
        self.assertEqual("m2", second["message_id"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
