import os
import unittest
import uuid

import psycopg
from psycopg.conninfo import make_conninfo

from postgres_message_store import PostgreSQLMessageStore


class PostgreSQLSchemaMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dsn = os.environ["POSTGRES_DSN"]

    def setUp(self):
        self.schema = "jet_migration_" + uuid.uuid4().hex
        with psycopg.connect(self.base_dsn) as db:
            db.execute(f'CREATE SCHEMA "{self.schema}"')
        self.dsn = make_conninfo(
            self.base_dsn, options=f"-c search_path={self.schema}"
        )
        self.store = PostgreSQLMessageStore(self.dsn)

    def tearDown(self):
        with psycopg.connect(self.base_dsn) as db:
            db.execute(f'DROP SCHEMA IF EXISTS "{self.schema}" CASCADE')

    def test_clean_schema_records_baseline_version(self):
        with psycopg.connect(self.dsn) as db:
            versions = db.execute(
                "SELECT version FROM schema_migrations ORDER BY version"
            ).fetchall()
        self.assertEqual([(1,)], versions)

    def test_existing_unversioned_schema_is_adopted_without_data_loss(self):
        self.store.create_conversation("room", ("A", "B"))
        message_id = self.store.send("A", "room", "op-1", "persisted")
        with psycopg.connect(self.dsn) as db:
            db.execute("DROP TABLE schema_migrations")
        upgraded = PostgreSQLMessageStore(self.dsn)
        with psycopg.connect(self.dsn) as db:
            versions = db.execute(
                "SELECT version FROM schema_migrations ORDER BY version"
            ).fetchall()
        self.assertEqual([(1,)], versions)
        self.assertEqual(message_id, upgraded.snapshot("room")[0][0][0])

    def test_reinitialization_is_idempotent(self):
        PostgreSQLMessageStore(self.dsn)
        PostgreSQLMessageStore(self.dsn)
        with psycopg.connect(self.dsn) as db:
            count = db.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
        self.assertEqual(1, count)


if __name__ == "__main__":
    unittest.main(verbosity=2)
