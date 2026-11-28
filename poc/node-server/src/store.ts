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

  async send(sender: string, conversation: string, key: string, payload: string, replyTo: string | null = null, forwardedFrom: string | null = null, messageClass: "standard" | "business_offer" = "standard"): Promise<Message> {
    if (!['standard','business_offer'].includes(messageClass) || !sender || !conversation || !key || !payload || (replyTo !== null && (!replyTo || replyTo.length > 128)) || (forwardedFrom !== null && (!forwardedFrom || forwardedFrom.length > 128)) || (replyTo !== null && forwardedFrom !== null)) throw new InvalidRequestError();
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
      const prior = await c.query<Message & {message_class:string}>(
        "SELECT id AS message_id, conversation_id, sender_id, operation_key, payload, position, reply_to_message_id, forwarded_from_message_id, message_class FROM messages WHERE sender_id=$1 AND operation_key=$2",
        [sender, key]);
      if (prior.rowCount) {
        const m = prior.rows[0]!;
        if (m.conversation_id !== conversation || m.payload !== payload || m.message_class !== messageClass || (m.reply_to_message_id ?? null) !== replyTo || (m.forwarded_from_message_id ?? null) !== forwardedFrom) throw new ConflictError();
        await c.query("COMMIT");
        return m;
      }
      if(messageClass==="business_offer" && key.startsWith("campaign:")) {
        // Serialize the send transaction against campaign cancellation. If this
        // share lock wins, the send is in-flight; if cancellation wins, no new
        // campaign message can be committed.
        const campaign=await c.query<{status:string}>("SELECT status FROM business_campaigns WHERE id=split_part($1,':',2) AND business_account_id=$2 FOR SHARE",[key,sender]);
        if(campaign.rowCount!==1 || !["queued","sending"].includes(campaign.rows[0]!.status)) throw new ForbiddenError("campaign is cancelled or unavailable");
      }
      if (forwardedFrom !== null) {
        const source = await c.query("SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.account_id=$2 WHERE m.id=$1 AND m.deleted_at IS NULL AND (m.message_class<>'business_offer' OR m.sender_id=$2 OR EXISTS(SELECT 1 FROM recipient_inbox i WHERE i.message_id=m.id AND i.recipient_id=$2))", [forwardedFrom, sender]);
        if (source.rowCount !== 1) throw new InvalidRequestError("forward source must be an active message visible to the sender");
      }
      if (replyTo !== null) {
        const target = await c.query("SELECT 1 FROM messages m WHERE m.id=$1 AND m.conversation_id=$2 AND m.deleted_at IS NULL AND (m.message_class<>'business_offer' OR m.sender_id=$3 OR EXISTS(SELECT 1 FROM recipient_inbox i WHERE i.message_id=m.id AND i.recipient_id=$3))", [replyTo, conversation, sender]);
        if (target.rowCount !== 1) throw new InvalidRequestError("reply target must be an active message in this conversation");
      }
      const recipients = await c.query<{account_id:string}>(
        "SELECT account_id FROM conversation_members WHERE conversation_id=$1 AND account_id<>$2 ORDER BY account_id",
        [conversation, sender]);
      if ((recipients.rowCount ?? recipients.rows.length) < 1) {
        throw new InvalidRequestError("conversation requires at least one recipient besides the sender");
      }
      if (messageClass === "business_offer") {
        // Business offers are single-recipient direct messages only. The consent locks
        // stay in this transaction through message + outbox insertion.
        if (recipients.rows.length !== 1) throw new ForbiddenError("business offers require one eligible direct recipient");
        const recipient = recipients.rows[0]!.account_id;
        const direct = await c.query(
          "SELECT 1 FROM direct_conversations WHERE conversation_id=$1 AND account_low=LEAST($2::text,$3::text) AND account_high=GREATEST($2::text,$3::text)",
          [conversation,sender,recipient]
        );
        if (!direct.rowCount) throw new ForbiddenError("business offer recipient is not eligible");
        // Check contact existence before reading preference state; then lock in the
        // same preference -> consent -> contact order used by consent mutations.
        const visibleContact = await c.query(
          "SELECT 1 FROM contacts WHERE account_low=LEAST($1::text,$2::text) AND account_high=GREATEST($1::text,$2::text)",
          [sender,recipient]
        );
        if (!visibleContact.rowCount) throw new ForbiddenError("business offer recipient is not eligible");
        const preference = await c.query<{enabled:boolean}>(
          "SELECT enabled FROM business_offer_preferences WHERE account_id=$1 FOR UPDATE",
          [recipient]
        );
        if (!preference.rowCount || !preference.rows[0]!.enabled) throw new ForbiddenError("business offer recipient is not eligible");
        const consent = await c.query<{status:string}>(
          "SELECT status FROM business_consent_state WHERE business_account_id=$1 AND recipient_id=$2 FOR UPDATE",
          [sender,recipient]
        );
        if (!consent.rowCount || consent.rows[0]!.status !== "granted") throw new ForbiddenError("business offer recipient is not eligible");
        const lockedContact = await c.query(
          "SELECT 1 FROM contacts WHERE account_low=LEAST($1::text,$2::text) AND account_high=GREATEST($1::text,$2::text) FOR KEY SHARE",
          [sender,recipient]
        );
        if (!lockedContact.rowCount) throw new ForbiddenError("business offer recipient is not eligible");
        if(key.startsWith("campaign:")) {
          const crmCustomer = await c.query("SELECT 1 FROM crm_customers WHERE business_account_id=$1 AND person_id=$2 AND status<>'archived' FOR SHARE",[sender,recipient]);
          if (!crmCustomer.rowCount) throw new ForbiddenError("business offer recipient is not eligible");
        }
      }
      const counter = await c.query<{last_position:string}>(
        "INSERT INTO conversation_counters(conversation_id,last_position) VALUES($1,1) ON CONFLICT(conversation_id) DO UPDATE SET last_position=conversation_counters.last_position+1 RETURNING last_position",
        [conversation]);
      const position = counter.rows[0]!.last_position;
      const id = randomUUID();
      await c.query("INSERT INTO messages(id,conversation_id,sender_id,operation_key,payload,position,reply_to_message_id,forwarded_from_message_id,message_class) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [id, conversation, sender, key, payload, position, replyTo, forwardedFrom, messageClass]);
      await c.query(
        "INSERT INTO delivery_outbox(message_id,recipient_id) SELECT $1, unnest($2::text[])",
        [id, recipients.rows.map((recipient) => recipient.account_id)]
      );
      await c.query("COMMIT");
      return {message_id:id,conversation_id:conversation,sender_id:sender,operation_key:key,payload,position,reply_to_message_id:replyTo,forwarded_from_message_id:forwardedFrom,message_class:messageClass};
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally { c.release(); }
  }

  async forward(account:string, sourceMessage:string, targetConversation:string, operationKey:string):Promise<Message> {
    if(!account || !sourceMessage || !targetConversation || !operationKey || operationKey.length>200) throw new InvalidRequestError();
    const destinationMember=await this.pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[targetConversation,account]);
    if(destinationMember.rowCount!==1) throw new NotMemberError();
    const prior=await this.pool.query<Message>("SELECT id AS message_id,conversation_id,sender_id,operation_key,payload,position,reply_to_message_id,forwarded_from_message_id FROM messages WHERE sender_id=$1 AND operation_key=$2",[account,operationKey]);
    if(prior.rowCount===1) {
      const existing=prior.rows[0]!;
      if(existing.conversation_id!==targetConversation || existing.forwarded_from_message_id!==sourceMessage) throw new ConflictError();
      return existing;
    }
    const source=await this.pool.query<{payload:string}>(
      `SELECT m.payload FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.account_id=$2
       WHERE m.id=$1 AND m.deleted_at IS NULL
         AND (m.message_class<>'business_offer' OR m.sender_id=$2 OR EXISTS(SELECT 1 FROM recipient_inbox i WHERE i.message_id=m.id AND i.recipient_id=$2))`,[sourceMessage,account]);
    if(source.rowCount!==1) throw new NotMemberError();
    return this.send(account,targetConversation,operationKey,source.rows[0]!.payload,null,sourceMessage);
  }

  async searchMessages(account:string,conversation:string,query:string,limit=20) {
    if(!account || !conversation || typeof query!=="string" || query.trim().length<2 || query.trim().length>128 || !Number.isSafeInteger(limit) || limit<1 || limit>50) {
      throw new InvalidRequestError("search query must contain 2–128 characters and limit must be 1–50");
    }
    const member=await this.pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[conversation,account]);
    if(member.rowCount!==1) throw new NotMemberError();
    const result=await this.pool.query(
      `SELECT m.id AS message_id,m.conversation_id,m.sender_id,m.payload,m.position,
              m.created_at,m.edited_at,m.reply_to_message_id,m.forwarded_from_message_id,
              ts_rank_cd(to_tsvector('simple',m.payload),plainto_tsquery('simple',$2)) AS relevance
       FROM messages m
       WHERE m.conversation_id=$1 AND m.deleted_at IS NULL
         AND (m.message_class<>'business_offer' OR m.sender_id=$4 OR EXISTS(SELECT 1 FROM recipient_inbox i WHERE i.message_id=m.id AND i.recipient_id=$4))
         AND to_tsvector('simple',m.payload) @@ plainto_tsquery('simple',$2)
       ORDER BY relevance DESC,m.position DESC
       LIMIT $3`,[conversation,query.trim(),limit,account]);
    return result.rows;
  }

  async history(account: string, conversation: string, after: number, limit=50): Promise<Message[]> {
    if (!account || !conversation || !Number.isSafeInteger(after) || after < 0 || limit < 1 || limit > 100) throw new InvalidRequestError();
    const member = await this.pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[conversation,account]);
    if (member.rowCount !== 1) throw new NotMemberError();
    const result = await this.pool.query<Message>(
      "SELECT m.id AS message_id,m.conversation_id,m.sender_id,m.operation_key,m.payload,m.position,m.reply_to_message_id,m.forwarded_from_message_id,m.edited_at,m.deleted_at FROM messages m WHERE m.conversation_id=$1 AND m.position>$2 AND (m.message_class<>'business_offer' OR m.sender_id=$4 OR EXISTS(SELECT 1 FROM recipient_inbox i WHERE i.message_id=m.id AND i.recipient_id=$4)) ORDER BY m.position LIMIT $3",
      [conversation,after,limit,account]);
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
      const lease=await c.query(
        "SELECT 1 FROM delivery_outbox WHERE id=$1 AND message_id=$2 AND recipient_id=$3 AND state='processing' AND lease_token=$4 AND lease_until>clock_timestamp() FOR UPDATE",
        [item.id,item.message_id,item.recipient_id,item.lease_token]
      );
      if(lease.rowCount!==1) throw new Error("outbox lease lost");
      const message=await c.query<{sender_id:string;conversation_id:string;message_class:string;deleted_at:Date|null;operation_key:string}>(
        "SELECT sender_id,conversation_id,message_class,deleted_at,operation_key FROM messages WHERE id=$1 FOR SHARE",
        [item.message_id]
      );
      if(message.rowCount!==1) throw new Error("outbox message missing");
      const row=message.rows[0]!;
      let cancelReason:string|null=row.deleted_at?"message_deleted_before_delivery":null;
      if(!cancelReason && row.message_class==="business_offer") {
        // Re-check at the delivery boundary. Preference -> consent -> contact is
        // the same lock order as opt-out and consent mutations.
        const preference=await c.query<{enabled:boolean}>(
          "SELECT enabled FROM business_offer_preferences WHERE account_id=$1 FOR UPDATE",
          [item.recipient_id]
        );
        if(!preference.rowCount || !preference.rows[0]!.enabled) {
          cancelReason="business_offer_preference_disabled";
        } else {
          const consent=await c.query<{status:string}>(
            "SELECT status FROM business_consent_state WHERE business_account_id=$1 AND recipient_id=$2 FOR UPDATE",
            [row.sender_id,item.recipient_id]
          );
          if(!consent.rowCount || consent.rows[0]!.status!=="granted") {
            cancelReason="business_offer_consent_revoked";
          } else {
            const contact=await c.query(
              "SELECT 1 FROM contacts WHERE account_low=LEAST($1::text,$2::text) AND account_high=GREATEST($1::text,$2::text) FOR KEY SHARE",
              [row.sender_id,item.recipient_id]
            );
            if(!contact.rowCount) cancelReason="business_offer_contact_removed";
            else {
              if(message.rows[0]!.operation_key.startsWith("campaign:")) {
                const crmCustomer=await c.query("SELECT 1 FROM crm_customers WHERE business_account_id=$1 AND person_id=$2 AND status<>'archived' FOR SHARE",[row.sender_id,item.recipient_id]);
                if(!crmCustomer.rowCount) cancelReason="business_offer_customer_archived";
              }
            }
          }
        }
      }
      if(cancelReason) {
        const cancelled=await c.query(
          "UPDATE delivery_outbox SET state='cancelled',completed_at=now(),lease_until=NULL,lease_token=NULL,last_error=$3 WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_until>clock_timestamp()",
          [item.id,item.lease_token,cancelReason]
        );
        if(cancelled.rowCount!==1) throw new Error("outbox lease lost");
        await c.query("COMMIT");
        return;
      }
      await c.query(`INSERT INTO recipient_inbox(message_id,recipient_id,conversation_id,position,folder)
        VALUES($1,$2,$3,(SELECT position FROM messages WHERE id=$1),CASE WHEN $4='business_offer' THEN 'business_offers' ELSE 'primary' END)
        ON CONFLICT(message_id,recipient_id) DO NOTHING`,
        [item.message_id,item.recipient_id,row.conversation_id,row.message_class]);
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
    const result=await this.pool.query<Message>(`SELECT m.id AS message_id,m.conversation_id,m.sender_id,m.operation_key,m.payload,m.position,m.reply_to_message_id,m.forwarded_from_message_id,m.edited_at,m.deleted_at
      FROM recipient_inbox i JOIN messages m ON m.id=i.message_id
      WHERE i.recipient_id=$1 AND i.conversation_id=$2 AND i.position>$3
      ORDER BY i.position LIMIT $4`,[account,conversation,after,limit]);
    return result.rows;
  }

  async listInbox(account:string,folder:"primary"|"business_offers",beforeCreatedAt:string|null=null,beforeMessageId:string|null=null,limit=50) {
    if(!account || !["primary","business_offers"].includes(folder) || !Number.isSafeInteger(limit) || limit<1 || limit>100 || ((beforeCreatedAt===null)!==(beforeMessageId===null))) throw new InvalidRequestError();
    if(beforeCreatedAt!==null && (!Number.isFinite(Date.parse(beforeCreatedAt)) || !beforeMessageId || beforeMessageId.length>128)) throw new InvalidRequestError();
    const result=await this.pool.query(`SELECT m.id AS message_id,m.conversation_id,m.sender_id,m.payload,m.position,m.created_at,m.edited_at,m.deleted_at,m.reply_to_message_id,m.forwarded_from_message_id,i.folder FROM recipient_inbox i JOIN messages m ON m.id=i.message_id WHERE i.recipient_id=$1 AND i.folder=$2 AND ($3::timestamptz IS NULL OR (m.created_at,m.id)<($3::timestamptz,$4::text)) ORDER BY m.created_at DESC,m.id DESC LIMIT $5`,[account,folder,beforeCreatedAt,beforeMessageId,limit]);
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
      // A delete-for-everyone tombstone must not leave recoverable message text in version history.
      await c.query("DELETE FROM message_versions WHERE message_id=$1",[message]);
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
      await c.query("DELETE FROM conversation_pins WHERE conversation_id=$1 AND message_id=$2",[row.conversation_id,message]);
      await c.query("COMMIT");
    } catch(e) { await c.query("ROLLBACK"); throw e; }
    finally { c.release(); }
  }

  async pinMessage(account:string,conversation:string,message:string) {
    if(!account || !conversation || !message) throw new InvalidRequestError();
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",[ "pins:"+conversation ]);
      const member=await c.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[conversation,account]);
      if(member.rowCount!==1) throw new NotMemberError();
      const target=await c.query("SELECT 1 FROM messages m WHERE m.id=$1 AND m.conversation_id=$2 AND m.deleted_at IS NULL AND (m.message_class<>'business_offer' OR m.sender_id=$3 OR EXISTS(SELECT 1 FROM recipient_inbox i WHERE i.message_id=m.id AND i.recipient_id=$3)) FOR UPDATE",[message,conversation,account]);
      if(target.rowCount!==1) throw new InvalidRequestError("only active messages in this conversation can be pinned");
      const count=await c.query<{n:number}>("SELECT count(*)::int AS n FROM conversation_pins WHERE conversation_id=$1",[conversation]);
      const exists=await c.query("SELECT 1 FROM conversation_pins WHERE conversation_id=$1 AND message_id=$2",[conversation,message]);
      if(exists.rowCount===0 && count.rows[0]!.n>=50) throw new InvalidRequestError("a conversation can have at most 50 pinned messages");
      const result=await c.query(
        "INSERT INTO conversation_pins(conversation_id,message_id,pinned_by) VALUES($1,$2,$3) ON CONFLICT(conversation_id,message_id) DO UPDATE SET message_id=EXCLUDED.message_id RETURNING conversation_id,message_id,pinned_by,created_at",
        [conversation,message,account]);
      await c.query("COMMIT");
      return result.rows[0];
    } catch(e) { await c.query("ROLLBACK"); throw e; }
    finally { c.release(); }
  }

  async unpinMessage(account:string,conversation:string,message:string):Promise<void> {
    if(!account || !conversation || !message) throw new InvalidRequestError();
    const member=await this.pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[conversation,account]);
    if(member.rowCount!==1) throw new NotMemberError();
    await this.pool.query("DELETE FROM conversation_pins WHERE conversation_id=$1 AND message_id=$2",[conversation,message]);
  }

  async pinnedMessages(account:string,conversation:string) {
    if(!account || !conversation) throw new InvalidRequestError();
    const member=await this.pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[conversation,account]);
    if(member.rowCount!==1) throw new NotMemberError();
    const result=await this.pool.query(
      `SELECT p.conversation_id,p.message_id,p.pinned_by,p.created_at,
              m.sender_id,m.payload,m.position,m.reply_to_message_id,m.forwarded_from_message_id
       FROM conversation_pins p JOIN messages m ON m.id=p.message_id
       WHERE p.conversation_id=$1 AND (m.message_class<>'business_offer' OR m.sender_id=$2 OR EXISTS(SELECT 1 FROM recipient_inbox i WHERE i.message_id=m.id AND i.recipient_id=$2)) ORDER BY p.created_at DESC,p.message_id`,[conversation,account]);
    return result.rows;
  }

  async events(account:string,conversation:string,after:number,limit=100) {
    if(!account || !conversation || !Number.isSafeInteger(after) || after<0 || limit<1 || limit>200) throw new InvalidRequestError();
    const member=await this.pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[conversation,account]);
    if(member.rowCount!==1) throw new NotMemberError();
    const result=await this.pool.query(
      `SELECT e.id AS event_id,e.event_type,e.message_id,e.payload,e.created_at
       FROM conversation_event_log e JOIN messages m ON m.id=e.message_id
       WHERE e.recipient_id=$1 AND e.conversation_id=$2 AND e.id>$3
         AND (m.message_class<>'business_offer' OR m.sender_id=$1 OR EXISTS(SELECT 1 FROM recipient_inbox i WHERE i.message_id=m.id AND i.recipient_id=$1))
       ORDER BY e.id LIMIT $4`,
      [account,conversation,after,limit]
    );
    return result.rows;
  }

  async addReaction(account:string,message:string,emojiInput:string):Promise<void> {
    const emoji=emojiInput.trim();
    const length=Array.from(emoji).length;
    if(!account || !message || length<1 || length>8 || /[\\u0000-\\u001f\\u007f]/u.test(emoji)) throw new InvalidRequestError();
    const member=await this.pool.query(
      "SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id WHERE m.id=$1 AND cm.account_id=$2 AND (m.message_class<>'business_offer' OR m.sender_id=$2 OR EXISTS(SELECT 1 FROM recipient_inbox i WHERE i.message_id=m.id AND i.recipient_id=$2))",
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
      "SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id WHERE m.id=$1 AND cm.account_id=$2 AND (m.message_class<>'business_offer' OR m.sender_id=$2 OR EXISTS(SELECT 1 FROM recipient_inbox i WHERE i.message_id=m.id AND i.recipient_id=$2))",
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
       WHERE r.message_id=$1 AND (m.message_class<>'business_offer' OR m.sender_id=$2 OR EXISTS(SELECT 1 FROM recipient_inbox i WHERE i.message_id=m.id AND i.recipient_id=$2)) GROUP BY r.emoji ORDER BY r.emoji`,
      [message,account]
    );
    const member=await this.pool.query(
      "SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id WHERE m.id=$1 AND cm.account_id=$2 AND (m.message_class<>'business_offer' OR m.sender_id=$2 OR EXISTS(SELECT 1 FROM recipient_inbox i WHERE i.message_id=m.id AND i.recipient_id=$2))",
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
