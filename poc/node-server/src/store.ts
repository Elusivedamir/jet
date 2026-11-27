import { randomUUID } from "node:crypto";
import pg, { type Pool as PoolType } from "pg";
const { Pool } = pg;

export type Message = { [key: string]: any;
  message_id: string; conversation_id: string; sender_id: string;
  operation_key: string; payload: string; position: string;
};
export class ConflictError extends Error {}
export class NotMemberError extends Error {}
export class ForbiddenError extends Error {}
export class InvalidRequestError extends Error {}

export class Store {
  constructor(readonly pool: PoolType) {}

  async send(sender: string, conversation: string, key: string, payload: string, replyTo: string | null = null): Promise<Message> {
    if (!sender || !conversation || !key || !payload || (replyTo !== null && (!replyTo || replyTo.length > 128))) throw new InvalidRequestError();
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sender + ":" + key]);
      const member = await c.query<{role:string;kind:string|null}>(
        "SELECT cm.role,d.kind FROM conversation_members cm LEFT JOIN conversation_details d ON d.conversation_id=cm.conversation_id WHERE cm.conversation_id=$1 AND cm.account_id=$2",
        [conversation,sender]
      );
      if (member.rowCount !== 1) throw new NotMemberError();
      if (member.rows[0]!.kind === "channel" && !["owner","admin"].includes(member.rows[0]!.role)) {
        throw new ForbiddenError("only channel owners and admins can publish");
      }
      const prior = await c.query<Message>(
        "SELECT id AS message_id, conversation_id, sender_id, operation_key, payload, position, reply_to_message_id FROM messages WHERE sender_id=$1 AND operation_key=$2",
        [sender, key]);
      if (prior.rowCount) {
        const m = prior.rows[0]!;
        if (m.conversation_id !== conversation || m.payload !== payload || (m.reply_to_message_id ?? null) !== replyTo) throw new ConflictError();
        await c.query("COMMIT");
        return m;
      }
      if (replyTo !== null) {
        const target = await c.query("SELECT 1 FROM messages WHERE id=$1 AND conversation_id=$2 AND deleted_at IS NULL", [replyTo, conversation]);
        if (target.rowCount !== 1) throw new InvalidRequestError("reply target must be an active message in this conversation");
      }
      const counter = await c.query<{last_position:string}>(
        "INSERT INTO conversation_counters(conversation_id,last_position) VALUES($1,1) ON CONFLICT(conversation_id) DO UPDATE SET last_position=conversation_counters.last_position+1 RETURNING last_position",
        [conversation]);
      const position = counter.rows[0]!.last_position;
      const id = randomUUID();
      await c.query("INSERT INTO messages(id,conversation_id,sender_id,operation_key,payload,position,reply_to_message_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, conversation, sender, key, payload, position, replyTo]);
      const recipients = await c.query<{account_id:string}>(
        "SELECT account_id FROM conversation_members WHERE conversation_id=$1 AND account_id<>$2 ORDER BY account_id",
        [conversation, sender]);
      if ((recipients.rowCount ?? recipients.rows.length) < 1) {
        throw new InvalidRequestError("conversation requires at least one recipient besides the sender");
      }
      await c.query(
        "INSERT INTO delivery_outbox(message_id,recipient_id) SELECT $1, unnest($2::text[])",
        [id, recipients.rows.map((recipient) => recipient.account_id)]
      );
      await c.query("COMMIT");
      return {message_id:id,conversation_id:conversation,sender_id:sender,operation_key:key,payload,position,reply_to_message_id:replyTo};
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally { c.release(); }
  }

  async history(account: string, conversation: string, after: number, limit=50): Promise<Message[]> {
    if (!account || !conversation || !Number.isSafeInteger(after) || after < 0 || limit < 1 || limit > 100) throw new InvalidRequestError();
    const member = await this.pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[conversation,account]);
    if (member.rowCount !== 1) throw new NotMemberError();
    const result = await this.pool.query<Message>(
      "SELECT id AS message_id,conversation_id,sender_id,operation_key,payload,position,reply_to_message_id,edited_at,deleted_at FROM messages WHERE conversation_id=$1 AND position>$2 ORDER BY position LIMIT $3",
      [conversation,after,limit]);
    return result.rows;
  }

  async claim(batch=20, leaseMs=15000) {
    const token = randomUUID();
    const result = await this.pool.query(
      `WITH candidates AS (
         SELECT id FROM delivery_outbox WHERE available_at<=now()
         AND (state IN ('pending','retry_wait') OR (state='processing' AND lease_until<now()))
         ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $1
       )
       UPDATE delivery_outbox o SET state='processing',attempt_count=o.attempt_count+1,
         lease_until=now()+($2 * interval '1 millisecond'),lease_token=$3,last_error=NULL
       FROM candidates WHERE o.id=candidates.id
       RETURNING o.id,o.message_id,o.recipient_id,o.lease_token,o.attempt_count`,
      [batch,leaseMs,token]);
    return result.rows;
  }

  async dispatch(item: {id:number;message_id:string;recipient_id:string;lease_token:string}) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`INSERT INTO recipient_inbox(message_id,recipient_id,conversation_id,position)
        SELECT id,$2,conversation_id,position FROM messages WHERE id=$1
        ON CONFLICT(message_id,recipient_id) DO NOTHING`,[item.message_id,item.recipient_id]);
      const done = await c.query(`UPDATE delivery_outbox SET state='completed',completed_at=now(),lease_until=NULL,lease_token=NULL
        WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_until>clock_timestamp()`,[item.id,item.lease_token]);
      if (done.rowCount !== 1) throw new Error("outbox lease lost");
      await c.query("COMMIT");
    } catch(e) { await c.query("ROLLBACK"); throw e; }
    finally { c.release(); }
  }

  async retry(item: {id:number;lease_token:string;attempt_count:number}, cause: unknown) {
    const terminal = item.attempt_count >= 8;
    const delay = terminal ? 0 : Math.min(2 ** item.attempt_count,256)*1000;
    const result = await this.pool.query(`UPDATE delivery_outbox SET state=$3,
      available_at=now()+($4 * interval '1 millisecond'),lease_until=NULL,lease_token=NULL,last_error=$5
      WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_until>clock_timestamp()`,
      [item.id,item.lease_token,terminal?'terminal_failure':'retry_wait',delay,String(cause).slice(0,500)]);
    if (result.rowCount !== 1) throw new Error("outbox lease lost while retrying");
  }

  async inbox(account:string,conversation:string,after:number,limit=50):Promise<Message[]> {
    if(!account || !conversation || !Number.isSafeInteger(after) || after<0 || limit<1 || limit>100) throw new InvalidRequestError();
    const member=await this.pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[conversation,account]);
    if(member.rowCount!==1) throw new NotMemberError();
    const result=await this.pool.query<Message>(`SELECT m.id AS message_id,m.conversation_id,m.sender_id,m.operation_key,m.payload,m.position,m.reply_to_message_id,m.edited_at,m.deleted_at
      FROM recipient_inbox i JOIN messages m ON m.id=i.message_id
      WHERE i.recipient_id=$1 AND i.conversation_id=$2 AND i.position>$3
      ORDER BY i.position LIMIT $4`,[account,conversation,after,limit]);
    return result.rows;
  }

  async acknowledge(account:string,message:string) {
    const result=await this.pool.query(`INSERT INTO delivery_receipts(message_id,recipient_id)
      SELECT message_id,recipient_id FROM recipient_inbox WHERE message_id=$1 AND recipient_id=$2
      ON CONFLICT(message_id,recipient_id) DO NOTHING`,[message,account]);
    if(result.rowCount===0) {
      const prior=await this.pool.query("SELECT 1 FROM delivery_receipts WHERE message_id=$1 AND recipient_id=$2",[message,account]);
      if(prior.rowCount!==1) throw new NotMemberError();
    }
  }

  async editMessage(account:string,message:string,payload:string):Promise<Message> {
    if(!account || !message || !payload || payload.length>32768) throw new InvalidRequestError();
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      const prior=await c.query<Message & {created_at:Date;deleted_at:Date|null;within_window:boolean}>(
        "SELECT id AS message_id,conversation_id,sender_id,operation_key,payload,position,created_at,deleted_at,created_at>now()-interval '15 minutes' AS within_window FROM messages WHERE id=$1 FOR UPDATE",
        [message]
      );
      if(prior.rowCount!==1) throw new NotMemberError();
      const row=prior.rows[0]!;
      if(row.sender_id!==account) throw new ForbiddenError("only the sender can edit a message");
      if(row.deleted_at || !row.within_window) throw new InvalidRequestError("message edit window expired");
      if(row.payload===payload) { await c.query("COMMIT"); return row; }
      await c.query("INSERT INTO message_versions(message_id,editor_id,previous_payload) VALUES($1,$2,$3)",[message,account,row.payload]);
      const updated=await c.query<Message>(
        "UPDATE messages SET payload=$2,edited_at=now() WHERE id=$1 RETURNING id AS message_id,conversation_id,sender_id,operation_key,payload,position,edited_at,deleted_at",
        [message,payload]
      );
      await c.query(
        `INSERT INTO conversation_event_log(conversation_id,recipient_id,message_id,event_type,payload)
         SELECT $1,account_id,$2,'message.edited',$3::jsonb FROM conversation_members WHERE conversation_id=$1`,
        [row.conversation_id,message,JSON.stringify(updated.rows[0])]
      );
      await c.query("COMMIT");
      return updated.rows[0]!;
    } catch(e) { await c.query("ROLLBACK"); throw e; }
    finally { c.release(); }
  }

  async deleteMessage(account:string,message:string):Promise<void> {
    if(!account || !message) throw new InvalidRequestError();
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      const prior=await c.query<Message & {created_at:Date;deleted_at:Date|null;within_window:boolean}>(
        "SELECT id AS message_id,conversation_id,sender_id,operation_key,payload,position,created_at,deleted_at,created_at>now()-interval '15 minutes' AS within_window FROM messages WHERE id=$1 FOR UPDATE",
        [message]
      );
      if(prior.rowCount!==1) throw new NotMemberError();
      const row=prior.rows[0]!;
      if(row.sender_id!==account) throw new ForbiddenError("only the sender can delete a message");
      if(row.deleted_at || !row.within_window) throw new InvalidRequestError("message delete window expired");
      await c.query("INSERT INTO message_versions(message_id,editor_id,previous_payload) VALUES($1,$2,$3)",[message,account,row.payload]);
      const updated=await c.query(
        "UPDATE messages SET payload='',deleted_at=now(),edited_at=now() WHERE id=$1 RETURNING id AS message_id,conversation_id,sender_id,position,edited_at,deleted_at",
        [message]
      );
      await c.query(
        `INSERT INTO conversation_event_log(conversation_id,recipient_id,message_id,event_type,payload)
         SELECT $1,account_id,$2,'message.deleted',$3::jsonb FROM conversation_members WHERE conversation_id=$1`,
        [row.conversation_id,message,JSON.stringify(updated.rows[0])]
      );
      await c.query("DELETE FROM message_reactions WHERE message_id=$1",[message]);
      await c.query("COMMIT");
    } catch(e) { await c.query("ROLLBACK"); throw e; }
    finally { c.release(); }
  }

  async events(account:string,conversation:string,after:number,limit=100) {
    if(!account || !conversation || !Number.isSafeInteger(after) || after<0 || limit<1 || limit>200) throw new InvalidRequestError();
    const member=await this.pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[conversation,account]);
    if(member.rowCount!==1) throw new NotMemberError();
    const result=await this.pool.query(
      `SELECT id AS event_id,event_type,message_id,payload,created_at
       FROM conversation_event_log WHERE recipient_id=$1 AND conversation_id=$2 AND id>$3
       ORDER BY id LIMIT $4`,
      [account,conversation,after,limit]
    );
    return result.rows;
  }

  async addReaction(account:string,message:string,emojiInput:string):Promise<void> {
    const emoji=emojiInput.trim();
    const length=Array.from(emoji).length;
    if(!account || !message || length<1 || length>8 || /[\\u0000-\\u001f\\u007f]/u.test(emoji)) throw new InvalidRequestError();
    const member=await this.pool.query(
      "SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id WHERE m.id=$1 AND cm.account_id=$2",
      [message,account]
    );
    if(member.rowCount!==1) throw new NotMemberError();
    await this.pool.query(
      "INSERT INTO message_reactions(message_id,account_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [message,account,emoji]
    );
  }

  async removeReaction(account:string,message:string,emojiInput:string):Promise<void> {
    const emoji=emojiInput.trim();
    const length=Array.from(emoji).length;
    if(!account || !message || length<1 || length>8 || /[\\u0000-\\u001f\\u007f]/u.test(emoji)) throw new InvalidRequestError();
    const member=await this.pool.query(
      "SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id WHERE m.id=$1 AND cm.account_id=$2",
      [message,account]
    );
    if(member.rowCount!==1) throw new NotMemberError();
    await this.pool.query("DELETE FROM message_reactions WHERE message_id=$1 AND account_id=$2 AND emoji=$3",
      [message,account,emoji]);
  }

  async listReactions(account:string,message:string):Promise<Array<{emoji:string;count:number;reacted:boolean}>> {
    if(!account || !message) throw new InvalidRequestError();
    const result=await this.pool.query<{emoji:string;count:number;reacted:boolean}>(
      `SELECT r.emoji,count(*)::int AS count,bool_or(r.account_id=$2) AS reacted
       FROM message_reactions r
       JOIN messages m ON m.id=r.message_id
       JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.account_id=$2
       WHERE r.message_id=$1 GROUP BY r.emoji ORDER BY r.emoji`,
      [message,account]
    );
    const member=await this.pool.query(
      "SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id WHERE m.id=$1 AND cm.account_id=$2",
      [message,account]
    );
    if(member.rowCount!==1) throw new NotMemberError();
    return result.rows;
  }

  async markRead(account:string,message:string):Promise<void> {
    if(!account || !message) throw new InvalidRequestError();
    const inserted=await this.pool.query(
      `INSERT INTO message_read_receipts(message_id,recipient_id)
       SELECT message_id,recipient_id FROM recipient_inbox WHERE message_id=$1 AND recipient_id=$2
       ON CONFLICT(message_id,recipient_id) DO NOTHING`,
      [message,account]
    );
    if(inserted.rowCount===0) {
      const prior=await this.pool.query(
        "SELECT 1 FROM message_read_receipts WHERE message_id=$1 AND recipient_id=$2",[message,account]
      );
      if(prior.rowCount!==1) throw new NotMemberError();
    }
  }

  async readReceipts(account:string,message:string):Promise<Array<{recipient_id:string;delivered:boolean;read_at:string|null}>> {
    if(!account || !message) throw new InvalidRequestError();
    const result=await this.pool.query<{recipient_id:string;delivered:boolean;read_at:string|null}>(
      `SELECT o.recipient_id,(i.message_id IS NOT NULL) AS delivered,r.read_at
       FROM messages m
       JOIN delivery_outbox o ON o.message_id=m.id
       LEFT JOIN recipient_inbox i ON i.message_id=o.message_id AND i.recipient_id=o.recipient_id
       LEFT JOIN message_read_receipts r ON r.message_id=o.message_id AND r.recipient_id=o.recipient_id
       WHERE m.id=$1 AND m.sender_id=$2 ORDER BY o.recipient_id`,
      [message,account]
    );
    const own=await this.pool.query("SELECT 1 FROM messages WHERE id=$1 AND sender_id=$2",[message,account]);
    if(own.rowCount!==1) throw new NotMemberError();
    return result.rows;
  }

  async runWorker(signal:AbortSignal) {
    while(!signal.aborted) {
      try {
        const items=await this.claim();
        for(const item of items) {
          try { await this.dispatch(item); }
          catch(e) { await this.retry(item,e); }
        }
      } catch { /* transient database failure; retry on next poll */ }
      await new Promise(resolve=>setTimeout(resolve,250));
    }
  }
}
