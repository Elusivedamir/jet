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
  account_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','subscriber')),
  PRIMARY KEY (conversation_id, account_id)
);
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','subscriber'));
CREATE TABLE IF NOT EXISTS channel_metadata (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]{3,32}$'),
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private')),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 300),
  invite_code_hash TEXT UNIQUE,
  CHECK ((visibility='public' AND invite_code_hash IS NULL) OR (visibility='private' AND invite_code_hash IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS channel_metadata_public_search_idx
  ON channel_metadata(slug) WHERE visibility='public';
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

ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS message_versions (
  id BIGSERIAL PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  editor_id TEXT NOT NULL,
  previous_payload TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_versions_message_idx ON message_versions(message_id,changed_at);
CREATE TABLE IF NOT EXISTS conversation_event_log (
  id BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('message.edited','message.deleted')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_event_log_cursor_idx
  ON conversation_event_log(recipient_id,conversation_id,id);


CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id,account_id,emoji)
);
CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON message_reactions(message_id,emoji);
CREATE TABLE IF NOT EXISTS message_read_receipts (
  message_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id,recipient_id),
  FOREIGN KEY (message_id,recipient_id)
    REFERENCES recipient_inbox(message_id,recipient_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS message_read_receipts_message_idx ON message_read_receipts(message_id,read_at);


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
