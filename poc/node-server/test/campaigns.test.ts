import {after,before,test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import pg from "pg";
const {Pool}=pg;
import {CampaignStore,CampaignError} from "../src/campaigns.js";
import {Store} from "../src/store.js";
import {ConsentStore} from "../src/consent.js";
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
const campaigns=new CampaignStore(pool),consent=new ConsentStore(pool),store=new Store(pool);
const business=randomUUID(),optedIn=randomUUID(),globalOff=randomUUID(),noGrant=randomUUID(),outsider=randomUUID();
let campaignId="";
before(async()=>{
 const schema=await readFile(new URL("../schema.sql",import.meta.url),"utf8");
 for(const statement of schema.split(";").map(s=>s.trim()).filter(Boolean)) await pool.query(statement);
 await pool.query("TRUNCATE business_campaign_jobs,business_entitlements,business_campaigns,business_consent_events,business_consent_state,business_offer_preference_events,business_offer_preferences,crm_notes,crm_customers,contacts,direct_conversations,conversations,sessions,accounts CASCADE");
 await pool.query("INSERT INTO accounts(id,username,password_hash,display_name) VALUES($1,\u0027biz\u0027,\u0027hash\u0027,\u0027Business\u0027),($2,\u0027optedin\u0027,\u0027hash\u0027,\u0027Opted In\u0027),($3,\u0027globaloff\u0027,\u0027hash\u0027,\u0027Global Off\u0027),($4,\u0027nogrant\u0027,\u0027hash\u0027,\u0027No Grant\u0027),($5,\u0027outsider\u0027,\u0027hash\u0027,\u0027Outsider\u0027)",[business,optedIn,globalOff,noGrant,outsider]);
 for(const person of [optedIn,globalOff,noGrant]){const pair=[business,person].sort();await pool.query("INSERT INTO contacts(account_low,account_high) VALUES($1,$2)",pair);await pool.query("INSERT INTO crm_customers(business_account_id,person_id) VALUES($1,$2)",[business,person]);}
 await consent.setOfferPreference(optedIn,true);await consent.setBusinessConsent(optedIn,business,true);
 for(const person of [optedIn,globalOff,noGrant]){
  const conversation=randomUUID();await pool.query("INSERT INTO conversations(id) VALUES($1)",[conversation]);
  const pair=[business,person].sort();await pool.query("INSERT INTO direct_conversations(account_low,account_high,conversation_id) VALUES($1,$2,$3)",[...pair,conversation]);
 }
 await pool.query("INSERT INTO business_entitlements(business_account_id,campaigns_enabled) VALUES($1,TRUE)",[business]);
 await consent.setOfferPreference(globalOff,false);await consent.setOfferPreference(noGrant,true);
 const draft=await campaigns.createDraft(business,"Update","Draft body");campaignId=draft.id;
});
after(async()=>pool.end());
test("campaign drafts are validated and isolated by business account",async()=>{
 const list=await campaigns.listDrafts(business);assert.equal(list.length,1);assert.equal(list[0]!.id,campaignId);assert.equal(list[0]!.status,"draft");
 assert.deepEqual(await campaigns.listDrafts(outsider),[]);
 await assert.rejects(()=>campaigns.preview(outsider,campaignId),e=>e instanceof CampaignError&&e.code==="not_found");
 await assert.rejects(()=>campaigns.createDraft(business," ","body"),e=>e instanceof CampaignError&&e.code==="invalid");
 await assert.rejects(()=>campaigns.createDraft(business,"title"," "),e=>e instanceof CampaignError&&e.code==="invalid");
});
test("audience preview includes only contacts with both recipient-controlled gates",async()=>{
 const preview=await campaigns.preview(business,campaignId);
 assert.equal(preview.total,3);assert.equal(preview.eligible,1);assert.equal(preview.excluded,2);
 const byId=new Map(preview.recipients.map(row=>[row.person_id,row]));
 assert.equal(byId.get(optedIn)?.eligibility,"eligible");
 assert.equal(byId.get(globalOff)?.exclusion_reason,"global_preference_off");
 assert.equal(byId.get(noGrant)?.exclusion_reason,"business_consent_missing");
 assert.ok(!preview.recipients.some(row=>row.person_id===outsider));
});
test("campaign enqueue fails closed without entitlement and is idempotent per recipient",async()=>{
 const second=await campaigns.createDraft(business,"No entitlement","Draft");
 await pool.query("DELETE FROM business_entitlements WHERE business_account_id=$1",[business]);
 await assert.rejects(()=>campaigns.enqueueDraft(business,second.id,"no-entitlement"),e=>e instanceof CampaignError&&e.code==="not_entitled");
 await pool.query("INSERT INTO business_entitlements(business_account_id,campaigns_enabled) VALUES($1,TRUE)",[business]);
 const first=await campaigns.enqueueDraft(business,campaignId,"enqueue-once");assert.equal(first.queued,1);assert.equal(first.skipped,2);
 const replay=await campaigns.enqueueDraft(business,campaignId,"enqueue-once");assert.equal(replay.replayed,true);assert.equal(replay.queued,1);
 const jobs=await pool.query("SELECT recipient_id,operation_key FROM business_campaign_jobs WHERE campaign_id=$1",[campaignId]);assert.equal(jobs.rowCount,1);assert.equal(jobs.rows[0]!.recipient_id,optedIn);assert.equal(jobs.rows[0]!.operation_key,"campaign:"+campaignId+":"+optedIn);
});
test("campaign leases fence stale workers and reconcile only a delivery-pending job",async()=>{
 const jobs=await campaigns.claimJobs(10,15000);assert.equal(jobs.length,1);const job=jobs[0]!;
 const messageId=randomUUID();
 const draft=await pool.query("SELECT conversation_id FROM business_campaign_jobs WHERE id=$1",[job.id]);
 await pool.query("INSERT INTO messages(id,conversation_id,sender_id,operation_key,payload,position) VALUES($1,$2,$3,$4,'campaign test',1)",[messageId,draft.rows[0]!.conversation_id,business,"test:"+messageId]);
 await campaigns.attachMessage(job.id,job.lease_token,messageId);
 await assert.rejects(()=>campaigns.attachMessage(job.id,job.lease_token,messageId),e=>e instanceof CampaignError&&e.code==="conflict");
 await campaigns.reconcileDelivery(job.id,messageId,"completed");
 const state=await pool.query("SELECT status FROM business_campaign_jobs WHERE id=$1",[job.id]);assert.equal(state.rows[0]!.status,"sent");
});
