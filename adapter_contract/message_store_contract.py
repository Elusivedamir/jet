"""Shared behavioral contract scenarios for persistence adapters.

Concrete test classes supply a store factory and adapter-specific exception types.
These tests assert observable contract behavior, not identical physical schemas.
"""
import threading


class MessageStoreContractMixin:
    idempotency_conflict_type = AssertionError
    outbox_claim_error_type = AssertionError
    unknown_outcome_type = AssertionError

    def make_store(self):
        raise NotImplementedError

    def cleanup_store(self):
        pass

    def setUp(self):
        self.store = self.make_store()
        self.store.create_conversation("contract-room", ("sender", "recipient-b", "recipient-c"))

    def tearDown(self):
        self.cleanup_store()

    def test_atomic_message_and_recipient_outbox_acceptance(self):
        message_id = self.store.send("sender", "contract-room", "op-1", "payload")
        messages, outbox, next_position = self.store.snapshot("contract-room")
        self.assertEqual([(message_id, 1, "sender", "payload")], messages)
        self.assertEqual(
            [(message_id, "recipient-b", "pending"),
             (message_id, "recipient-c", "pending")],
            outbox,
        )
        self.assertEqual(2, next_position)

    def test_same_key_is_idempotent_and_conflicting_payload_is_rejected(self):
        first = self.store.send("sender", "contract-room", "same-key", "payload")
        second = self.store.send("sender", "contract-room", "same-key", "payload")
        self.assertEqual(first, second)
        with self.assertRaises(self.idempotency_conflict_type):
            self.store.send("sender", "contract-room", "same-key", "different")
        messages, outbox, next_position = self.store.snapshot("contract-room")
        self.assertEqual(1, len(messages))
        self.assertEqual(2, len(outbox))
        self.assertEqual(2, next_position)

    def test_failure_before_commit_leaves_no_partial_state(self):
        with self.assertRaises(Exception):
            self.store.send(
                "sender", "contract-room", "rollback", "payload",
                fail_before_commit=True,
            )
        self.assertEqual(([], [], 1), self.store.snapshot("contract-room"))

    def test_unknown_commit_outcome_recovers_same_message(self):
        with self.assertRaises(self.unknown_outcome_type):
            self.store.send(
                "sender", "contract-room", "unknown", "payload",
                lose_response_after_commit=True,
            )
        recovered = self.store.send("sender", "contract-room", "unknown", "payload")
        self.assertEqual("msg:contract-room:1", recovered)
        self.assertEqual(1, len(self.store.snapshot("contract-room")[0]))
        self.assertEqual(2, len(self.store.snapshot("contract-room")[1]))

    def test_concurrent_same_key_creates_one_message_and_outbox_pair(self):
        barrier = threading.Barrier(6)
        results, errors = [], []

        def submit():
            try:
                barrier.wait(timeout=5)
                results.append(
                    self.store.send("sender", "contract-room", "concurrent-key", "same")
                )
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=submit) for _ in range(6)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)
        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual([], errors)
        self.assertEqual(1, len(set(results)))
        messages, outbox, next_position = self.store.snapshot("contract-room")
        self.assertEqual(1, len(messages))
        self.assertEqual(2, len(outbox))
        self.assertEqual(2, next_position)

    def test_concurrent_claims_are_exclusive_and_recipient_scoped(self):
        self.store.send("sender", "contract-room", "claims", "payload")
        barrier = threading.Barrier(2)
        claims, errors = [], []

        def claim(worker, token):
            try:
                barrier.wait(timeout=5)
                claims.append(self.store.claim_next(worker, token, 100, 30))
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(target=claim, args=("worker-1", "token-1")),
            threading.Thread(target=claim, args=("worker-2", "token-2")),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)
        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual([], errors)
        self.assertEqual(2, len(claims))
        self.assertEqual(
            {"recipient-b", "recipient-c"},
            {claim["recipient_id"] for claim in claims},
        )
        self.assertEqual(1, len({claim["message_id"] for claim in claims}))

    def test_expired_claim_is_reclaimed_and_stale_token_is_fenced(self):
        self.store.send("sender", "contract-room", "lease", "payload")
        first = self.store.claim_next("worker-1", "old-token", 100, 10)
        reclaimed = self.store.claim_next("worker-2", "new-token", 110, 20)
        self.assertEqual(first["recipient_id"], reclaimed["recipient_id"])
        with self.assertRaises(self.outbox_claim_error_type):
            self.store.acknowledge_dispatch(
                first["message_id"], first["recipient_id"], "old-token", 111
            )
        self.store.acknowledge_dispatch(
            reclaimed["message_id"], reclaimed["recipient_id"], "new-token", 112
        )

    def test_retry_is_not_claimable_before_its_due_time(self):
        self.store.send("sender", "contract-room", "retry", "payload")
        first = self.store.claim_next("worker-1", "retry-token", 100, 30)
        other = self.store.claim_next("worker-2", "other-token", 100, 30)
        self.store.acknowledge_dispatch(
            other["message_id"], other["recipient_id"], "other-token", 101
        )
        self.store.release_claim(
            first["message_id"], first["recipient_id"], "retry-token",
            failed_at=101, retry_at=110,
        )
        self.assertIsNone(self.store.claim_next("worker-3", "early", 109, 30))
        due = self.store.claim_next("worker-3", "due", 110, 30)
        self.assertEqual(first["recipient_id"], due["recipient_id"])
        self.assertEqual(2, due["attempt"])

    def test_dead_letter_blocks_only_later_messages_for_that_recipient(self):
        first_id = self.store.send("sender", "contract-room", "first", "one")
        first_b = self.store.claim_next("worker-1", "b-first", 100, 30, max_attempts=1)
        first_c = self.store.claim_next("worker-2", "c-first", 100, 30, max_attempts=1)
        self.assertEqual((first_id, "recipient-b"), (first_b["message_id"], first_b["recipient_id"]))
        self.assertEqual((first_id, "recipient-c"), (first_c["message_id"], first_c["recipient_id"]))
        self.store.release_claim(
            first_b["message_id"], first_b["recipient_id"], "b-first",
            failed_at=101, retry_at=101, max_attempts=1, error="permanent",
        )
        self.store.acknowledge_dispatch(
            first_c["message_id"], first_c["recipient_id"], "c-first", 101
        )
        second_id = self.store.send("sender", "contract-room", "second", "two")
        second_c = self.store.claim_next("worker-3", "c-second", 102, 30)
        self.assertEqual((second_id, "recipient-c"), (second_c["message_id"], second_c["recipient_id"]))
        self.store.acknowledge_dispatch(
            second_c["message_id"], second_c["recipient_id"], "c-second", 103
        )
        self.assertIsNone(self.store.claim_next("worker-4", "blocked-b", 104, 30))
        states = self.store.snapshot("contract-room")[1]
        self.assertEqual("dead_letter", states[0][2])
