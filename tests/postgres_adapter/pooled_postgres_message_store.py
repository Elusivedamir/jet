"""Optional psycopg_pool-backed variant for the persistence experiment.

The adapter's existing API expects a connection object with close() and context
manager semantics. This lease returns real connections to the pool rather than
exposing psycopg_pool's generator-based connection context manager.
"""
from psycopg_pool import ConnectionPool

from postgres_message_store import PostgreSQLMessageStore


class _PooledConnectionLease:
    def __init__(self, pool):
        self._pool = pool
        self._connection = pool.getconn()
        self._returned = False

    def __getattr__(self, name):
        return getattr(self._connection, name)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            if exc_type is None:
                self._connection.commit()
            else:
                self._connection.rollback()
        finally:
            self.close()
        return False

    def close(self):
        if not self._returned:
            self._returned = True
            self._pool.putconn(self._connection)


class PooledPostgreSQLMessageStore(PostgreSQLMessageStore):
    def __init__(self, dsn, *, min_size=1, max_size=4, timeout=10):
        self.dsn = str(dsn)
        self.pool = ConnectionPool(
            conninfo=self.dsn,
            min_size=min_size,
            max_size=max_size,
            timeout=timeout,
            open=True,
        )
        try:
            self._initialize()
        except Exception:
            self.pool.close()
            raise

    def _connect(self):
        return _PooledConnectionLease(self.pool)

    def close(self):
        self.pool.close()
