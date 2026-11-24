import tempfile
import unittest
from pathlib import Path

from sqlite_message_store import (
    IdempotencyConflict, SendRejected, SQLiteMessageStore, UnknownOutcome,
)


class SQLiteDurabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "jetson-test.sqlite3"
        self.store = SQLiteMessageStore(self.db_path)
        self.store.create_conversation("room-1", ("A", "B", "C"))

    def tearDown(self):
        self.temp.cleanup()

    def test_commit_contains_message_idempotency_and_all_outbox_rows(self):
        message_id = self.store.send("A", "room-1", "op-1", "hello")
        messages, outbox, next_position = self.store.snapshot("room-1")
        self.assertEqual([(message_id, 1, "A", "hello")], messages)
        self.assertEqual(
            [(message_id, "B", "pending"), (message_id, "C", "pending")],
            outbox,
        )
        self.assertEqual(2, next_position)

    def test_failure_before_commit_leaves_no_partial_rows_or_sequence_gap(self):
        with self.assertRaises(SendRejected):
            self.store.send("A", "room-1", "op-1", "hello", fail_before_commit=True)
        messages, outbox, next_position = self.store.snapshot("room-1")
        self.assertEqual([], messages)
        self.assertEqual([], outbox)
        self.assertEqual(1, next_position)

    def test_lost_response_after_commit_recovers_same_id_after_reopen(self):
        with self.assertRaises(UnknownOutcome):
            self.store.send(
                "A", "room-1", "op-1", "hello", lose_response_after_commit=True
            )
        restarted = SQLiteMessageStore(self.db_path)
        recovered_id = restarted.send("A", "room-1", "op-1", "hello")
        messages, outbox, next_position = restarted.snapshot("room-1")
        self.assertEqual("msg:room-1:1", recovered_id)
        self.assertEqual(1, len(messages))
        self.assertEqual(2, len(outbox))
        self.assertEqual(2, next_position)

    def test_same_key_different_payload_is_rejected_without_mutation(self):
        self.store.send("A", "room-1", "op-1", "original")
        with self.assertRaises(IdempotencyConflict):
            self.store.send("A", "room-1", "op-1", "modified")
        messages, outbox, next_position = self.store.snapshot("room-1")
        self.assertEqual(1, len(messages))
        self.assertEqual("original", messages[0][3])
        self.assertEqual(2, len(outbox))
        self.assertEqual(2, next_position)

    def test_duplicate_retry_after_reopen_does_not_duplicate_outbox(self):
        first = self.store.send("A", "room-1", "op-1", "hello")
        reopened = SQLiteMessageStore(self.db_path)
        second = reopened.send("A", "room-1", "op-1", "hello")
        messages, outbox, _ = reopened.snapshot("room-1")
        self.assertEqual(first, second)
        self.assertEqual(1, len(messages))
        self.assertEqual(2, len(outbox))

    def test_nonmember_cannot_send(self):
        with self.assertRaises(SendRejected):
            self.store.send("OUTSIDER", "room-1", "op-1", "hello")
        messages, outbox, next_position = self.store.snapshot("room-1")
        self.assertEqual([], messages)
        self.assertEqual([], outbox)
        self.assertEqual(1, next_position)

    def test_two_conversations_have_independent_sequences(self):
        self.store.create_conversation("room-2", ("A", "D"))
        first = self.store.send("A", "room-1", "op-1", "one")
        second = self.store.send("A", "room-2", "op-2", "two")
        self.assertEqual("msg:room-1:1", first)
        self.assertEqual("msg:room-2:1", second)

    def test_same_operation_key_can_be_reused_in_another_conversation(self):
        self.store.create_conversation("room-2", ("A", "D"))
        first = self.store.send("A", "room-1", "same-key", "room one")
        second = self.store.send("A", "room-2", "same-key", "room two")
        self.assertNotEqual(first, second)
        self.assertEqual(1, len(self.store.snapshot("room-1")[0]))
        self.assertEqual(1, len(self.store.snapshot("room-2")[0]))

    def test_concurrent_sends_allocate_unique_positions(self):
        import threading
        barrier = threading.Barrier(8)
        ids, errors = [], []
        def worker(i):
            try:
                barrier.wait()
                ids.append(self.store.send("A", "room-1", f"op-{i}", f"p-{i}"))
            except Exception as exc:
                errors.append(exc)
        threads = [threading.Thread(target=worker, args=(i,)) for i in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual([], errors)
        messages, outbox, next_position = self.store.snapshot("room-1")
        self.assertEqual(8, len(ids))
        self.assertEqual(list(range(1, 9)), [row[1] for row in messages])
        self.assertEqual(16, len(outbox))
        self.assertEqual(9, next_position)


if __name__ == "__main__":
    unittest.main(verbosity=2)
