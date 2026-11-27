CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    PRIMARY KEY (conversation_id, account_id)
);

CREATE TABLE IF NOT EXISTS conversation_counters (
    conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
    last_position BIGINT NOT NULL DEFAULT 0 CHECK (last_position >= 0)
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL,
    operation_key TEXT NOT NULL,
    payload TEXT NOT NULL,
    position BIGINT NOT NULL CHECK (position > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sender_id, operation_key),
    UNIQUE (conversation_id, position)
);

CREATE TABLE IF NOT EXISTS delivery_outbox (
    id BIGSERIAL PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'processing', 'retry_wait', 'completed', 'terminal_failure')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    lease_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (message_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS delivery_outbox_pending_idx
    ON delivery_outbox (state, lease_until, id);
CREATE INDEX IF NOT EXISTS messages_conversation_position_idx
    ON messages (conversation_id, position);
