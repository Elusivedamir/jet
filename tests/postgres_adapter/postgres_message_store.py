"""PostgreSQL adapter experiment implementing the SQLite experiment's public contract.

This is a comparison POC, not production messaging infrastructure.
Requires PostgreSQL 16+ and psycopg 3.
"""
import psycopg


class SendRejected(Exception):
    pass


class IdempotencyConflict(SendRejected):
    pass


class UnknownOutcome(Exception):
    """The transaction committed, but the caller did not receive confirmation."""


class OutboxClaimError(Exception):
    pass


def exponential_backoff_seconds(attempt, base_seconds=2, max_seconds=300):
    if attempt < 1 or base_seconds < 1 or max_seconds < 1:
        raise ValueError("attempt, base and cap must be positive")
    return min(base_seconds * (2 ** (attempt - 1)), max_seconds)


class PostgreSQLMessageStore:
    def __init__(self, dsn):
        self.dsn = str(dsn)
        self._initialize()

    def _connect(self):
        return psycopg.connect(self.dsn)

    def _initialize(self):
        with self._connect() as db:
            statements = [
                "CREATE TABLE IF NOT EXISTS conversations (\n    conversation_id TEXT PRIMARY KEY,\n    next_position BIGINT NOT NULL CHECK (next_position > 0)\n)",
                "CREATE TABLE IF NOT EXISTS members (\n    conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),\n    account_id TEXT NOT NULL,\n    PRIMARY KEY (conversation_id, account_id)\n)",
                "CREATE TABLE IF NOT EXISTS messages (\n    message_id TEXT PRIMARY KEY,\n    conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),\n    position BIGINT NOT NULL,\n    sender_id TEXT NOT NULL,\n    operation_key TEXT NOT NULL,\n    payload TEXT NOT NULL,\n    UNIQUE (conversation_id, position)\n)",
                "CREATE TABLE IF NOT EXISTS idempotency (\n    conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),\n    sender_id TEXT NOT NULL,\n    operation_key TEXT NOT NULL,\n    payload TEXT NOT NULL,\n    message_id TEXT NOT NULL REFERENCES messages(message_id),\n    PRIMARY KEY (conversation_id, sender_id, operation_key)\n)",
                "CREATE TABLE IF NOT EXISTS outbox (\n    message_id TEXT NOT NULL REFERENCES messages(message_id),\n    recipient_id TEXT NOT NULL,\n    state TEXT NOT NULL DEFAULT 'pending'\n        CHECK (state IN ('pending', 'leased', 'dispatched', 'dead_letter')),\n    attempts INTEGER NOT NULL DEFAULT 0,\n    lease_token TEXT,\n    lease_owner TEXT,\n    lease_until BIGINT,\n    dispatched_at BIGINT,\n    next_attempt_at BIGINT NOT NULL DEFAULT 0,\n    dead_letter_at BIGINT,\n    last_error TEXT,\n    PRIMARY KEY (message_id, recipient_id)\n)",
                "CREATE INDEX IF NOT EXISTS outbox_due_idx\n    ON outbox(state, next_attempt_at, lease_until)",
                "CREATE INDEX IF NOT EXISTS messages_conversation_position_idx\n    ON messages(conversation_id, position)",
                "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            ]
            for statement in statements:
                db.execute(statement)
            db.execute(
                "INSERT INTO schema_migrations(version) VALUES (1) ON CONFLICT (version) DO NOTHING"
            )

    def create_conversation(self, conversation_id, members):
        members = tuple(members)
        if len(members) < 2 or len(set(members)) != len(members):
            raise ValueError("conversation requires at least two unique members")
        with self._connect() as db:
            db.execute(
                "INSERT INTO conversations(conversation_id, next_position) VALUES (%s, 1)",
                (conversation_id,),
            )
            with db.cursor() as cursor:
                cursor.executemany(
                    "INSERT INTO members(conversation_id, account_id) VALUES (%s, %s)",
                    [(conversation_id, account) for account in members],
                )

    def send(self, sender_id, conversation_id, operation_key, payload,
             *, fail_before_commit=False, lose_response_after_commit=False):
        if not operation_key or not payload:
            raise SendRejected("operation key and payload are required")
        with self._connect() as db:
            with db.transaction():
                member = db.execute(
                    "SELECT 1 FROM members WHERE conversation_id=%s AND account_id=%s",
                    (conversation_id, sender_id),
                ).fetchone()
                if member is None:
                    raise SendRejected("sender is not a conversation member")

                # Lock before checking idempotency: concurrent retries serialize.
                row = db.execute(
                    "SELECT next_position FROM conversations "
                    "WHERE conversation_id=%s FOR UPDATE",
                    (conversation_id,),
                ).fetchone()
                if row is None:
                    raise SendRejected("unknown conversation")
                previous = db.execute(
                    "SELECT payload, message_id FROM idempotency "
                    "WHERE conversation_id=%s AND sender_id=%s AND operation_key=%s",
                    (conversation_id, sender_id, operation_key),
                ).fetchone()
                if previous:
                    if previous[0] != payload:
                        raise IdempotencyConflict("operation key reused with different payload")
                    message_id = previous[1]
                else:
                    position = row[0]
                    message_id = f"msg:{conversation_id}:{position}"
                    if fail_before_commit:
                        raise SendRejected("simulated failure before commit")
                    db.execute(
                        "INSERT INTO messages(message_id, conversation_id, position, sender_id, operation_key, payload) "
                        "VALUES (%s, %s, %s, %s, %s, %s)",
                        (message_id, conversation_id, position, sender_id, operation_key, payload),
                    )
                    db.execute(
                        "INSERT INTO idempotency(conversation_id, sender_id, operation_key, payload, message_id) "
                        "VALUES (%s, %s, %s, %s, %s)",
                        (conversation_id, sender_id, operation_key, payload, message_id),
                    )
                    recipients = db.execute(
                        "SELECT account_id FROM members WHERE conversation_id=%s AND account_id<>%s",
                        (conversation_id, sender_id),
                    ).fetchall()
                    with db.cursor() as cursor:
                        cursor.executemany(
                            "INSERT INTO outbox(message_id, recipient_id) VALUES (%s, %s)",
                            [(message_id, recipient[0]) for recipient in recipients],
                        )
                    db.execute(
                        "UPDATE conversations SET next_position=next_position+1 WHERE conversation_id=%s",
                        (conversation_id,),
                    )
        if lose_response_after_commit and not previous:
            raise UnknownOutcome("committed; response was lost")
        return message_id

    def claim_next(self, worker_id, claim_token, now, lease_seconds, max_attempts=5):
        if not worker_id or not claim_token or lease_seconds <= 0 or max_attempts < 1:
            raise ValueError("worker, token, positive lease and max_attempts are required")
        with self._connect() as db:
            with db.transaction():
                db.execute(
                    "UPDATE outbox SET state='dead_letter', dead_letter_at=%s, "
                    "lease_token=NULL, lease_owner=NULL, lease_until=NULL, "
                    "last_error=COALESCE(last_error, 'retry limit reached') "
                    "WHERE state IN ('pending','leased') AND attempts>=%s "
                    "AND (state='pending' OR lease_until<=%s)",
                    (now, max_attempts, now),
                )
                row = db.execute(
                    "SELECT o.message_id, o.recipient_id FROM outbox o "
                    "JOIN messages m ON m.message_id=o.message_id "
                    "WHERE o.attempts<%s AND ("
                    " (o.state='pending' AND o.next_attempt_at<=%s) OR "
                    " (o.state='leased' AND o.lease_until<=%s)"
                    ") AND NOT EXISTS ("
                    " SELECT 1 FROM outbox prior "
                    " JOIN messages pm ON pm.message_id=prior.message_id "
                    " WHERE prior.recipient_id=o.recipient_id "
                    " AND pm.conversation_id=m.conversation_id "
                    " AND pm.position<m.position AND prior.state<>'dispatched'"
                    ") ORDER BY m.position, o.recipient_id LIMIT 1 "
                    "FOR UPDATE OF o SKIP LOCKED",
                    (max_attempts, now, now),
                ).fetchone()
                if row is None:
                    return None
                message_id, recipient_id = row
                lease_until = now + lease_seconds
                updated = db.execute(
                    "UPDATE outbox SET state='leased', attempts=attempts+1, "
                    "lease_token=%s, lease_owner=%s, lease_until=%s, dispatched_at=NULL "
                    "WHERE message_id=%s AND recipient_id=%s",
                    (claim_token, worker_id, lease_until, message_id, recipient_id),
                )
                if updated.rowcount != 1:
                    raise OutboxClaimError("claim candidate changed during transaction")
                attempt = db.execute(
                    "SELECT attempts FROM outbox WHERE message_id=%s AND recipient_id=%s",
                    (message_id, recipient_id),
                ).fetchone()[0]
                return {
                    "message_id": message_id, "recipient_id": recipient_id,
                    "worker_id": worker_id, "claim_token": claim_token,
                    "attempt": attempt, "lease_until": lease_until,
                }

    def acknowledge_dispatch(self, message_id, recipient_id, claim_token, dispatched_at):
        with self._connect() as db:
            with db.transaction():
                result = db.execute(
                    "UPDATE outbox SET state='dispatched', dispatched_at=%s, "
                    "lease_token=NULL, lease_owner=NULL, lease_until=NULL, "
                    "dead_letter_at=NULL, last_error=NULL "
                    "WHERE message_id=%s AND recipient_id=%s AND state='leased' "
                    "AND lease_token=%s AND lease_until>%s",
                    (dispatched_at, message_id, recipient_id, claim_token, dispatched_at),
                )
                if result.rowcount != 1:
                    raise OutboxClaimError("claim is stale, unknown or already completed")

    def release_claim(self, message_id, recipient_id, claim_token, *,
                      failed_at, retry_at, max_attempts=5, error=None):
        if failed_at < 0 or retry_at < failed_at or max_attempts < 1:
            raise ValueError("failure time, retry time or max_attempts is invalid")
        with self._connect() as db:
            with db.transaction():
                result = db.execute(
                    "UPDATE outbox SET state=CASE WHEN attempts>=%s THEN 'dead_letter' ELSE 'pending' END, "
                    "lease_token=NULL, lease_owner=NULL, lease_until=NULL, next_attempt_at=%s, "
                    "dead_letter_at=CASE WHEN attempts>=%s THEN %s ELSE NULL END, last_error=%s "
                    "WHERE message_id=%s AND recipient_id=%s AND state='leased' "
                    "AND lease_token=%s AND lease_until>%s",
                    (max_attempts, retry_at, max_attempts, failed_at, error,
                     message_id, recipient_id, claim_token, failed_at),
                )
                if result.rowcount != 1:
                    raise OutboxClaimError("claim is stale, expired, unknown or already completed")
                state = db.execute(
                    "SELECT state FROM outbox WHERE message_id=%s AND recipient_id=%s",
                    (message_id, recipient_id),
                ).fetchone()[0]
                return state

    def snapshot(self, conversation_id):
        with self._connect() as db:
            messages = db.execute(
                "SELECT message_id, position, sender_id, payload FROM messages "
                "WHERE conversation_id=%s ORDER BY position", (conversation_id,),
            ).fetchall()
            outbox = db.execute(
                "SELECT o.message_id, o.recipient_id, o.state FROM outbox o "
                "JOIN messages m USING(message_id) WHERE m.conversation_id=%s "
                "ORDER BY m.position, o.recipient_id", (conversation_id,),
            ).fetchall()
            next_position = db.execute(
                "SELECT next_position FROM conversations WHERE conversation_id=%s",
                (conversation_id,),
            ).fetchone()[0]
            return messages, outbox, next_position
