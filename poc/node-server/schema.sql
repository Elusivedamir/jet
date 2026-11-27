CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  username TEXT NOT NULL UNIQUE CHECK (username = lower(username)),
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 48),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions(account_id, expires_at);
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS conversation_details (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('direct','group','channel')),
  title TEXT,
  created_by TEXT NOT NULL REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind='direct' AND title IS NULL) OR (kind IN ('group','channel') AND title IS NOT NULL AND char_length(title) BETWEEN 1 AND 80))
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL, PRIMARY KEY (conversation_id, account_id)
);
CREATE TABLE IF NOT EXISTS conversation_counters (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  last_position BIGINT NOT NULL DEFAULT 0 CHECK (last_position >= 0)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL, operation_key TEXT NOT NULL, payload TEXT NOT NULL,
  position BIGINT NOT NULL CHECK (position > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sender_id, operation_key), UNIQUE (conversation_id, position)
);
CREATE TABLE IF NOT EXISTS delivery_outbox (
  id BIGSERIAL PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','processing','retry_wait','completed','terminal_failure')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_until TIMESTAMPTZ, lease_token TEXT, available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ,
  UNIQUE (message_id, recipient_id)
);
CREATE TABLE IF NOT EXISTS recipient_inbox (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL, conversation_id TEXT NOT NULL, position BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, recipient_id),
  UNIQUE (recipient_id, conversation_id, position)
);
CREATE TABLE IF NOT EXISTS delivery_receipts (
  message_id TEXT NOT NULL, recipient_id TEXT NOT NULL, acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, recipient_id),
  FOREIGN KEY (message_id, recipient_id) REFERENCES recipient_inbox(message_id, recipient_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS recipient_inbox_cursor_idx ON recipient_inbox(recipient_id, conversation_id, position);
CREATE INDEX IF NOT EXISTS delivery_outbox_pending_idx ON delivery_outbox(state, available_at, lease_until, id);
CREATE INDEX IF NOT EXISTS messages_conversation_position_idx ON messages(conversation_id, position);

CREATE TABLE IF NOT EXISTS contact_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  requester_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CHECK (requester_id <> recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_requests_pending_pair_idx
  ON contact_requests(requester_id,recipient_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS contact_requests_recipient_idx
  ON contact_requests(recipient_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS contacts (
  account_low TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  account_high TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_low,account_high),
  CHECK (account_low < account_high)
);
CREATE TABLE IF NOT EXISTS direct_conversations (
  account_low TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  account_high TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_low,account_high),
  CHECK (account_low < account_high)
);
INSERT INTO conversation_details(conversation_id,kind,title,created_by)
SELECT dc.conversation_id,'direct',NULL,dc.account_low
FROM direct_conversations dc
ON CONFLICT(conversation_id) DO NOTHING;
