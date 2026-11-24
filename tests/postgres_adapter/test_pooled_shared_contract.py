import os
import unittest
import uuid

import psycopg
from psycopg.conninfo import make_conninfo

from adapter_contract.message_store_contract import MessageStoreContractMixin
from pooled_postgres_message_store import PooledPostgreSQLMessageStore
from postgres_message_store import IdempotencyConflict, OutboxClaimError, SendRejected, UnknownOutcome


class PooledPostgreSQLSharedContractTests(MessageStoreContractMixin, unittest.TestCase):
    idempotency_conflict_type = IdempotencyConflict
    outbox_claim_error_type = OutboxClaimError
    send_rejected_type = SendRejected
    unknown_outcome_type = UnknownOutcome

    @classmethod
    def setUpClass(cls):
        cls.base_dsn = os.environ["POSTGRES_DSN"]

    def make_store(self):
        self.schema = "jet_pool_contract_" + uuid.uuid4().hex
        with psycopg.connect(self.base_dsn) as db:
            db.execute(f'CREATE SCHEMA "{self.schema}"')
        self.dsn = make_conninfo(
            self.base_dsn, options=f"-c search_path={self.schema}"
        )
        return PooledPostgreSQLMessageStore(self.dsn, min_size=1, max_size=4)

    def cleanup_store(self):
        self.store.close()
        with psycopg.connect(self.base_dsn) as db:
            db.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')


if __name__ == "__main__":
    unittest.main(verbosity=2)
