import { createHash, randomBytes } from "node:crypto";
import type { Pool as PoolType } from "pg";

export type ChannelVisibility = "public" | "private";
export type ChannelSearchResult = {
  conversation_id:string; slug:string; title:string; description:string;
  visibility:ChannelVisibility; subscribers:number;
};
export class ChannelError extends Error {
  constructor(readonly code:"invalid"|"not_found"|"exists"|"forbidden") { super(code); }
}
const digest = (value:string) => createHash("sha256").update(value).digest("hex");

export class ChannelsStore {
  constructor(readonly pool:PoolType) {}

  async create(accountId:string,titleInput:string,slugInput:string,visibilityInput:string,descriptionInput=""):
    Promise<{conversation_id:string;slug:string;title:string;visibility:ChannelVisibility;description:string;invite_code:string|null}> {
    const title=titleInput.trim();
    const slug=slugInput.trim().toLowerCase();
    const description=descriptionInput.trim();
    if(!accountId || title.length<1 || title.length>80 ||
       !/^[a-z0-9_]{3,32}$/.test(slug) ||
       (visibilityInput!=="public" && visibilityInput!=="private") ||
       description.length>300) throw new ChannelError("invalid");
    const visibility=visibilityInput as ChannelVisibility;
    const inviteCode=visibility==="private" ? randomBytes(24).toString("base64url") : null;
    const inviteHash=inviteCode ? digest(inviteCode) : null;
    const conversationId=randomBytes(16).toString("hex");
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("INSERT INTO conversations(id) VALUES($1)",[conversationId]);
      await c.query("INSERT INTO conversation_details(conversation_id,kind,title,created_by) VALUES($1,'channel',$2,$3)",
        [conversationId,title,accountId]);
      await c.query("INSERT INTO channel_metadata(conversation_id,slug,visibility,description,invite_code_hash) VALUES($1,$2,$3,$4,$5)",
        [conversationId,slug,visibility,description,inviteHash]);
      await c.query("INSERT INTO conversation_members(conversation_id,account_id,role) VALUES($1,$2,'owner')",
        [conversationId,accountId]);
      await c.query("COMMIT");
      return {conversation_id:conversationId,slug,title,visibility,description,invite_code:inviteCode};
    } catch(error) {
      await c.query("ROLLBACK");
      if(typeof error==="object" && error!==null && "code" in error && error.code==="23505") throw new ChannelError("exists");
      throw error;
    } finally { c.release(); }
  }

  async search(queryInput:string):Promise<ChannelSearchResult[]> {
    const q=queryInput.trim().toLowerCase();
    if(q.length<2 || q.length>32) throw new ChannelError("invalid");
    const result=await this.pool.query<ChannelSearchResult>(
      "SELECT d.conversation_id,m.slug,d.title,m.description,m.visibility,"+
      "(SELECT count(*)::int FROM conversation_members cm WHERE cm.conversation_id=d.conversation_id) AS subscribers "+
      "FROM channel_metadata m JOIN conversation_details d ON d.conversation_id=m.conversation_id "+
      "WHERE m.visibility='public' AND (left(m.slug,char_length($1))=$1 OR left(lower(d.title),char_length($1))=$1) "+
      "ORDER BY CASE WHEN m.slug=$1 THEN 0 ELSE 1 END,m.slug LIMIT 20",
      [q]
    );
    return result.rows;
  }

  async leave(accountId:string,slugInput:string):Promise<void> {
    const slug=slugInput.trim().toLowerCase();
    if(!accountId || !/^[a-z0-9_]{3,32}$/.test(slug)) throw new ChannelError("invalid");
    const channel=await this.pool.query<{conversation_id:string}>(
      "SELECT conversation_id FROM channel_metadata WHERE slug=$1",[slug]
    );
    const conversationId=channel.rows[0]?.conversation_id;
    if(!conversationId) throw new ChannelError("not_found");
    const membership=await this.pool.query<{role:string}>(
      "SELECT role FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",
      [conversationId,accountId]
    );
    if(!membership.rowCount) throw new ChannelError("not_found");
    if(membership.rows[0]!.role==="owner") throw new ChannelError("forbidden");
    await this.pool.query("DELETE FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",
      [conversationId,accountId]);
  }

  async addAdmin(accountId:string,slugInput:string,usernameInput:string):Promise<void> {
    const slug=slugInput.trim().toLowerCase();
    const username=usernameInput.trim().toLowerCase();
    if(!/^[a-z0-9_]{3,32}$/.test(slug) || !/^[a-z0-9_]{3,24}$/.test(username)) throw new ChannelError("invalid");
    const channel=await this.pool.query<{conversation_id:string;created_by:string}>(
      "SELECT d.conversation_id,d.created_by FROM channel_metadata m JOIN conversation_details d ON d.conversation_id=m.conversation_id WHERE m.slug=$1",
      [slug]
    );
    const row=channel.rows[0];
    if(!row) throw new ChannelError("not_found");
    if(row.created_by!==accountId) throw new ChannelError("forbidden");
    const target=await this.pool.query<{id:string}>("SELECT id FROM accounts WHERE username=$1",[username]);
    if(!target.rowCount) throw new ChannelError("not_found");
    const membership=await this.pool.query<{role:string}>(
      "SELECT role FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",
      [row.conversation_id,target.rows[0]!.id]
    );
    if(!membership.rowCount) throw new ChannelError("not_found");
    if(membership.rows[0]!.role==="owner") throw new ChannelError("forbidden");
    if(membership.rows[0]!.role==="admin") return;
    await this.pool.query(
      "UPDATE conversation_members SET role='admin' WHERE conversation_id=$1 AND account_id=$2",
      [row.conversation_id,target.rows[0]!.id]
    );
  }

  async join(accountId:string,slugInput:string,inviteCodeInput=""):
    Promise<{conversation_id:string;slug:string;title:string;visibility:ChannelVisibility;role:"owner"|"admin"|"subscriber"}> {
    const slug=slugInput.trim().toLowerCase();
    if(!accountId || !/^[a-z0-9_]{3,32}$/.test(slug)) throw new ChannelError("invalid");
    const found=await this.pool.query<{
      conversation_id:string;slug:string;title:string;visibility:ChannelVisibility;invite_code_hash:string|null;
    }>(
      "SELECT m.conversation_id,m.slug,d.title,m.visibility,m.invite_code_hash "+
      "FROM channel_metadata m JOIN conversation_details d ON d.conversation_id=m.conversation_id WHERE m.slug=$1",
      [slug]
    );
    const channel=found.rows[0];
    if(!channel) throw new ChannelError("not_found");
    if(channel.visibility==="private" && (!inviteCodeInput || !channel.invite_code_hash ||
       digest(inviteCodeInput)!==channel.invite_code_hash)) throw new ChannelError("not_found");
    await this.pool.query(
      "INSERT INTO conversation_members(conversation_id,account_id,role) VALUES($1,$2,'subscriber') ON CONFLICT(conversation_id,account_id) DO UPDATE SET role=CASE WHEN conversation_members.role='member' THEN 'subscriber' ELSE conversation_members.role END",
      [channel.conversation_id,accountId]
    );
    const membership=await this.pool.query<{role:string}>(
      "SELECT role FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",
      [channel.conversation_id,accountId]
    );
    return {conversation_id:channel.conversation_id,slug:channel.slug,title:channel.title,visibility:channel.visibility,role:membership.rows[0]!.role as "owner"|"admin"|"subscriber"};
  }
}
