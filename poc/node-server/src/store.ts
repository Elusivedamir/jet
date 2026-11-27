import { randomUUID } from "node:crypto";
import pg, { type Pool as PoolType } from "pg";
const { Pool } = pg;

export type Message = { [key: string]: any;
  message_id: string; conversation_id: string; sender_id: string;
  operation_key: string; payload: string; position: string;
};
export class ConflictError extends Error {}
export class NotMemberError extends Error {}
export class InvalidRequestError extends Error {}

export class Store {
  constructor(readonly pool: PoolType) {}

  async send(sender: string, conversation: string, key: string, payload: string): Promise<Message> {
    if (!sender || !conversation || !key || !payload) throw new InvalidRequestError();
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sender + ":" + key]);
      const member = await c.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2", [conversation, sender]);
      if (member.rowCount !== 1) throw new NotMemberError();
      const prior = await c.query<Message>(
        "SELECT id AS message_id, conversation_id, sender_id, operation_key, payload, position FROM messages WHERE sender_id=$1 AND operation_key=$2",
        [sender, key]);
      if (prior.rowCount) {
        const m = prior.rows[0]!;
        if (m.conversation_id !== conversation || m.payload !== payload) throw new ConflictError();
        await c.query("COMMIT");
        return m;
      }
      const counter = await c.query<{last_position:string}>(
        "INSERT INTO conversation_counters(conversation_id,last_position) VALUES($1,1) ON CONFLICT(conversation_id) DO UPDATE SET last_position=conversation_counters.last_position+1 RETURNING last_position",
        [conversation]);
      const position = counter.rows[0]!.last_position;
      const id = randomUUID();
      await c.query("INSERT INTO messages(id,conversation_id,sender_id,operation_key,payload,position) VALUES($1,$2,$3,$4,$5,$6)",
        [id, conversation, sender, key, payload, position]);
      const recipients = await c.query<{account_id:string}>(
        "SELECT account_id FROM conversation_members WHERE conversation_id=$1 AND account_id<>$2 ORDER BY account_id",
        [conversation, sender]);
      if (recipients.rowCount !== 1) throw new InvalidRequestError("PoC requires exactly one recipient");
      await c.query("INSERT INTO delivery_outbox(message_id,recipient_id) VALUES($1,$2)", [id, recipients.rows[0]!.account_id]);
      await c.query("COMMIT");
      return {message_id:id,conversation_id:conversation,sender_id:sender,operation_key:key,payload,position};
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally { c.release(); }
  }

  async history(account: string, conversation: string, after: number, limit=50): Promise<Message[]> {
    if (!account || !conversation || after < 0 || limit < 1 || limit > 100) throw new InvalidRequestError();
    const member = await this.pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[conversation,account]);
    if (member.rowCount !== 1) throw new NotMemberError();
    const result = await this.pool.query<Message>(
      "SELECT id AS message_id,conversation_id,sender_id,operation_key,payload,position FROM messages WHERE conversation_id=$1 AND position>$2 ORDER BY position LIMIT $3",
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
        WHERE id=$1 AND state='processing' AND lease_token=$2`,[item.id,item.lease_token]);
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
      WHERE id=$1 AND state='processing' AND lease_token=$2`,
      [item.id,item.lease_token,terminal?'terminal_failure':'retry_wait',delay,String(cause).slice(0,500)]);
    if (result.rowCount !== 1) throw new Error("outbox lease lost while retrying");
  }

  async inbox(account:string,conversation:string,after:number,limit=50):Promise<Message[]> {
    const member=await this.pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[conversation,account]);
    if(member.rowCount!==1) throw new NotMemberError();
    const result=await this.pool.query<Message>(`SELECT m.id AS message_id,m.conversation_id,m.sender_id,m.operation_key,m.payload,m.position
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
