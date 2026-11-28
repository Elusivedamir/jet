import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
const { Pool } = pg;
import { CrmStore, CrmError } from "../src/crm.js";

const pool = new Pool({connectionString:process.env.TEST_DATABASE_URL});
const crm = new CrmStore(pool);
const business = randomUUID();
const customer = randomUUID();
const outsider = randomUUID();
const conversation = randomUUID();

before(async () => {
  const schema = await readFile(new URL("../schema.sql",import.meta.url),"utf8");
  for (const statement of schema.split(";").map(s=>s.trim()).filter(Boolean)) await pool.query(statement);
  await pool.query("TRUNCATE crm_notes,crm_customers,contacts,direct_conversations,conversation_details,conversation_members,conversations,sessions,accounts CASCADE");
  await pool.query(
    "INSERT INTO accounts(id,username,password_hash,display_name) VALUES($1,'business','test-hash','Business Owner'),($2,'customer','test-hash','Customer One'),($3,'outsider','test-hash','Outside User')",
    [business,customer,outsider]
  );
  const [low,high] = [business,customer].sort();
  await pool.query("INSERT INTO contacts(account_low,account_high) VALUES($1,$2)",[low,high]);
  await pool.query("INSERT INTO conversations(id) VALUES($1)",[conversation]);
  await pool.query("INSERT INTO direct_conversations(account_low,account_high,conversation_id) VALUES($1,$2,$3)",[low,high,conversation]);
});
after(async () => pool.end());

test("CRM customer cards are restricted to accepted contacts and scoped to the business account", async () => {
  const card = await crm.createCustomer(business,"CUSTOMER");
  assert.equal(card.person_id,customer);
  assert.equal(card.username,"customer");
  assert.equal(card.display_name,"Customer One");
  assert.equal(card.status,"new");
  assert.equal(card.conversation_id,conversation);

  const repeated = await crm.createCustomer(business,"customer");
  assert.equal(repeated.id,card.id);
  assert.equal((await crm.listCustomers(business)).length,1);
  assert.deepEqual(await crm.listCustomers(outsider),[]);
  await assert.rejects(
    () => crm.createCustomer(business,"outsider"),
    error => error instanceof CrmError && error.code==="not_found"
  );
  await assert.rejects(
    () => crm.createCustomer(business,"business"),
    error => error instanceof CrmError && error.code==="not_found"
  );
});

test("CRM status changes and notes are owner-scoped and validated", async () => {
  const card = await crm.createCustomer(business,"customer");
  const updated = await crm.updateStatus(business,card.id,"follow_up");
  assert.equal(updated.status,"follow_up");
  await assert.rejects(
    () => crm.updateStatus(outsider,card.id,"customer"),
    error => error instanceof CrmError && error.code==="not_found"
  );
  await assert.rejects(
    () => crm.updateStatus(business,card.id,"made_up"),
    error => error instanceof CrmError && error.code==="invalid"
  );

  const note = await crm.addNote(business,card.id,"Call back next Tuesday");
  assert.equal(note.customer_id,card.id);
  assert.equal(note.author_id,business);
  assert.equal(note.body,"Call back next Tuesday");
  assert.equal((await crm.listNotes(business,card.id)).length,1);
  await assert.rejects(
    () => crm.addNote(outsider,card.id,"Should not be visible"),
    error => error instanceof CrmError && error.code==="not_found"
  );
  await assert.rejects(
    () => crm.listNotes(outsider,card.id),
    error => error instanceof CrmError && error.code==="not_found"
  );
  await assert.rejects(
    () => crm.addNote(business,card.id,"   "),
    error => error instanceof CrmError && error.code==="invalid"
  );
});
