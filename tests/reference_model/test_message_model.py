import random
import threading
import unittest

from message_model import (
    FakeDevice, IdempotencyConflict, MessageService, Rejected,
    SimulatedCrash, Store, UnknownOutcome, apply_page_to_client,
)


class MessageReliabilityReferenceTests(unittest.TestCase):
    def setUp(self):
        self.store = Store()
        self.service = MessageService(self.store)
        self.service.create_conversation("ab", ("A", "B"))

    def test_accepted_includes_durable_message_and_delivery_intent(self):
        msg = self.service.send("A", "ab", "op-1", "hello")
        self.assertIn(msg.message_id, self.store.messages)
        self.assertEqual("pending", self.service.delivery_state(msg.message_id, "B"))

    def test_precommit_failure_leaves_no_message_or_sequence_gap(self):
        with self.assertRaises(Rejected):
            self.service.send("A", "ab", "op-1", "hello", fail_before_commit=True)
        self.assertEqual({}, self.store.messages)
        self.assertEqual({}, self.store.idempotency)
        self.assertEqual(1, self.store.conversations["ab"].next_position)

    def test_lost_response_after_commit_reconciles_same_message(self):
        with self.assertRaises(UnknownOutcome):
            self.service.send("A", "ab", "op-1", "hello", lose_response_after_commit=True)
        recovered = self.service.send("A", "ab", "op-1", "hello")
        self.assertEqual(1, len(self.store.messages))
        self.assertEqual("msg:ab:1", recovered.message_id)

    def test_same_key_different_payload_is_conflict(self):
        self.service.send("A", "ab", "op-1", "hello")
        with self.assertRaises(IdempotencyConflict):
            self.service.send("A", "ab", "op-1", "changed")
        self.assertEqual(1, len(self.store.messages))

    def test_concurrent_duplicate_requests_create_one_logical_message(self):
        barrier = threading.Barrier(12)
        results, errors = [], []
        def worker():
            try:
                barrier.wait()
                results.append(self.service.send("A", "ab", "same-op", "hello").message_id)
            except Exception as exc:
                errors.append(exc)
        threads = [threading.Thread(target=worker) for _ in range(12)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual([], errors)
        self.assertEqual(12, len(results))
        self.assertEqual(1, len(set(results)))
        self.assertEqual(1, len(self.store.messages))

    def test_worker_crash_after_send_is_safe_to_retry(self):
        msg = self.service.send("A", "ab", "op-1", "hello")
        device = FakeDevice()
        with self.assertRaises(SimulatedCrash):
            self.service.dispatch_one(msg.message_id, "B", device,
                                      crash_after_device_receive=True)
        self.assertEqual("processing", self.service.delivery_state(msg.message_id, "B"))
        self.service.dispatch_one(msg.message_id, "B", device)
        self.assertEqual("completed", self.service.delivery_state(msg.message_id, "B"))
        self.assertEqual([msg.message_id], device.visible_message_ids)

    def test_history_survives_service_reconstruction(self):
        msg = self.service.send("A", "ab", "op-1", "hello")
        restarted = MessageService(self.store)  # process restart over durable state
        page, cursor = restarted.sync("B", "ab")
        self.assertEqual([msg.message_id], [m.message_id for m in page])
        self.assertEqual(1, cursor)

    def test_sync_page_replay_does_not_duplicate_client_visible_message(self):
        self.service.send("A", "ab", "op-1", "one")
        self.service.send("A", "ab", "op-2", "two")
        page1, cursor1 = self.service.sync("B", "ab", limit=1)
        visible = apply_page_to_client([], page1)
        replay, replay_cursor = self.service.sync("B", "ab", after_position=0, limit=1)
        visible = apply_page_to_client(visible, replay)
        page2, cursor2 = self.service.sync("B", "ab", after_position=cursor1, limit=1)
        visible = apply_page_to_client(visible, page2)
        self.assertEqual(1, replay_cursor)
        self.assertEqual(2, cursor2)
        self.assertEqual(2, len(visible))

    def test_concurrent_messages_get_unique_monotonic_positions(self):
        barrier = threading.Barrier(20)
        positions = []
        def worker(i):
            barrier.wait()
            positions.append(self.service.send("A", "ab", f"op-{i}", f"payload-{i}").position)
        threads = [threading.Thread(target=worker, args=(i,)) for i in range(20)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual(list(range(1, 21)), sorted(positions))

    def test_nonmember_cannot_sync_conversation(self):
        with self.assertRaises(Rejected):
            self.service.sync("C", "ab")

    def test_delivery_and_read_are_separate_facts(self):
        msg = self.service.send("A", "ab", "op-1", "hello")
        self.service.dispatch_one(msg.message_id, "B", FakeDevice())
        delivery = self.store.deliveries[(msg.message_id, "B")]
        self.assertEqual("completed", delivery.state)
        self.assertFalse(hasattr(delivery, "read_at"))

    def test_conversation_sequences_are_independent(self):
        self.service.create_conversation("ac", ("A", "C"))
        one = self.service.send("A", "ab", "op-ab", "hello")
        two = self.service.send("A", "ac", "op-ac", "hello")
        self.assertEqual(1, one.position)
        self.assertEqual(1, two.position)

    def test_seeded_1000_operation_retry_crash_and_sync_sequence(self):
        rng = random.Random(20261124)
        expected = {f"op-{i}": f"payload-{i}" for i in range(150)}
        for _ in range(1000):
            i = rng.randrange(150)
            key, payload = f"op-{i}", expected[f"op-{i}"]
            try:
                self.service.send(
                    "A", "ab", key, payload,
                    fail_before_commit=(rng.random() < 0.12),
                    lose_response_after_commit=(rng.random() < 0.18),
                )
            except Rejected:
                pass
            except UnknownOutcome:
                self.service.send("A", "ab", key, payload)
        for key, payload in expected.items():
            self.service.send("A", "ab", key, payload)
        self.assertEqual(150, len(self.store.messages))
        messages = sorted(self.store.messages.values(), key=lambda m: m.position)
        self.assertEqual(list(range(1, 151)), [m.position for m in messages])

        device = FakeDevice()
        for msg in messages:
            if rng.random() < 0.35:
                with self.assertRaises(SimulatedCrash):
                    self.service.dispatch_one(msg.message_id, "B", device,
                                              crash_after_device_receive=True)
            self.service.dispatch_one(msg.message_id, "B", device)
        self.assertEqual(150, len(device.visible_message_ids))
        self.assertEqual(150, len(set(device.visible_message_ids)))

        visible, cursor = [], 0
        while cursor < 150:
            page, next_cursor = self.service.sync("B", "ab", cursor, rng.randint(1, 13))
            self.assertGreater(next_cursor, cursor)
            visible = apply_page_to_client(visible, page)
            cursor = next_cursor
        self.assertEqual([m.message_id for m in messages], visible)


if __name__ == "__main__":
    unittest.main(verbosity=2)
