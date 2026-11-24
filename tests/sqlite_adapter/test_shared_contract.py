import tempfile
import unittest
from pathlib import Path

from adapter_contract.message_store_contract import MessageStoreContractMixin
from sqlite_message_store import (
    IdempotencyConflict, OutboxClaimError, SendRejected, SQLiteMessageStore,
    UnknownOutcome,
)


class SQLiteSharedMessageStoreContractTests(MessageStoreContractMixin, unittest.TestCase):
    idempotency_conflict_type = IdempotencyConflict
    outbox_claim_error_type = OutboxClaimError
    send_rejected_type = SendRejected
    unknown_outcome_type = UnknownOutcome

    def make_store(self):
        self.temp = tempfile.TemporaryDirectory()
        return SQLiteMessageStore(Path(self.temp.name) / "shared-contract.sqlite3")

    def cleanup_store(self):
        self.temp.cleanup()


if __name__ == "__main__":
    unittest.main(verbosity=2)
