"""Separate-process contention tests for PostgreSQL outbox claims.

Threads share a process; this test starts independent Python interpreters so
each worker owns its own database connection (or its own connection pool).
"""
import multiprocessing
import os
import unittest
import uuid

import psycopg
from psycopg.conninfo import make_conninfo

from postgres_message_store import PostgreSQLMessageStore


def _claim_in_child(dsn, ready, start, results, worker_id, pooled):
    if pooled:
        from pooled_postgres_message_store import PooledPostgreSQLMessageStore
        store = PooledPostgreSQLMessageStore(dsn, min_size=1, max_size=2)
    else:
        store = PostgreSQLMessageStore(dsn)
    ready.put(worker_id)
    if not start.wait(15):
        results.put((worker_id, "start-timeout"))
        if pooled:
            store.close()
        return
    claim = store.claim_next(worker_id, f"token-{worker_id}", 100, 30)
    results.put((worker_id, claim))
    if pooled:
        store.close()


class PostgreSQLMultiprocessClaimTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dsn = os.environ["POSTGRES_DSN"]

    def run_contention(self, pooled):
        schema = "jet_mp_claim_" + uuid.uuid4().hex
        with psycopg.connect(self.base_dsn) as db:
            db.execute(f'CREATE SCHEMA "{schema}"')
        dsn = make_conninfo(self.base_dsn, options=f"-c search_path={schema}")
        try:
            store = PostgreSQLMessageStore(dsn)
            store.create_conversation("one-recipient-room", ("sender", "recipient"))
            store.send("sender", "one-recipient-room", "one-message", "payload")

            ctx = multiprocessing.get_context("spawn")
            ready = ctx.Queue()
            results = ctx.Queue()
            start = ctx.Event()
            workers = [
                ctx.Process(
                    target=_claim_in_child,
                    args=(dsn, ready, start, results, f"worker-{i}", pooled),
                )
                for i in range(2)
            ]
            for worker in workers:
                worker.start()

            ready_workers = {ready.get(timeout=20) for _ in workers}
            self.assertEqual({"worker-0", "worker-1"}, ready_workers)
            start.set()
            outcomes = [results.get(timeout=25) for _ in workers]

            for worker in workers:
                worker.join(timeout=10)
                self.assertFalse(worker.is_alive(), "claim worker did not exit")
                self.assertEqual(0, worker.exitcode)

            claims = [claim for _, claim in outcomes if claim is not None]
            self.assertEqual(1, len(claims), outcomes)
            self.assertEqual(1, claims[0]["attempt"])
            self.assertIn(claims[0]["worker_id"], {"worker-0", "worker-1"})
            messages, outbox, next_position = store.snapshot("one-recipient-room")
            self.assertEqual(1, len(messages))
            self.assertEqual([(messages[0][0], "recipient", "leased")], outbox)
            self.assertEqual(2, next_position)
        finally:
            with psycopg.connect(self.base_dsn) as db:
                db.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')

    def test_independent_processes_cannot_claim_same_item_twice(self):
        for pooled in (False, True):
            with self.subTest(pooled=pooled):
                self.run_contention(pooled)


if __name__ == "__main__":
    unittest.main(verbosity=2)
