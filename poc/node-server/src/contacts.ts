import { randomUUID } from "node:crypto";
import type { Pool as PoolType } from "pg";

export type UserPreview = { id: string; username: string; display_name: string };
export type ContactRequest = {
  id: string; requester_id: string; recipient_id: string; status: "pending" | "accepted" | "declined";
  created_at: Date; responded_at: Date | null;
};
export class ContactError extends Error {
  constructor(readonly code: "invalid" | "not_found" | "not_recipient" | "already_contact" | "reverse_pending") { super(code); }
}

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export class ContactsStore {
  constructor(readonly pool: PoolType) {}

  async search(accountId: string, query: string): Promise<UserPreview[]> {
    const q = query.trim().toLowerCase();
    if (!accountId || q.length < 2 || q.length > 32) throw new ContactError("invalid");
    const result = await this.pool.query<UserPreview>(
      `SELECT id, username, display_name FROM accounts
       WHERE id<>$1 AND (left(username,char_length($2))=$2 OR left(lower(display_name),char_length($2))=$2)
       ORDER BY CASE WHEN username=$2 THEN 0 WHEN left(username,char_length($2))=$2 THEN 1 ELSE 2 END, username
       LIMIT 20`,
      [accountId, q]
    );
    return result.rows;
  }

  async request(requesterId: string, usernameInput: string): Promise<ContactRequest> {
    const username = usernameInput.trim().toLowerCase();
    if (!requesterId || !/^[a-z0-9_]{3,24}$/.test(username)) throw new ContactError("invalid");
    const target = await this.pool.query<{id:string}>("SELECT id FROM accounts WHERE username=$1", [username]);
    const recipientId = target.rows[0]?.id;
    if (!recipientId || recipientId === requesterId) throw new ContactError("not_found");
    const [low, high] = pair(requesterId, recipientId);
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`contact:${low}:${high}`]);
      const existingContact = await c.query("SELECT 1 FROM contacts WHERE account_low=$1 AND account_high=$2", [low, high]);
      if (existingContact.rowCount) throw new ContactError("already_contact");
      const reverse = await c.query<ContactRequest>(
        "SELECT * FROM contact_requests WHERE requester_id=$1 AND recipient_id=$2 AND status='pending' FOR UPDATE",
        [recipientId, requesterId]
      );
      if (reverse.rowCount) throw new ContactError("reverse_pending");
      const inserted = await c.query<ContactRequest>(
        `INSERT INTO contact_requests(requester_id,recipient_id) VALUES($1,$2)
         ON CONFLICT(requester_id,recipient_id) WHERE status='pending'
         DO UPDATE SET created_at=contact_requests.created_at RETURNING id,requester_id,recipient_id,status,created_at,responded_at`,
        [requesterId, recipientId]
      );
      await c.query("COMMIT");
      return inserted.rows[0]!;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally { c.release(); }
  }

  async requests(accountId: string): Promise<{ incoming: ContactRequest[]; outgoing: ContactRequest[] }> {
    const result = await this.pool.query<ContactRequest>(
      "SELECT id,requester_id,recipient_id,status,created_at,responded_at FROM contact_requests WHERE status='pending' AND (requester_id=$1 OR recipient_id=$1) ORDER BY created_at DESC LIMIT 100",
      [accountId]
    );
    return {
      incoming: result.rows.filter(row => row.recipient_id === accountId),
      outgoing: result.rows.filter(row => row.requester_id === accountId)
    };
  }

  async accept(accountId: string, requestId: string): Promise<{ contact: UserPreview; conversation_id: string }> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`contact-request:${requestId}`]);
      const found = await c.query<ContactRequest>(
        "SELECT id,requester_id,recipient_id,status,created_at,responded_at FROM contact_requests WHERE id=$1 FOR UPDATE",
        [requestId]
      );
      const request = found.rows[0];
      if (!request || request.status !== "pending") throw new ContactError("not_found");
      if (request.recipient_id !== accountId) throw new ContactError("not_recipient");
      const [low, high] = pair(request.requester_id, request.recipient_id);
      await c.query("INSERT INTO contacts(account_low,account_high) VALUES($1,$2) ON CONFLICT DO NOTHING", [low, high]);
      const conversationId = randomUUID();
      await c.query("INSERT INTO conversations(id) VALUES($1) ON CONFLICT DO NOTHING", [conversationId]);
      const existing = await c.query<{conversation_id:string}>(
        "SELECT conversation_id FROM direct_conversations WHERE account_low=$1 AND account_high=$2",
        [low, high]
      );
      let directId = existing.rows[0]?.conversation_id;
      if (!directId) {
        await c.query("INSERT INTO conversation_members(conversation_id,account_id) VALUES($1,$2),($1,$3) ON CONFLICT DO NOTHING",
          [conversationId, request.requester_id, request.recipient_id]);
        const inserted = await c.query<{conversation_id:string}>(
          "INSERT INTO direct_conversations(account_low,account_high,conversation_id) VALUES($1,$2,$3) ON CONFLICT(account_low,account_high) DO UPDATE SET account_low=EXCLUDED.account_low RETURNING conversation_id",
          [low, high, conversationId]
        );
        directId = inserted.rows[0]!.conversation_id;
        if (directId !== conversationId) await c.query("DELETE FROM conversations WHERE id=$1", [conversationId]);
      } else {
        await c.query("INSERT INTO conversation_members(conversation_id,account_id) VALUES($1,$2),($1,$3) ON CONFLICT DO NOTHING",
          [directId, request.requester_id, request.recipient_id]);
      }
      await c.query("UPDATE contact_requests SET status='accepted',responded_at=now() WHERE id=$1", [requestId]);
      const otherId = request.requester_id;
      const profile = await c.query<UserPreview>("SELECT id,username,display_name FROM accounts WHERE id=$1", [otherId]);
      await c.query("COMMIT");
      return { contact: profile.rows[0]!, conversation_id: directId };
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally { c.release(); }
  }

  async list(accountId: string): Promise<UserPreview[]> {
    const result = await this.pool.query<UserPreview>(
      `SELECT a.id,a.username,a.display_name FROM contacts c
       JOIN accounts a ON a.id=CASE WHEN c.account_low=$1 THEN c.account_high ELSE c.account_low END
       WHERE c.account_low=$1 OR c.account_high=$1 ORDER BY a.username`,
      [accountId]
    );
    return result.rows;
  }

  async directConversation(accountId: string, usernameInput: string): Promise<string> {
    const username = usernameInput.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new ContactError("invalid");
    const target = await this.pool.query<{id:string}>("SELECT id FROM accounts WHERE username=$1", [username]);
    const other = target.rows[0]?.id;
    if (!other || other === accountId) throw new ContactError("not_found");
    const [low, high] = pair(accountId, other);
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const contact = await c.query("SELECT 1 FROM contacts WHERE account_low=$1 AND account_high=$2", [low, high]);
      if (!contact.rowCount) throw new ContactError("not_found");
      const existing = await c.query<{conversation_id:string}>(
        "SELECT conversation_id FROM direct_conversations WHERE account_low=$1 AND account_high=$2",
        [low, high]
      );
      if (!existing.rowCount) throw new ContactError("not_found");
      await c.query("COMMIT");
      return existing.rows[0]!.conversation_id;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally { c.release(); }
  }
}
