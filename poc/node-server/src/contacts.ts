import { randomUUID } from "node:crypto";
import type { Pool as PoolType } from "pg";

export type UserPreview = { id: string; username: string; display_name: string };
export type ContactRequest = {
  id: string; requester_id: string; recipient_id: string; status: "pending" | "accepted" | "declined";
  created_at: Date; responded_at: Date | null;
};
export class ContactError extends Error {
  constructor(readonly code: "invalid" | "not_found" | "not_recipient" | "already_contact" | "reverse_pending" | "forbidden") { super(code); }
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
      const preview = await c.query<{requester_id:string;recipient_id:string}>(
        "SELECT requester_id,recipient_id FROM contact_requests WHERE id=$1",
        [requestId]
      );
      const candidate = preview.rows[0];
      if (!candidate) throw new ContactError("not_found");
      if (candidate.recipient_id !== accountId) throw new ContactError("not_recipient");
      const [low, high] = pair(candidate.requester_id, candidate.recipient_id);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`contact:${low}:${high}`]);
      const found = await c.query<ContactRequest>(
        "SELECT id,requester_id,recipient_id,status,created_at,responded_at FROM contact_requests WHERE id=$1 FOR UPDATE",
        [requestId]
      );
      const request = found.rows[0];
      if (!request || request.status !== "pending") throw new ContactError("not_found");
      if (request.recipient_id !== accountId) throw new ContactError("not_recipient");
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
      await c.query("INSERT INTO conversation_details(conversation_id,kind,title,created_by) VALUES($1,'direct',NULL,$2) ON CONFLICT(conversation_id) DO NOTHING", [directId, accountId]);
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

  async decline(accountId: string, requestId: string): Promise<void> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const preview = await c.query<{requester_id:string;recipient_id:string}>(
        "SELECT requester_id,recipient_id FROM contact_requests WHERE id=$1",
        [requestId]
      );
      const candidate = preview.rows[0];
      if (!candidate) throw new ContactError("not_found");
      if (candidate.recipient_id !== accountId) throw new ContactError("not_recipient");
      const [low, high] = pair(candidate.requester_id, candidate.recipient_id);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`contact:${low}:${high}`]);
      const found = await c.query<ContactRequest>(
        "SELECT id,requester_id,recipient_id,status,created_at,responded_at FROM contact_requests WHERE id=$1 FOR UPDATE",
        [requestId]
      );
      const request = found.rows[0];
      if (!request || request.status !== "pending") throw new ContactError("not_found");
      if (request.recipient_id !== accountId) throw new ContactError("not_recipient");
      await c.query("UPDATE contact_requests SET status='declined',responded_at=now() WHERE id=$1", [requestId]);
      await c.query("COMMIT");
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

  async conversations(accountId: string): Promise<Array<{
    conversation_id: string; kind: "direct" | "group" | "channel"; title: string | null;
    peer: UserPreview | null; members_count: number; last_message: string | null;
    last_message_at: Date | null; last_position: string;
  }>> {
    const result = await this.pool.query<{
      conversation_id:string; kind:"direct"|"group"|"channel"; title:string|null;
      peer_id:string|null; peer_username:string|null; peer_display_name:string|null;
      members_count:number; last_message:string|null; last_message_at:Date|null; last_position:string;
    }>(
      "SELECT d.conversation_id,d.kind,d.title,a.id AS peer_id,a.username AS peer_username,a.display_name AS peer_display_name," +
      "(SELECT count(*)::int FROM conversation_members cm WHERE cm.conversation_id=d.conversation_id) AS members_count," +
      "latest.payload AS last_message,latest.created_at AS last_message_at,COALESCE(cc.last_position,0)::text AS last_position " +
      "FROM conversation_details d " +
      "JOIN conversation_members mine ON mine.conversation_id=d.conversation_id AND mine.account_id=$1 " +
      "LEFT JOIN direct_conversations dc ON dc.conversation_id=d.conversation_id " +
      "LEFT JOIN accounts a ON d.kind='direct' AND a.id=CASE WHEN dc.account_low=$1 THEN dc.account_high ELSE dc.account_low END " +
      "LEFT JOIN conversation_counters cc ON cc.conversation_id=d.conversation_id " +
      "LEFT JOIN LATERAL (SELECT payload,created_at FROM messages WHERE conversation_id=d.conversation_id ORDER BY position DESC LIMIT 1) latest ON true " +
      "ORDER BY COALESCE(latest.created_at,d.created_at) DESC LIMIT 100",
      [accountId]
    );
    return result.rows.map(row => ({
      conversation_id:row.conversation_id,
      kind:row.kind,
      title:row.title,
      peer:row.peer_id ? {id:row.peer_id,username:row.peer_username!,display_name:row.peer_display_name!} : null,
      members_count:row.members_count,
      last_message:row.last_message,
      last_message_at:row.last_message_at,
      last_position:row.last_position
    }));
  }

  async createGroup(accountId: string, titleInput: string, usernamesInput: string[]): Promise<{conversation_id:string;title:string;members_count:number}> {
    const title = titleInput.trim();
    if (!accountId || title.length < 1 || title.length > 80 || !Array.isArray(usernamesInput) ||
        usernamesInput.length < 1 || usernamesInput.length > 50) throw new ContactError("invalid");
    const usernames = usernamesInput.map(value => typeof value === "string" ? value.trim().toLowerCase() : "");
    if (usernames.some(value => !/^[a-z0-9_]{3,24}$/.test(value)) || new Set(usernames).size !== usernames.length) {
      throw new ContactError("invalid");
    }
    const targetRows = await this.pool.query<{id:string;username:string}>(
      "SELECT id,username FROM accounts WHERE username=ANY($1::text[])",
      [usernames]
    );
    if (targetRows.rowCount !== usernames.length || targetRows.rows.some(row => row.id === accountId)) {
      throw new ContactError("not_found");
    }
    const memberIds = targetRows.rows.map(row => row.id);
    const pairCount = await this.pool.query<{n:number}>(
      "SELECT count(*)::int AS n FROM contacts " +
      "WHERE (account_low=$1 AND account_high=ANY($2::text[])) " +
      "OR (account_high=$1 AND account_low=ANY($2::text[]))",
      [accountId,memberIds]
    );
    if (pairCount.rows[0]!.n !== memberIds.length) throw new ContactError("not_found");

    const conversationId = randomUUID();
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("INSERT INTO conversations(id) VALUES($1)", [conversationId]);
      await c.query("INSERT INTO conversation_details(conversation_id,kind,title,created_by) VALUES($1,'group',$2,$3)",
        [conversationId,title,accountId]);
      await c.query("INSERT INTO conversation_members(conversation_id,account_id,role) SELECT $1,members.member_id,CASE WHEN members.member_id=$3 THEN 'owner' ELSE 'member' END FROM unnest($2::text[]) AS members(member_id)",
        [conversationId,[accountId,...memberIds],accountId]);
      await c.query("COMMIT");
      return {conversation_id:conversationId,title,members_count:memberIds.length+1};
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally { c.release(); }
  }

  async renameGroup(accountId:string,conversationId:string,titleInput:string):Promise<void> {
    const title=titleInput.trim();
    if(!conversationId || title.length<1 || title.length>80) throw new ContactError("invalid");
    const result=await this.pool.query<{created_by:string}>(
      "SELECT created_by FROM conversation_details WHERE conversation_id=$1 AND kind='group'",
      [conversationId]
    );
    if(!result.rowCount) throw new ContactError("not_found");
    if(result.rows[0]!.created_by!==accountId) throw new ContactError("forbidden");
    await this.pool.query("UPDATE conversation_details SET title=$2 WHERE conversation_id=$1",[conversationId,title]);
  }

  async addGroupMembers(accountId:string,conversationId:string,usernamesInput:string[]):
    Promise<{added:number;members_count:number}> {
    if(!conversationId || !Array.isArray(usernamesInput) || usernamesInput.length<1 || usernamesInput.length>50) {
      throw new ContactError("invalid");
    }
    const usernames=usernamesInput.map(value=>typeof value==="string"?value.trim().toLowerCase():"");
    if(usernames.some(value=>!/^[a-z0-9_]{3,24}$/.test(value)) || new Set(usernames).size!==usernames.length) {
      throw new ContactError("invalid");
    }
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",[`group:${conversationId}`]);
      const group=await c.query<{created_by:string}>(
        "SELECT created_by FROM conversation_details WHERE conversation_id=$1 AND kind='group' FOR UPDATE",
        [conversationId]
      );
      if(!group.rowCount) throw new ContactError("not_found");
      if(group.rows[0]!.created_by!==accountId) throw new ContactError("forbidden");
      const targets=await c.query<{id:string}>("SELECT id FROM accounts WHERE username=ANY($1::text[])",[usernames]);
      if(targets.rowCount!==usernames.length || targets.rows.some(row=>row.id===accountId)) throw new ContactError("not_found");
      const memberIds=targets.rows.map(row=>row.id);
      const accepted=await c.query<{n:number}>(
        "SELECT count(*)::int AS n FROM contacts WHERE (account_low=$1 AND account_high=ANY($2::text[])) OR (account_high=$1 AND account_low=ANY($2::text[]))",
        [accountId,memberIds]
      );
      if(accepted.rows[0]!.n!==memberIds.length) throw new ContactError("not_found");
      const existing=await c.query<{account_id:string}>(
        "SELECT account_id FROM conversation_members WHERE conversation_id=$1 AND account_id=ANY($2::text[])",
        [conversationId,memberIds]
      );
      const existingIds=new Set(existing.rows.map(row=>row.account_id));
      const newMemberIds=memberIds.filter(id=>!existingIds.has(id));
      const current=await c.query<{n:number}>(
        "SELECT count(*)::int AS n FROM conversation_members WHERE conversation_id=$1",[conversationId]
      );
      if(current.rows[0]!.n+newMemberIds.length>51) throw new ContactError("invalid");
      const inserted=await c.query(
        "INSERT INTO conversation_members(conversation_id,account_id,role) SELECT $1,members.member_id,'member' FROM unnest($2::text[]) AS members(member_id) ON CONFLICT DO NOTHING",
        [conversationId,newMemberIds]
      );
      const count=await c.query<{n:number}>(
        "SELECT count(*)::int AS n FROM conversation_members WHERE conversation_id=$1",[conversationId]
      );
      await c.query("COMMIT");
      return {added:inserted.rowCount??0,members_count:count.rows[0]!.n};
    } catch(error) {
      await c.query("ROLLBACK");
      throw error;
    } finally { c.release(); }
  }

  async removeGroupMember(accountId:string,conversationId:string,usernameInput:string):Promise<void> {
    const username=usernameInput.trim().toLowerCase();
    if(!conversationId || !/^[a-z0-9_]{3,24}$/.test(username)) throw new ContactError("invalid");
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",[`group:${conversationId}`]);
      const group=await c.query<{created_by:string}>(
        "SELECT created_by FROM conversation_details WHERE conversation_id=$1 AND kind='group' FOR UPDATE",
        [conversationId]
      );
      if(!group.rowCount) throw new ContactError("not_found");
      if(group.rows[0]!.created_by!==accountId) throw new ContactError("forbidden");
      const target=await c.query<{id:string}>("SELECT id FROM accounts WHERE username=$1",[username]);
      if(!target.rowCount || target.rows[0]!.id===accountId) throw new ContactError("not_found");
      const removed=await c.query(
        "DELETE FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",
        [conversationId,target.rows[0]!.id]
      );
      if(!removed.rowCount) throw new ContactError("not_found");
      await c.query("COMMIT");
    } catch(error) {
      await c.query("ROLLBACK");
      throw error;
    } finally { c.release(); }
  }

  async leaveGroup(accountId:string,conversationId:string):Promise<void> {
    if(!conversationId) throw new ContactError("invalid");
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",[`group:${conversationId}`]);
      const group=await c.query<{created_by:string}>(
        "SELECT created_by FROM conversation_details WHERE conversation_id=$1 AND kind='group' FOR UPDATE",
        [conversationId]
      );
      if(!group.rowCount) throw new ContactError("not_found");
      if(group.rows[0]!.created_by===accountId) throw new ContactError("forbidden");
      const removed=await c.query("DELETE FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",
        [conversationId,accountId]);
      if(!removed.rowCount) throw new ContactError("not_found");
      await c.query("COMMIT");
    } catch(error) {
      await c.query("ROLLBACK");
      throw error;
    } finally { c.release(); }
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
