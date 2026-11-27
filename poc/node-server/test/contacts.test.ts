import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
const { Pool } = pg;
import { ContactsStore, ContactError } from "../src/contacts.js";
import { Store } from "../src/store.js";

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const contacts = new ContactsStore(pool);
const alice = randomUUID();
const bob = randomUUID();
const carol = randomUUID();
const dave = randomUUID();

before(async () => {
  const schema = await readFile(new URL("../schema.sql", import.meta.url), "utf8");
  for (const statement of schema.split(";").map(s => s.trim()).filter(Boolean)) await pool.query(statement);
  await pool.query("TRUNCATE contact_requests,contacts,direct_conversations,delivery_receipts,recipient_inbox,delivery_outbox,messages,conversation_counters,conversation_members,conversations,sessions,accounts CASCADE");
  await pool.query(
    "INSERT INTO accounts(id,username,password_hash,display_name) VALUES($1,'alice','test-hash','Alice Example'),($2,'bob','test-hash','Bob Example'),($3,'carol','test-hash','Carol Example'),($4,'dave','test-hash','Dave Example')",
    [alice,bob,carol,dave]
  );
});
after(async () => pool.end());

test("user search, contact request, acceptance and direct conversation lifecycle", async () => {
  const search = await contacts.search(alice, "bo");
  assert.deepEqual(search.map(user => user.username), ["bob"]);
  await assert.rejects(() => contacts.search(alice, "b"), error => error instanceof ContactError && error.code === "invalid");

  const request = await contacts.request(alice, "BOB");
  assert.equal(request.requester_id, alice);
  assert.equal(request.recipient_id, bob);
  const incoming = await contacts.requests(bob);
  assert.equal(incoming.incoming.length, 1);
  assert.equal(incoming.outgoing.length, 0);
  await assert.rejects(() => contacts.request(bob, "alice"), error => error instanceof ContactError && error.code === "reverse_pending");
  await assert.rejects(() => contacts.accept(alice, request.id), error => error instanceof ContactError && error.code === "not_recipient");

  const accepted = await contacts.accept(bob, request.id);
  assert.equal(accepted.contact.id, alice);
  assert.ok(accepted.conversation_id);
  assert.deepEqual((await contacts.list(alice)).map(user => user.id), [bob]);
  assert.deepEqual((await contacts.list(bob)).map(user => user.id), [alice]);
  assert.equal(await contacts.directConversation(alice, "bob"), accepted.conversation_id);
  assert.equal(await contacts.directConversation(bob, "alice"), accepted.conversation_id);

  const members = await pool.query(
    "SELECT account_id FROM conversation_members WHERE conversation_id=$1 ORDER BY account_id",
    [accepted.conversation_id]
  );
  assert.deepEqual(members.rows.map(row => row.account_id), [alice,bob].sort());
  await new Store(pool).send(alice, accepted.conversation_id, "inbox-preview-1", "Hello from Alice");
  const inbox = await contacts.conversations(bob);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0]!.conversation_id, accepted.conversation_id);
  const peer = inbox[0]!.peer;\n  assert.ok(peer);\n  assert.equal(peer.username, "alice");
  assert.equal(inbox[0]!.last_message, "Hello from Alice");
  assert.equal(inbox[0]!.last_position, "1");

  const carolRequest = await contacts.request(alice, "carol");
  await contacts.accept(carol, carolRequest.id);
  const group = await contacts.createGroup(alice, "Project team", ["bob","carol"]);
  assert.equal(group.title, "Project team");
  assert.equal(group.members_count, 3);
  await assert.rejects(
    () => contacts.createGroup(alice, "Not allowed", ["dave"]),
    error => error instanceof ContactError && error.code === "not_found"
  );
  const groupMessage = await new Store(pool).send(alice, group.conversation_id, "group-message-1", "Hello team");
  const groupMembers = await pool.query(
    "SELECT account_id FROM conversation_members WHERE conversation_id=$1 ORDER BY account_id",
    [group.conversation_id]
  );
  assert.deepEqual(groupMembers.rows.map(row => row.account_id), [alice,bob,carol].sort());
  const conversations = await contacts.conversations(alice);
  const groupEntry = conversations.find(row => row.conversation_id === group.conversation_id);
  assert.equal(groupEntry?.kind, "group");
  assert.equal(groupEntry?.title, "Project team");
  assert.equal(groupEntry?.peer, null);
  assert.equal(groupEntry?.members_count, 3);
  const pendingDeliveries = await new Store(pool).claim(20,5000);
  for (const item of pendingDeliveries) await new Store(pool).dispatch(item);
  assert.ok((await new Store(pool).inbox(bob,group.conversation_id,0)).some(row => row.message_id === groupMessage.message_id));
  assert.ok((await new Store(pool).inbox(carol,group.conversation_id,0)).some(row => row.message_id === groupMessage.message_id));
  await assert.rejects(() => contacts.request(alice, "bob"), error => error instanceof ContactError && error.code === "already_contact");
  await assert.rejects(() => contacts.directConversation(carol, "alice"), error => error instanceof ContactError && error.code === "not_found");

  const reciprocal = await Promise.allSettled([
    contacts.request(carol, "dave"),
    contacts.request(dave, "carol")
  ]);
  assert.equal(reciprocal.filter(result => result.status === "fulfilled").length, 1);
  const rejected = reciprocal.find(result => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(rejected.reason instanceof ContactError && rejected.reason.code === "reverse_pending");
  const pendingRequest = reciprocal.find(result => result.status === "fulfilled");
  assert.ok(pendingRequest && pendingRequest.status === "fulfilled");
  await assert.rejects(
    () => contacts.decline(pendingRequest.value.requester_id, pendingRequest.value.id),
    error => error instanceof ContactError && error.code === "not_recipient"
  );
  await contacts.decline(pendingRequest.value.recipient_id, pendingRequest.value.id);
  assert.equal((await contacts.requests(pendingRequest.value.requester_id)).outgoing.length, 0);
  assert.equal((await contacts.requests(pendingRequest.value.recipient_id)).incoming.length, 0);
});
