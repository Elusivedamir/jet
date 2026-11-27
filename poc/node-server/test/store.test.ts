import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { Store, ConflictError, NotMemberError } from "../src/store.js";

const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
const store=new Store(pool);
before(async()=>{
 const schema=await readFile(new URL("../schema.sql",import.meta.url),"utf8");
 for(const statement of schema.split(";").map(s=>s.trim()).filter(Boolean)) await pool.query(statement);
 await pool.query("TRUNCATE delivery_receipts,recipient_inbox,delivery_outbox,messages,conversation_counters,conversation_members,conversations CASCADE");
 await pool.query("INSERT INTO conversations(id) VALUES('room-a'),('room-b')");
 await pool.query("INSERT INTO conversation_members(conversation_id,account_id) VALUES('room-a','alice'),('room-a','bob'),('room-b','alice'),('room-b','carol')");
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
 await store.send("alice","room-a","lease","fenced");
 const first=await store.claim(1,1000);
 assert.equal(first.length,1);
 await pool.query("UPDATE delivery_outbox SET lease_until=now()-interval '1 second' WHERE id=$1",[first[0].id]);
 const second=await store.claim(1,1000);
 assert.equal(second.length,1);
 assert.notEqual(first[0].lease_token,second[0].lease_token);
 await assert.rejects(()=>store.dispatch(first[0]),/lease lost/);
 const inboxCount=await pool.query("SELECT count(*)::int AS n FROM recipient_inbox");
 assert.equal(inboxCount.rows[0]!.n,0);
 await store.dispatch(second[0]);
});
