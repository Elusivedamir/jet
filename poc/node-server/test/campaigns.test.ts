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
const business=randomUUID(),optedIn=randomUUID(),globalOff=randomUUID(),noGrant=randomUUID(),noConversation=randomUUID(),archived=randomUUID(),outsider=randomUUID();
let campaignId="";
before(async()=>{
 const schema=await readFile(new URL("../schema.sql",import.meta.url),"utf8");
 for(const statement of schema.split(";").map(s=>s.trim()).filter(Boolean)) await pool.query(statement);
 await pool.query("TRUNCATE business_campaign_jobs,business_entitlements,business_campaigns,business_consent_events,business_consent_state,business_offer_preference_events,business_offer_preferences,crm_notes,crm_customers,contacts,direct_conversations,conversations,sessions,accounts CASCADE");
 await pool.query("INSERT INTO accounts(id,username,password_hash,display_name) VALUES($1,\u0027biz\u0027,\u0027hash\u0027,\u0027Business\u0027),($2,\u0027optedin\u0027,\u0027hash\u0027,\u0027Opted In\u0027),($3,\u0027globaloff\u0027,\u0027hash\u0027,\u0027Global Off\u0027),($4,\u0027nogrant\u0027,\u0027hash\u0027,\u0027No Grant\u0027),($5,\u0027noconversation\u0027,\u0027hash\u0027,\u0027No Conversation\u0027),($6,\u0027archived\u0027,\u0027hash\u0027,\u0027Archived Customer\u0027),($7,\u0027outsider\u0027,\u0027hash\u0027,\u0027Outsider\u0027)",[business,optedIn,globalOff,noGrant,noConversation,archived,outsider]);
 for(const person of [optedIn,globalOff,noGrant,noConversation,archived]){const pair=[business,person].sort();await pool.query("INSERT INTO contacts(account_low,account_high) VALUES($1,$2)",pair);await pool.query("INSERT INTO crm_customers(business_account_id,person_id) VALUES($1,$2)",[business,person]);}
 await consent.setOfferPreference(optedIn,true);await consent.setBusinessConsent(optedIn,business,true);
 for(const person of [optedIn,globalOff,noGrant,archived]){
  const conversation=randomUUID();await pool.query("INSERT INTO conversations(id) VALUES($1)",[conversation]);
  const pair=[business,person].sort();await pool.query("INSERT INTO direct_conversations(account_low,account_high,conversation_id) VALUES($1,$2,$3)",[...pair,conversation]);
  await pool.query("INSERT INTO conversation_members(conversation_id,account_id) VALUES($1,$2),($1,$3)",[conversation,business,person]);
 }
 await pool.query("INSERT INTO business_entitlements(business_account_id,campaigns_enabled) VALUES($1,TRUE)",[business]);
 await pool.query("INSERT INTO business_campaign_dispatch_limits(business_account_id,tokens,capacity,refill_per_second) VALUES($1,100,100,1)",[business]);
 await consent.setOfferPreference(globalOff,false);await consent.setOfferPreference(noGrant,true);await consent.setOfferPreference(noConversation,true);await consent.setBusinessConsent(noConversation,business,true);await consent.setOfferPreference(archived,true);await consent.setBusinessConsent(archived,business,true);await pool.query("UPDATE crm_customers SET status=$3 WHERE business_account_id=$1 AND person_id=$2",[business,archived,"archived"]);
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
 assert.equal(preview.total,5);assert.equal(preview.eligible,1);assert.equal(preview.excluded,4);
 const byId=new Map(preview.recipients.map(row=>[row.person_id,row]));
 assert.equal(byId.get(optedIn)?.eligibility,"eligible");
 assert.equal(byId.get(globalOff)?.exclusion_reason,"global_preference_off");
 assert.equal(byId.get(noGrant)?.exclusion_reason,"business_consent_missing");
 assert.equal(byId.get(noConversation)?.exclusion_reason,"direct_conversation_missing");
 assert.equal(byId.get(archived)?.exclusion_reason,"crm_customer_archived");
 assert.ok(!preview.recipients.some(row=>row.person_id===outsider));
});
test("campaign status summary is tenant-scoped and reports durable job states",async()=>{
 const draft=await campaigns.createDraft(business,"Status summary","Read-only KPI");
 const empty=await campaigns.statusSummary(business,draft.id);
 assert.equal(empty.jobs.total,0);
 await assert.rejects(()=>campaigns.statusSummary(outsider,draft.id),e=>e instanceof CampaignError&&e.code==="not_found");
 const queued=await campaigns.enqueueDraft(business,draft.id,"status-summary");
 assert.equal(queued.queued,1);
 const summary=await campaigns.statusSummary(business,draft.id);
 assert.equal(summary.campaign.status,"queued");
 assert.equal(summary.jobs.total,1);
 assert.equal(summary.jobs.queued,1);
 assert.equal(summary.jobs.sent,0);
 assert.ok(summary.updated_at instanceof Date);
 await pool.query("UPDATE business_campaign_jobs SET status='skipped',completed_at=now(),updated_at=now() WHERE campaign_id=$1",[draft.id]);
 await pool.query("UPDATE business_campaigns SET status='completed',updated_at=now() WHERE id=$1",[draft.id]);
});

test("campaign drafts are editable only by their owner and only before enqueue",async()=>{
 const draft=await campaigns.createDraft(business,"Original title","Original body");
 const updated=await campaigns.updateDraft(business,draft.id,"Updated title","Updated body");
 assert.equal(updated.title,"Updated title");assert.equal(updated.body,"Updated body");assert.equal(updated.status,"draft");
 await assert.rejects(()=>campaigns.updateDraft(outsider,draft.id,"Intruder","No"),e=>e instanceof CampaignError&&e.code==="not_found");
 await assert.rejects(()=>campaigns.updateDraft(business,draft.id," ","No"),e=>e instanceof CampaignError&&e.code==="invalid");
 await campaigns.enqueueDraft(business,draft.id,"edit-before-send");
 await assert.rejects(()=>campaigns.updateDraft(business,draft.id,"Too late","No mutation"),e=>e instanceof CampaignError&&e.code==="conflict");
 const unchanged=await campaigns.statusSummary(business,draft.id);
 assert.equal(unchanged.campaign.title,"Updated title");assert.equal(unchanged.campaign.body,"Updated body");
 await campaigns.cancelCampaign(business,draft.id);
});

test("campaign cancellation is owner-scoped, idempotent and fences not-yet-started work",async()=>{
 const queuedDraft=await campaigns.createDraft(business,"Cancel queued campaign","No recipient should be dispatched");
 await campaigns.enqueueDraft(business,queuedDraft.id,"cancel-queued");
 await assert.rejects(()=>campaigns.cancelCampaign(outsider,queuedDraft.id),e=>e instanceof CampaignError&&e.code==="not_found");
 const cancelled=await campaigns.cancelCampaign(business,queuedDraft.id);
 assert.equal(cancelled.cancelled,1);assert.equal(cancelled.in_flight,0);assert.equal(cancelled.replayed,false);
 const replay=await campaigns.cancelCampaign(business,queuedDraft.id);
 assert.equal(replay.replayed,true);assert.equal(replay.cancelled,1);
 const queuedState=await pool.query("SELECT status,skip_reason FROM business_campaign_jobs WHERE campaign_id=$1",[queuedDraft.id]);
 assert.equal(queuedState.rows[0]!.status,"cancelled");assert.equal(queuedState.rows[0]!.skip_reason,"campaign_cancelled");
 const leasedDraft=await campaigns.createDraft(business,"Cancel leased campaign","A claimed but not yet dispatched job");
 await campaigns.enqueueDraft(business,leasedDraft.id,"cancel-leased");
 const lease=(await campaigns.claimJobs(1))[0]!;assert.ok(lease);
 const inFlight=await campaigns.cancelCampaign(business,leasedDraft.id);
 assert.equal(inFlight.cancelled,0);assert.equal(inFlight.in_flight,1);
 assert.equal(await campaigns.mayDispatch(lease),"cancelled");
 await assert.rejects(()=>store.send(lease.business_account_id,lease.conversation_id,lease.operation_key,lease.body,null,null,"business_offer"),/campaign is cancelled or unavailable/);
 const fenced=await pool.query("SELECT status FROM business_campaign_jobs WHERE id=$1",[lease.id]);
 assert.equal(fenced.rows[0]!.status,"cancelled");
 const campaign=await pool.query("SELECT status FROM business_campaigns WHERE id=$1",[leasedDraft.id]);
 assert.equal(campaign.rows[0]!.status,"cancelled");
 const committedDraft=await campaigns.createDraft(business,"Cancel after message commit","Recover outbox link after worker crash");
 await campaigns.enqueueDraft(business,committedDraft.id,"cancel-after-commit");
 const committedLease=(await campaigns.claimJobs(1))[0]!;assert.ok(committedLease);
 const committedMessage=await store.send(committedLease.business_account_id,committedLease.conversation_id,committedLease.operation_key,committedLease.body,null,null,"business_offer");
 await pool.query("UPDATE business_campaign_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[committedLease.id]);
 const recovered=await campaigns.cancelCampaign(business,committedDraft.id);
 assert.equal(recovered.cancelled,0);assert.equal(recovered.in_flight,1);
 const recoveredJob=await pool.query("SELECT status,message_id FROM business_campaign_jobs WHERE id=$1",[committedLease.id]);
 assert.equal(recoveredJob.rows[0]!.status,"delivery_pending");assert.equal(recoveredJob.rows[0]!.message_id,committedMessage.message_id);
 const staleDraft=await campaigns.createDraft(business,"Cancel stale worker","Worker stopped before send");
 await campaigns.enqueueDraft(business,staleDraft.id,"cancel-stale-worker");
 const staleLease=(await campaigns.claimJobs(1))[0]!;assert.ok(staleLease);
 const firstCancel=await campaigns.cancelCampaign(business,staleDraft.id);
 assert.equal(firstCancel.in_flight,1);
 await pool.query("UPDATE business_campaign_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[staleLease.id]);
 const replayedCancel=await campaigns.cancelCampaign(business,staleDraft.id);
 assert.equal(replayedCancel.replayed,true);assert.equal(replayedCancel.cancelled,1);assert.equal(replayedCancel.in_flight,0);
 const staleState=await pool.query("SELECT status FROM business_campaign_jobs WHERE id=$1",[staleLease.id]);
 assert.equal(staleState.rows[0]!.status,"cancelled");
 const completedDraft=await campaigns.createDraft(business,"Already completed","Terminal campaign");
 await pool.query("UPDATE business_campaigns SET status='completed' WHERE id=$1",[completedDraft.id]);
 await assert.rejects(()=>campaigns.cancelCampaign(business,completedDraft.id),e=>e instanceof CampaignError&&e.code==="conflict");
});

test("campaign enqueue fails closed without entitlement and is idempotent per recipient",async()=>{
 const second=await campaigns.createDraft(business,"No entitlement","Draft");
 await pool.query("DELETE FROM business_entitlements WHERE business_account_id=$1",[business]);
 await assert.rejects(()=>campaigns.enqueueDraft(business,second.id,"no-entitlement"),e=>e instanceof CampaignError&&e.code==="not_entitled");
 await pool.query("INSERT INTO business_entitlements(business_account_id,campaigns_enabled) VALUES($1,TRUE)",[business]);
 const first=await campaigns.enqueueDraft(business,campaignId,"enqueue-once");assert.equal(first.queued,1);assert.equal(first.skipped,4);
 const replay=await campaigns.enqueueDraft(business,campaignId,"enqueue-once");assert.equal(replay.replayed,true);assert.equal(replay.queued,1);
 const jobs=await pool.query("SELECT recipient_id,operation_key FROM business_campaign_jobs WHERE campaign_id=$1",[campaignId]);assert.equal(jobs.rowCount,1);assert.equal(jobs.rows[0]!.recipient_id,optedIn);assert.equal(jobs.rows[0]!.operation_key,"campaign:"+campaignId+":"+optedIn);
});
test("campaign claims stop when the shared business dispatch budget is empty",async()=>{
 await pool.query("UPDATE business_campaign_dispatch_limits SET tokens=0,capacity=1,refill_per_second=0.0001,refilled_at=clock_timestamp() WHERE business_account_id=$1",[business]);
 const blocked=await campaigns.claimJobs(10,15000);
 assert.equal(blocked.length,0);
 const budget=await pool.query("SELECT tokens FROM business_campaign_dispatch_limits WHERE business_account_id=$1",[business]);
 assert.ok(Number(budget.rows[0]!.tokens)<1);
 await pool.query("UPDATE business_campaign_dispatch_limits SET tokens=100,capacity=100,refill_per_second=1,refilled_at=clock_timestamp() WHERE business_account_id=$1",[business]);
});

test("campaign leases fence stale workers and reconcile only a delivery-pending job",async()=>{
 const jobs=await campaigns.claimJobs(10,15000);assert.equal(jobs.length,1);const job=jobs[0]!;
 const activeCampaign=await pool.query("SELECT status FROM business_campaigns WHERE id=$1",[campaignId]);assert.equal(activeCampaign.rows[0]!.status,"sending");
 const messageId=randomUUID();
 const draft=await pool.query("SELECT conversation_id FROM business_campaign_jobs WHERE id=$1",[job.id]);
 const counter=await pool.query<{last_position:string}>("INSERT INTO conversation_counters(conversation_id,last_position) VALUES($1,1) ON CONFLICT(conversation_id) DO UPDATE SET last_position=conversation_counters.last_position+1 RETURNING last_position",[draft.rows[0]!.conversation_id]);
 await pool.query("INSERT INTO messages(id,conversation_id,sender_id,operation_key,payload,position) VALUES($1,$2,$3,$4,'campaign test',$5)",[messageId,draft.rows[0]!.conversation_id,business,"test:"+messageId,counter.rows[0]!.last_position]);
 await campaigns.attachMessage(job.id,job.lease_token,messageId);
 await assert.rejects(()=>campaigns.attachMessage(job.id,job.lease_token,messageId),e=>e instanceof CampaignError&&e.code==="conflict");
 await campaigns.reconcileDelivery(job.id,messageId,"completed");
 const state=await pool.query("SELECT status FROM business_campaign_jobs WHERE id=$1",[job.id]);assert.equal(state.rows[0]!.status,"sent");
});

test("current lease token may attach a committed message after expiry unless a new worker took over",async()=>{
 const draft=await campaigns.createDraft(business,"Attach after expiry","Token remains the fencing authority");
 await campaigns.enqueueDraft(business,draft.id,"attach-after-expiry");
 const job=(await campaigns.claimJobs(1,1000))[0]!;assert.ok(job);
 const message=await store.send(job.business_account_id,job.conversation_id,job.operation_key,job.body,null,null,"business_offer");
 await pool.query("UPDATE business_campaign_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[job.id]);
 await campaigns.attachMessage(job.id,job.lease_token,message.message_id);
 const state=await pool.query("SELECT status,message_id FROM business_campaign_jobs WHERE id=$1",[job.id]);
 assert.equal(state.rows[0]!.status,"delivery_pending");assert.equal(state.rows[0]!.message_id,message.message_id);
});

test("campaign worker sends through the message outbox and reconciles after inbox delivery",async()=>{
 const draft=await campaigns.createDraft(business,"Worker integration","Campaign message");
 const queued=await campaigns.enqueueDraft(business,draft.id,"worker-once");
 assert.equal(queued.queued,1);
 const batch=await campaigns.processBatch(store,10);
 assert.equal(batch.claimed,1);assert.equal(batch.submitted,1,JSON.stringify({batch,job:(await pool.query("SELECT status,last_error,skip_reason FROM business_campaign_jobs WHERE campaign_id=$1",[draft.id])).rows[0]}));
 const job=await pool.query("SELECT message_id,status FROM business_campaign_jobs WHERE campaign_id=$1",[draft.id]);
 assert.equal(job.rows[0]!.status,"delivery_pending");assert.ok(job.rows[0]!.message_id);
 const outbox=await store.claim(10,15000);
 const delivery=outbox.find(x=>x.message_id===job.rows[0]!.message_id);
 assert.ok(delivery);await store.dispatch(delivery!);
 assert.equal(await campaigns.reconcilePending(),1);
 const final=await pool.query("SELECT status FROM business_campaign_jobs WHERE campaign_id=$1",[draft.id]);
 assert.equal(final.rows[0]!.status,"sent");
 const campaign=await pool.query("SELECT status FROM business_campaigns WHERE id=$1",[draft.id]);
 assert.equal(campaign.rows[0]!.status,"completed");
});

test("campaign worker skips a queued recipient whose consent is revoked before message creation",async()=>{
 const draft=await campaigns.createDraft(business,"Revoked before send","Should not be sent");
 await campaigns.enqueueDraft(business,draft.id,"revoked-before-send");
 await consent.setBusinessConsent(optedIn,business,false);
 const result=await campaigns.processBatch(store,10);
 assert.equal(result.claimed,1);assert.equal(result.skipped,1);
 const job=await pool.query("SELECT status FROM business_campaign_jobs WHERE campaign_id=$1",[draft.id]);
 assert.equal(job.rows[0]!.status,"skipped");
 const messages=await pool.query("SELECT count(*)::int AS n FROM messages WHERE sender_id=$1 AND operation_key=$2",[business,"campaign:"+draft.id+":"+optedIn]);
 assert.equal(messages.rows[0]!.n,0);
 await consent.setBusinessConsent(optedIn,business,true);
});

test("campaign worker crash after message commit reuses the same message on the next lease",async()=>{
 const draft=await campaigns.createDraft(business,"Crash recovery","Exactly once logical send");
 await campaigns.enqueueDraft(business,draft.id,"crash-recovery");
 const first=(await campaigns.claimJobs(1,1000))[0]!;assert.ok(first);
 const original=await store.send(business,first.conversation_id,first.operation_key,first.body,null,null,"business_offer");
 await pool.query("UPDATE business_campaign_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[first.id]);
 const second=(await campaigns.claimJobs(1,15000))[0]!;assert.ok(second);
 assert.notEqual(first.lease_token,second.lease_token);
 const replay=await store.send(business,second.conversation_id,second.operation_key,second.body,null,null,"business_offer");
 assert.equal(replay.message_id,original.message_id);
 await campaigns.attachMessage(second.id,second.lease_token,replay.message_id);
 const counts=await pool.query("SELECT (SELECT count(*) FROM messages WHERE sender_id=$1 AND operation_key=$2)::int AS messages,(SELECT count(*) FROM delivery_outbox WHERE message_id=$3)::int AS outbox",[business,second.operation_key,original.message_id]);
 assert.equal(counts.rows[0]!.messages,1);assert.equal(counts.rows[0]!.outbox,1);
});

test("campaign worker stops retrying after eight transient failures",async()=>{
 const draft=await campaigns.createDraft(business,"Retry cap","Bounded retry test");
 await campaigns.enqueueDraft(business,draft.id,"retry-cap");
 const row=await pool.query("SELECT id,conversation_id FROM business_campaign_jobs WHERE campaign_id=$1",[draft.id]);
 const jobId=row.rows[0]!.id,conversation=row.rows[0]!.conversation_id;
 await pool.query("DELETE FROM conversation_members WHERE conversation_id=$1 AND account_id=$2",[conversation,business]);
 let last:{claimed:number;submitted:number;skipped:number;retried:number;failed:number}|null=null;
 for(let attempt=1;attempt<=8;attempt++){
  await pool.query("UPDATE business_campaign_jobs SET available_at=now() WHERE id=$1",[jobId]);
  last=await campaigns.processBatch(store,1);
  const state=await pool.query("SELECT status,attempt_count FROM business_campaign_jobs WHERE id=$1",[jobId]);
  assert.equal(state.rows[0]!.attempt_count,attempt);
  assert.equal(state.rows[0]!.status,attempt===8?"failed":"queued");
 }
 assert.equal(last!.failed,1);
 await pool.query("INSERT INTO conversation_members(conversation_id,account_id) VALUES($1,$2)",[conversation,business]);
});

test("campaign enqueue idempotency key remains replayable after worker claims the job",async()=>{
 const draft=await campaigns.createDraft(business,"Replay while sending","Idempotency across state transitions");
 const first=await campaigns.enqueueDraft(business,draft.id,"stable-enqueue-key");
 assert.equal(first.queued,1);
 const claimed=await campaigns.claimJobs(1);
 assert.equal(claimed.length,1);
 const replay=await campaigns.enqueueDraft(business,draft.id,"stable-enqueue-key");
 assert.equal(replay.replayed,true);
 assert.equal(replay.queued,1);
 const jobs=await pool.query("SELECT count(*)::int AS n FROM business_campaign_jobs WHERE campaign_id=$1",[draft.id]);
 assert.equal(jobs.rows[0]!.n,1);
});

test("campaign job schema enforces the owning business account",async()=>{
 const draft=await campaigns.createDraft(business,"Tenant integrity","Tenant mismatch must fail");
 const conversation=await pool.query("SELECT conversation_id FROM direct_conversations WHERE account_low=LEAST($1::text,$2::text) AND account_high=GREATEST($1::text,$2::text)",[business,optedIn]);
 await assert.rejects(()=>pool.query("INSERT INTO business_campaign_jobs(campaign_id,business_account_id,recipient_id,conversation_id,operation_key) VALUES($1,$2,$3,$4,$5)",[draft.id,outsider,optedIn,conversation.rows[0]!.conversation_id,"tenant-mismatch:"+draft.id]));
});

test("archiving a CRM customer after enqueue prevents campaign message creation",async()=>{
 const draft=await campaigns.createDraft(business,"Archive before send","Must not reach archived customer");
 await campaigns.enqueueDraft(business,draft.id,"archive-before-send");
 await pool.query("UPDATE crm_customers SET status='archived' WHERE business_account_id=$1 AND person_id=$2",[business,optedIn]);
 const result=await campaigns.processBatch(store,1);
 assert.equal(result.skipped,1);
 const job=await pool.query("SELECT status FROM business_campaign_jobs WHERE campaign_id=$1",[draft.id]);
 assert.equal(job.rows[0]!.status,"skipped");
 const messages=await pool.query("SELECT count(*)::int AS n FROM messages WHERE sender_id=$1 AND operation_key=$2",[business,"campaign:"+draft.id+":"+optedIn]);
 assert.equal(messages.rows[0]!.n,0);
 await pool.query("UPDATE crm_customers SET status='active' WHERE business_account_id=$1 AND person_id=$2",[business,optedIn]);
});

test("archiving a CRM customer after enqueue but before inbox delivery cancels the offer",async()=>{
 const draft=await campaigns.createDraft(business,"Archive before delivery","Must not appear in inbox");
 await campaigns.enqueueDraft(business,draft.id,"archive-before-delivery");
 const batch=await campaigns.processBatch(store,1);
 assert.equal(batch.submitted,1);
 const job=await pool.query("SELECT message_id,conversation_id FROM business_campaign_jobs WHERE campaign_id=$1",[draft.id]);
 await pool.query("UPDATE crm_customers SET status='archived' WHERE business_account_id=$1 AND person_id=$2",[business,optedIn]);
 const outbox=await store.claim(10,15000);
 const delivery=outbox.find(x=>x.message_id===job.rows[0]!.message_id);
 assert.ok(delivery);await store.dispatch(delivery!);
 const inbox=await pool.query("SELECT count(*)::int AS n FROM recipient_inbox WHERE message_id=$1 AND recipient_id=$2",[job.rows[0]!.message_id,optedIn]);
 assert.equal(inbox.rows[0]!.n,0);
 assert.equal(await campaigns.reconcilePending(),1);
 const state=await pool.query("SELECT status FROM business_campaign_jobs WHERE campaign_id=$1",[draft.id]);
 assert.equal(state.rows[0]!.status,"skipped");
 await pool.query("UPDATE crm_customers SET status='active' WHERE business_account_id=$1 AND person_id=$2",[business,optedIn]);
});
