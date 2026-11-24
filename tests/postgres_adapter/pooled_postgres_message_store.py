"""Optional psycopg_pool-backed variant for the persistence experiment."""
from psycopg_pool import ConnectionPool

from postgres_message_store import PostgreSQLMessageStore


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
        return self.pool.connection()

    def close(self):
        self.pool.close()
