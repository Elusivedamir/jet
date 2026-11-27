import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from sqlite_message_store import SQLiteMessageStore


class ProcessCrashRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "crash.sqlite3"
        self.store = SQLiteMessageStore(self.db_path)
        self.store.create_conversation("room-crash", ("A", "B"))

    def tearDown(self):
        self.temp.cleanup()

    def run_child(self, script):
        result = subprocess.run(
            [sys.executable, "-c", script, str(self.db_path)],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result

    def test_hard_process_exit_before_commit_rolls_back_partial_transaction(self):
        script = r"""
import os, sqlite3, sys
db = sqlite3.connect(sys.argv[1], isolation_level=None)
db.execute("PRAGMA foreign_keys=ON")
db.execute("BEGIN IMMEDIATE")
db.execute(
    "INSERT INTO messages(message_id,conversation_id,position,sender_id,operation_key,payload) "
    "VALUES ('partial','room-crash',1,'A','op-crash','payload')"
)
os._exit(71)
"""
        child = self.run_child(script)
        self.assertEqual(71, child.returncode)
        messages, outbox, next_position = self.store.snapshot("room-crash")
        self.assertEqual([], messages)
        self.assertEqual([], outbox)
        self.assertEqual(1, next_position)

    def test_hard_process_exit_after_commit_is_reconciled_by_same_operation_key(self):
        module_dir = str(Path(__file__).resolve().parent)
        script = r"""
import os, sys
sys.path.insert(0, sys.argv[2])
from sqlite_message_store import SQLiteMessageStore
store = SQLiteMessageStore(sys.argv[1])
store.send('A', 'room-crash', 'op-crash', 'payload')
os._exit(72)
"""
        child = self.run_child_with_args(script, module_dir)
        self.assertEqual(72, child.returncode)

        restarted = SQLiteMessageStore(self.db_path)
        recovered = restarted.send("A", "room-crash", "op-crash", "payload")
        messages, outbox, next_position = restarted.snapshot("room-crash")
        self.assertEqual("msg:room-crash:1", recovered)
        self.assertEqual(1, len(messages))
        self.assertEqual(1, len(outbox))
        self.assertEqual(2, next_position)

    def run_child_with_args(self, script, module_dir):
        result = subprocess.run(
            [sys.executable, "-c", script, str(self.db_path), module_dir],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result


if __name__ == "__main__":
    unittest.main(verbosity=2)
