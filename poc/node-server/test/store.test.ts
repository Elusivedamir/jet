import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
const { Pool } = pg;
import { Store, ConflictError, NotMemberError, ForbiddenError, InvalidRequestError } from "../src/store.js";

const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
const store=new Store(pool);
before(async()=>{
 const schema=await readFile(new URL("../schema.sql",import.meta.url),"utf8");
 for(const statement of schema.split(";").map(s=>s.trim()).filter(Boolean)) await pool.query(statement);
 await pool.query("TRUNCATE delivery_receipts,recipient_inbox,delivery_outbox,messages,conversation_counters,conversation_members,conversations CASCADE");
 await pool.query("INSERT INTO conversations(id) VALUES('room-a'),('room-b'),('room-group')");
 await pool.query("INSERT INTO conversation_members(conversation_id,account_id) VALUES('room-a','alice'),('room-a','bob'),('room-b','alice'),('room-b','carol'),('room-group','alice'),('room-group','bob'),('room-group','carol')");
});
after(async()=>pool.end());

test("send is idempotent and creates one outbox intent",async()=>{
 const first=await store.send("alice","room-a","op-1","hello");
 const retry=await store.send("alice","room-a","op-1","hello");
 assert.equal(first.message_id,retry.message_id);
 const count=await pool.query("SELECT count(*)::int AS n FROM delivery_outbox");
 assert.equal(count.rows[0]!.n,1);
});
test("operation key conflicts across payload or conversation",async()=>{
 await store.send("alice","room-a","op-2","original");
 await assert.rejects(()=>store.send("alice","room-a","op-2","changed"),ConflictError);
 await assert.rejects(()=>store.send("alice","room-b","op-2","original"),ConflictError);
});
test("concurrent retries create one logical message",async()=>{
 const results=await Promise.all(Array.from({length:12},()=>store.send("alice","room-a","parallel","same")));
 assert.equal(new Set(results.map(x=>x.message_id)).size,1);
});
test("history and inbox are account scoped",async()=>{
 await store.send("alice","room-a","history","private");
 await assert.rejects(()=>store.history("mallory","room-a",0),NotMemberError);
 const items=await store.claim();
 assert.ok(items.length>0);
 for(const item of items) await store.dispatch(item);
 const inbox=await store.inbox("bob","room-a",0);
 assert.ok(inbox.some(x=>x.operation_key==="history"));
 await store.acknowledge("bob",inbox.find(x=>x.operation_key==="history")!.message_id);
 await assert.rejects(()=>store.acknowledge("mallory",inbox[0]!.message_id),NotMemberError);
});

test("expired outbox lease is reclaimed and stale worker is fenced",async()=>{
 const sent=await store.send("alice","room-a","lease","fenced");
 const first=await store.claim(1,1000);
 assert.equal(first.length,1);
 await pool.query("UPDATE delivery_outbox SET lease_until=now()-interval '1 second' WHERE id=$1",[first[0].id]);
 const second=await store.claim(1,1000);
 assert.equal(second.length,1);
 assert.notEqual(first[0].lease_token,second[0].lease_token);
 await assert.rejects(()=>store.dispatch(first[0]),/lease lost/);
 const inboxCount=await pool.query("SELECT count(*)::int AS n FROM recipient_inbox WHERE message_id=$1",[sent.message_id]);
 assert.equal(inboxCount.rows[0]!.n,0);
 await store.dispatch(second[0]);
});


test("expired lease cannot dispatch or retry before another worker reclaims",async()=>{
 const sent=await store.send("alice","room-a","lease-expired","expired");
 const [item]=await store.claim(1,1000);
 assert.ok(item);
 await pool.query("UPDATE delivery_outbox SET lease_until=now()-interval '1 second' WHERE id=$1",[item.id]);
 await assert.rejects(()=>store.dispatch(item),/lease lost/);
 await assert.rejects(()=>store.retry(item,new Error("late failure")),/lease lost/);
 const inbox=await pool.query("SELECT count(*)::int AS n FROM recipient_inbox WHERE message_id=$1",[sent.message_id]);
 assert.equal(inbox.rows[0]!.n,0);
});


test("parallel workers claim distinct outbox rows and max attempts terminate",async()=>{
 for(let i=0;i<10;i++) await store.send("alice","room-a",`parallel-claim-${i}`,"payload");
 const claims=await Promise.all(Array.from({length:5},()=>store.claim(2,5000)));
 const items=claims.flat();
 assert.equal(items.length,10);
 assert.equal(new Set(items.map(x=>x.id)).size,10);
 const terminal=items[0]!;
 terminal.attempt_count=8;
 await store.retry(terminal,new Error("final injected failure"));
 const state=await pool.query("SELECT state FROM delivery_outbox WHERE id=$1",[terminal.id]);
 assert.equal(state.rows[0]!.state,"terminal_failure");
});


test("outbox insert failure rolls back message and sequence atomically",async()=>{
 const before=await pool.query("SELECT coalesce((SELECT last_position FROM conversation_counters WHERE conversation_id='room-a'),0)::bigint AS n");
 await pool.query(`CREATE OR REPLACE FUNCTION reject_delivery_outbox() RETURNS trigger
   LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected outbox failure'; END; $$`);
 await pool.query("CREATE TRIGGER reject_delivery_outbox_trigger BEFORE INSERT ON delivery_outbox FOR EACH ROW EXECUTE FUNCTION reject_delivery_outbox()");
 try {
   await assert.rejects(()=>store.send("alice","room-a","rollback-op","must rollback"));
   const message=await pool.query("SELECT count(*)::int AS n FROM messages WHERE sender_id='alice' AND operation_key='rollback-op'");
   const outbox=await pool.query("SELECT count(*)::int AS n FROM delivery_outbox o JOIN messages m ON m.id=o.message_id WHERE m.sender_id='alice' AND m.operation_key='rollback-op'");
   const after=await pool.query("SELECT coalesce((SELECT last_position FROM conversation_counters WHERE conversation_id='room-a'),0)::bigint AS n");
   assert.equal(message.rows[0]!.n,0);
   assert.equal(outbox.rows[0]!.n,0);
   assert.equal(after.rows[0]!.n,before.rows[0]!.n);
 } finally {
   await pool.query("DROP TRIGGER IF EXISTS reject_delivery_outbox_trigger ON delivery_outbox");
   await pool.query("DROP FUNCTION IF EXISTS reject_delivery_outbox()");
 }
});


test("reactions are member-scoped and read receipts distinguish delivery from reading",async()=>{
 const sent=await store.send("alice","room-a","reaction-read","hello");
 await store.addReaction("bob",sent.message_id,"👍");
 await store.addReaction("alice",sent.message_id,"👍");
 await store.addReaction("bob",sent.message_id,"❤️");
 await store.addReaction("bob",sent.message_id,"👍");
 assert.deepEqual(await store.listReactions("alice",sent.message_id),[
  {emoji:"❤️",count:1,reacted:false},
  {emoji:"👍",count:2,reacted:true}
 ]);
 await assert.rejects(()=>store.addReaction("mallory",sent.message_id,"👍"),NotMemberError);
 await store.removeReaction("bob",sent.message_id,"❤️");
 assert.deepEqual(await store.listReactions("bob",sent.message_id),[
  {emoji:"👍",count:2,reacted:true}
 ]);
 const claimed=await store.claim(200,5000);
 const delivery=claimed.find(item=>item.message_id===sent.message_id);
 assert.ok(delivery);
 await store.dispatch(delivery);
 const beforeRead=await store.readReceipts("alice",sent.message_id);
 assert.equal(beforeRead.length,1);
 assert.equal(beforeRead[0]!.delivered,true);
 assert.equal(beforeRead[0]!.read_at,null);
 await store.markRead("bob",sent.message_id);
 await store.markRead("bob",sent.message_id);
 const afterRead=await store.readReceipts("alice",sent.message_id);
 assert.equal(afterRead[0]!.read_at!==null,true);
 await assert.rejects(()=>store.readReceipts("bob",sent.message_id),NotMemberError);
 await assert.rejects(()=>store.markRead("mallory",sent.message_id),NotMemberError);
});

test("sender can edit and delete within the edit window; updates are durable for every member",async()=>{
 const sent=await store.send("alice","room-a","edit-delete","original");
 const edited=await store.editMessage("alice",sent.message_id,"corrected");
 assert.equal(edited.payload,"corrected");
 assert.ok(edited.edited_at);
 await assert.rejects(()=>store.editMessage("bob",sent.message_id,"hijack"),ForbiddenError);
 const aliceEvents=await store.events("alice","room-a",0);
 const bobEvents=await store.events("bob","room-a",0);
 assert.equal(aliceEvents.length,1);
 assert.equal(bobEvents.length,1);
 assert.equal(aliceEvents[0]!.event_type,"message.edited");
 assert.equal(bobEvents[0]!.payload.payload,"corrected");
 const history=await store.history("bob","room-a",0);
 assert.equal(history.find(row=>row.message_id===sent.message_id)?.payload,"corrected");
 await store.deleteMessage("alice",sent.message_id);
 await assert.rejects(()=>store.editMessage("alice",sent.message_id,"after delete"),InvalidRequestError);
 await assert.rejects(()=>store.deleteMessage("bob",sent.message_id),ForbiddenError);
 const deleted=await store.history("bob","room-a",0);
 const deletedMessage=deleted.find(row=>row.message_id===sent.message_id)!;
 assert.equal(deletedMessage.payload,"");
 assert.ok(deletedMessage.deleted_at);
 const updatedEvents=await store.events("bob","room-a",Number(bobEvents[0]!.event_id));
 assert.equal(updatedEvents.length,1);
 assert.equal(updatedEvents[0]!.event_type,"message.deleted");
 const versions=await pool.query("SELECT previous_payload FROM message_versions WHERE message_id=$1 ORDER BY id",[sent.message_id]);
 assert.deepEqual(versions.rows.map(row=>row.previous_payload),["original","corrected"]);
});

test("message edit and delete windows are enforced using database time",async()=>{
 const sent=await store.send("alice","room-a","edit-expired","old");
 await pool.query("UPDATE messages SET created_at=now()-interval '16 minutes' WHERE id=$1",[sent.message_id]);
 await assert.rejects(()=>store.editMessage("alice",sent.message_id,"too late"),InvalidRequestError);
 await assert.rejects(()=>store.deleteMessage("alice",sent.message_id),InvalidRequestError);
});


test("replies stay within one conversation and preserve idempotent reply metadata",async()=>{
 const target=await store.send("alice","room-a","reply-target","original message");
 const reply=await store.send("bob","room-a","reply-op","answer",target.message_id);
 assert.equal(reply.reply_to_message_id,target.message_id);
 const retry=await store.send("bob","room-a","reply-op","answer",target.message_id);
 assert.equal(retry.message_id,reply.message_id);
 const otherRoom=await store.send("alice","room-b","reply-other-room","other conversation");
 await assert.rejects(()=>store.send("bob","room-a","reply-cross","invalid",otherRoom.message_id),InvalidRequestError);
 await assert.rejects(()=>store.send("bob","room-a","reply-op","different answer",target.message_id),ConflictError);
 const history=await store.history("bob","room-a",0);
 assert.equal(history.find(row=>row.message_id===reply.message_id)?.reply_to_message_id,target.message_id);
 const deliveries=await store.claim(100,5000);
 for(const item of deliveries) await store.dispatch(item);
 const inbox=await store.inbox("alice","room-a",0);
 assert.equal(inbox.find(row=>row.message_id===reply.message_id)?.reply_to_message_id,target.message_id);
});

test("group message creates one durable delivery per other member",async()=>{
 const sent=await store.send("alice","room-group","group-1","hello group");
 const outbox=await pool.query("SELECT recipient_id FROM delivery_outbox WHERE message_id=$1 ORDER BY recipient_id",[sent.message_id]);
 assert.deepEqual(outbox.rows.map((row)=>row.recipient_id),["bob","carol"]);
 const items=await store.claim(10,5000);
 const groupItems=items.filter((item)=>item.message_id===sent.message_id);
 assert.equal(groupItems.length,2);
 for(const item of groupItems) await store.dispatch(item);
 const bob=await store.inbox("bob","room-group",0);
 const carol=await store.inbox("carol","room-group",0);
 assert.ok(bob.some((message)=>message.message_id===sent.message_id));
 assert.ok(carol.some((message)=>message.message_id===sent.message_id));
});


test("forwarding creates a new sender-owned message and is idempotent",async()=>{
 const source=await store.send("bob","room-a","forward-source","source text");
 const forwarded=await store.forward("alice",source.message_id,"room-b","forward-op");
 assert.equal(forwarded.sender_id,"alice");
 assert.equal(forwarded.payload,"source text");
 assert.equal(forwarded.forwarded_from_message_id,source.message_id);
 const retry=await store.forward("alice",source.message_id,"room-b","forward-op");
 assert.equal(retry.message_id,forwarded.message_id);
 await assert.rejects(()=>store.forward("alice",source.message_id,"room-a","forward-op"),ConflictError);
 const other=await store.send("bob","room-a","forward-other","private to room-a");
 await assert.rejects(()=>store.forward("carol",other.message_id,"room-b","forward-denied"),NotMemberError);
 await assert.rejects(()=>store.forward("alice",source.message_id,"room-a","forward-not-member"),NotMemberError);
 const history=await store.history("carol","room-b",0);
 assert.equal(history.find(row=>row.message_id===forwarded.message_id)?.forwarded_from_message_id,source.message_id);
});

test("conversation pins are member-scoped, bounded and cleared on message deletion",async()=>{
 const message=await store.send("alice","room-a","pin-target","important");
 const pin=await store.pinMessage("bob","room-a",message.message_id);
 assert.equal(pin.pinned_by,"bob");
 await store.pinMessage("alice","room-a",message.message_id);
 const pins=await store.pinnedMessages("alice","room-a");
 assert.equal(pins.length,1);
 assert.equal(pins[0]!.message_id,message.message_id);
 await assert.rejects(()=>store.pinnedMessages("mallory","room-a"),NotMemberError);
 await assert.rejects(()=>store.pinMessage("carol","room-a",message.message_id),NotMemberError);
 const other=await store.send("alice","room-b","pin-other-room","wrong room");
 await assert.rejects(()=>store.pinMessage("bob","room-a",other.message_id),InvalidRequestError);
 await store.deleteMessage("alice",message.message_id);
 assert.equal((await store.pinnedMessages("bob","room-a")).length,0);
 await store.unpinMessage("bob","room-a",message.message_id);
});
