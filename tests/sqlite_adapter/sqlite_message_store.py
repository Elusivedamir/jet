"""SQLite durability experiment for Jetson's implementation-neutral message contract.

This is an adapter experiment, not a production architecture or database selection.
It uses only Python's standard library.
"""
import sqlite3


class SendRejected(Exception):
    pass


class IdempotencyConflict(SendRejected):
    pass


class UnknownOutcome(Exception):
    """The transaction committed, but the caller did not receive confirmation."""


class OutboxClaimError(Exception):
    pass


def exponential_backoff_seconds(attempt, base_seconds=2, max_seconds=300):
    """Deterministic capped exponential backoff; production jitter is out of scope."""
    if attempt < 1 or base_seconds < 1 or max_seconds < 1:
        raise ValueError("attempt, base and cap must be positive")
    return min(base_seconds * (2 ** (attempt - 1)), max_seconds)


class SQLiteMessageStore:
    def __init__(self, path):
        self.path = str(path)
        self._initialize()

    def _connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.execute("PRAGMA foreign_keys = ON")
        return db

    def _initialize(self):
        with self._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS conversations (
                    conversation_id TEXT PRIMARY KEY,
                    next_position INTEGER NOT NULL CHECK (next_position > 0)
                );
                CREATE TABLE IF NOT EXISTS members (
                    conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
                    account_id TEXT NOT NULL,
                    PRIMARY KEY (conversation_id, account_id)
                );
                CREATE TABLE IF NOT EXISTS messages (
                    message_id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
                    position INTEGER NOT NULL,
                    sender_id TEXT NOT NULL,
                    operation_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    UNIQUE (conversation_id, position)
                );
                CREATE TABLE IF NOT EXISTS idempotency (
                    conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
                    sender_id TEXT NOT NULL,
                    operation_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    message_id TEXT NOT NULL REFERENCES messages(message_id),
                    PRIMARY KEY (conversation_id, sender_id, operation_key)
                );
                CREATE TABLE IF NOT EXISTS outbox (
                    message_id TEXT NOT NULL REFERENCES messages(message_id),
                    recipient_id TEXT NOT NULL,
                    state TEXT NOT NULL DEFAULT 'pending'
                        CHECK (state IN ('pending', 'leased', 'dispatched')),
                    attempts INTEGER NOT NULL DEFAULT 0,
                    lease_token TEXT,
                    lease_owner TEXT,
                    lease_until INTEGER,
                    dispatched_at INTEGER,
                    next_attempt_at INTEGER NOT NULL DEFAULT 0,
                    dead_letter_at INTEGER,
                    last_error TEXT,
                    PRIMARY KEY (message_id, recipient_id)
                );
            """)
            # Forward-compatible migration for databases created by the earlier
            # adapter experiment. These columns do not alter the existing state CHECK.
            columns = {row[1] for row in db.execute("PRAGMA table_info(outbox)")}
            if "next_attempt_at" not in columns:
                db.execute(
                    "ALTER TABLE outbox ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0"
                )
            if "dead_letter_at" not in columns:
                db.execute("ALTER TABLE outbox ADD COLUMN dead_letter_at INTEGER")
            if "last_error" not in columns:
                db.execute("ALTER TABLE outbox ADD COLUMN last_error TEXT")

    def create_conversation(self, conversation_id, members):
        members = tuple(members)
        if len(members) < 2 or len(set(members)) != len(members):
            raise ValueError("conversation requires at least two unique members")
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                "INSERT INTO conversations(conversation_id, next_position) VALUES (?, 1)",
                (conversation_id,),
            )
            db.executemany(
                "INSERT INTO members(conversation_id, account_id) VALUES (?, ?)",
                [(conversation_id, account) for account in members],
            )
            db.commit()

    def send(self, sender_id, conversation_id, operation_key, payload,
             *, fail_before_commit=False, lose_response_after_commit=False):
        if not operation_key or not payload:
            raise SendRejected("operation key and payload are required")
        db = self._connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            member = db.execute(
                "SELECT 1 FROM members WHERE conversation_id=? AND account_id=?",
                (conversation_id, sender_id),
            ).fetchone()
            if member is None:
                raise SendRejected("sender is not a conversation member")

            previous = db.execute(
                "SELECT payload, message_id FROM idempotency "
                "WHERE conversation_id=? AND sender_id=? AND operation_key=?",
                (conversation_id, sender_id, operation_key),
            ).fetchone()
            if previous:
                if previous[0] != payload:
                    raise IdempotencyConflict("operation key reused with different payload")
                db.commit()
                return previous[1]

            row = db.execute(
                "SELECT next_position FROM conversations WHERE conversation_id=?",
                (conversation_id,),
            ).fetchone()
            if row is None:
                raise SendRejected("unknown conversation")
            position = row[0]
            message_id = f"msg:{conversation_id}:{position}"

            if fail_before_commit:
                raise SendRejected("simulated failure before commit")

            db.execute(
                "INSERT INTO messages(message_id, conversation_id, position, sender_id, operation_key, payload) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (message_id, conversation_id, position, sender_id, operation_key, payload),
            )
            db.execute(
                "INSERT INTO idempotency(conversation_id, sender_id, operation_key, payload, message_id) "
                "VALUES (?, ?, ?, ?, ?)",
                (conversation_id, sender_id, operation_key, payload, message_id),
            )
            recipients = db.execute(
                "SELECT account_id FROM members WHERE conversation_id=? AND account_id<>?",
                (conversation_id, sender_id),
            ).fetchall()
            db.executemany(
                "INSERT INTO outbox(message_id, recipient_id) VALUES (?, ?)",
                [(message_id, recipient[0]) for recipient in recipients],
            )
            db.execute(
                "UPDATE conversations SET next_position=next_position+1 WHERE conversation_id=?",
                (conversation_id,),
            )
            db.commit()
        except Exception:
            if db.in_transaction:
                db.rollback()
            raise
        finally:
            db.close()

        if lose_response_after_commit:
            raise UnknownOutcome("committed; response was lost")
        return message_id

    def claim_next(self, worker_id, claim_token, now, lease_seconds, max_attempts=5):
        if not worker_id or not claim_token or lease_seconds <= 0 or max_attempts < 1:
            raise ValueError("worker, token, positive lease and max_attempts are required")
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            # Expired final attempts and legacy pending rows at the limit become
            # visible as dead-lettered, and cannot be silently retried forever.
            db.execute(
                "UPDATE outbox SET state='pending', lease_token=NULL, lease_owner=NULL, "
                "lease_until=NULL, dead_letter_at=?, "
                "last_error=COALESCE(last_error, 'retry limit reached') "
                "WHERE dead_letter_at IS NULL AND attempts>=? AND "
                "(state='pending' OR (state='leased' AND lease_until<=?))",
                (now, max_attempts, now),
            )
            row = db.execute(
                "SELECT o.message_id, o.recipient_id FROM outbox o "
                "JOIN messages m ON m.message_id=o.message_id "
                "WHERE o.dead_letter_at IS NULL AND o.attempts<? AND ("
                "  (o.state='pending' AND o.next_attempt_at<=?) OR "
                "  (o.state='leased' AND o.lease_until<=?)"
                ") AND NOT EXISTS ("
                "  SELECT 1 FROM outbox prior "
                "  JOIN messages pm ON pm.message_id=prior.message_id "
                "  WHERE prior.recipient_id=o.recipient_id "
                "    AND pm.conversation_id=m.conversation_id "
                "    AND pm.position<m.position "
                "    AND prior.state<>'dispatched'"
                ") "
                "ORDER BY m.rowid, o.rowid LIMIT 1",
                (max_attempts, now, now),
            ).fetchone()
            if row is None:
                db.commit()
                return None
            message_id, recipient_id = row
            db.execute(
                "UPDATE outbox SET state='leased', attempts=attempts+1, "
                "lease_token=?, lease_owner=?, lease_until=?, dispatched_at=NULL "
                "WHERE message_id=? AND recipient_id=?",
                (claim_token, worker_id, now + lease_seconds, message_id, recipient_id),
            )
            attempt = db.execute(
                "SELECT attempts FROM outbox WHERE message_id=? AND recipient_id=?",
                (message_id, recipient_id),
            ).fetchone()[0]
            db.commit()
            return {
                "message_id": message_id,
                "recipient_id": recipient_id,
                "worker_id": worker_id,
                "claim_token": claim_token,
                "attempt": attempt,
                "lease_until": now + lease_seconds,
            }

    def acknowledge_dispatch(self, message_id, recipient_id, claim_token, dispatched_at):
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            result = db.execute(
                "UPDATE outbox SET state='dispatched', dispatched_at=?, "
                "lease_token=NULL, lease_owner=NULL, lease_until=NULL, "
                "dead_letter_at=NULL, last_error=NULL "
                "WHERE message_id=? AND recipient_id=? AND state='leased' "
                "AND lease_token=? AND lease_until>?",
                (dispatched_at, message_id, recipient_id, claim_token, dispatched_at),
            )
            if result.rowcount != 1:
                db.rollback()
                raise OutboxClaimError("claim is stale, unknown or already completed")
            db.commit()

    def release_claim(self, message_id, recipient_id, claim_token, *,
                      failed_at, retry_at, max_attempts=5, error=None):
        if failed_at < 0 or retry_at < failed_at or max_attempts < 1:
            raise ValueError("failure time, retry time or max_attempts is invalid")
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            result = db.execute(
                "UPDATE outbox SET state='pending', lease_token=NULL, lease_owner=NULL, "
                "lease_until=NULL, next_attempt_at=?, "
                "dead_letter_at=CASE WHEN attempts>=? THEN ? ELSE NULL END, "
                "last_error=? "
                "WHERE message_id=? AND recipient_id=? AND state='leased' "
                "AND lease_token=? AND lease_until>?",
                (retry_at, max_attempts, failed_at, error, message_id, recipient_id,
                 claim_token, failed_at),
            )
            if result.rowcount != 1:
                db.rollback()
                raise OutboxClaimError("claim is stale, expired, unknown or already completed")
            attempts = db.execute(
                "SELECT attempts FROM outbox WHERE message_id=? AND recipient_id=?",
                (message_id, recipient_id),
            ).fetchone()[0]
            db.commit()
            return "dead_letter" if attempts >= max_attempts else "pending"

    def snapshot(self, conversation_id):
        with self._connect() as db:
            messages = db.execute(
                "SELECT message_id, position, sender_id, payload FROM messages "
                "WHERE conversation_id=? ORDER BY position",
                (conversation_id,),
            ).fetchall()
            outbox = db.execute(
                "SELECT o.message_id, o.recipient_id, "
                "CASE WHEN o.dead_letter_at IS NOT NULL THEN 'dead_letter' ELSE o.state END "
                "FROM outbox o JOIN messages m USING(message_id) "
                "WHERE m.conversation_id=? ORDER BY m.position, o.recipient_id",
                (conversation_id,),
            ).fetchall()
            next_position = db.execute(
                "SELECT next_position FROM conversations WHERE conversation_id=?",
                (conversation_id,),
            ).fetchone()[0]
            return messages, outbox, next_position
