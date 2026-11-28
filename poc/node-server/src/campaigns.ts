import type { Pool as PoolType } from "pg";
import { Store, ForbiddenError } from "./store.js";
export type CampaignDraft = { id:string; business_account_id:string; title:string; body:string; status:"draft"|"queued"|"sending"|"completed"|"cancelled"; created_at:Date; updated_at:Date };
export type CampaignAudienceRow = { person_id:string; username:string; display_name:string; customer_status:string; eligibility:"eligible"|"excluded"; exclusion_reason:string|null };
export type CampaignJob = { id:string; campaign_id:string; business_account_id:string; recipient_id:string; conversation_id:string; body:string; status:string; operation_key:string; attempt_count:number; lease_token:string };
export class CampaignError extends Error { constructor(readonly code:"invalid"|"not_found"|"not_entitled"|"conflict") { super(code); } }
export class CampaignStore {
 constructor(readonly pool:PoolType) {}
 async createDraft(businessAccountId:string,titleInput:string,bodyInput:string):Promise<CampaignDraft>{
  const title=titleInput.trim(),body=bodyInput.trim();
  if(!businessAccountId||title.length<1||title.length>100||body.length<1||body.length>4000)throw new CampaignError("invalid");
  const r=await this.pool.query<CampaignDraft>("INSERT INTO business_campaigns(business_account_id,title,body) VALUES($1,$2,$3) RETURNING id,business_account_id,title,body,status,created_at,updated_at",[businessAccountId,title,body]);return r.rows[0]!;
 }
 async listDrafts(businessAccountId:string):Promise<CampaignDraft[]>{
  if(!businessAccountId)throw new CampaignError("invalid");
  const r=await this.pool.query<CampaignDraft>("SELECT id,business_account_id,title,body,status,created_at,updated_at FROM business_campaigns WHERE business_account_id=$1 ORDER BY updated_at DESC,id",[businessAccountId]);return r.rows;
 }
 async preview(businessAccountId:string,campaignId:string):Promise<{campaign:CampaignDraft;total:number;eligible:number;excluded:number;recipients:CampaignAudienceRow[]}>{
  if(!businessAccountId||!campaignId)throw new CampaignError("invalid");
  const d=await this.pool.query<CampaignDraft>("SELECT id,business_account_id,title,body,status,created_at,updated_at FROM business_campaigns WHERE id=$1 AND business_account_id=$2",[campaignId,businessAccountId]);
  const campaign=d.rows[0];if(!campaign)throw new CampaignError("not_found");
  const r=await this.pool.query<CampaignAudienceRow>("SELECT c.person_id,a.username,a.display_name,c.status AS customer_status, CASE WHEN c.status='archived' THEN 'excluded' WHEN ct.account_low IS NULL THEN 'excluded' WHEN dc.conversation_id IS NULL THEN 'excluded' WHEN COALESCE(p.enabled,FALSE)=FALSE THEN 'excluded' WHEN COALESCE(s.status,'revoked')<>'granted' THEN 'excluded' ELSE 'eligible' END AS eligibility, CASE WHEN c.status='archived' THEN 'crm_customer_archived' WHEN ct.account_low IS NULL THEN 'contact_not_accepted' WHEN dc.conversation_id IS NULL THEN 'direct_conversation_missing' WHEN COALESCE(p.enabled,FALSE)=FALSE THEN 'global_preference_off' WHEN COALESCE(s.status,'revoked')<>'granted' THEN 'business_consent_missing' ELSE NULL END AS exclusion_reason FROM crm_customers c JOIN accounts a ON a.id=c.person_id LEFT JOIN contacts ct ON ct.account_low=LEAST(c.business_account_id,c.person_id) AND ct.account_high=GREATEST(c.business_account_id,c.person_id) LEFT JOIN direct_conversations dc ON dc.account_low=LEAST(c.business_account_id,c.person_id) AND dc.account_high=GREATEST(c.business_account_id,c.person_id) LEFT JOIN business_offer_preferences p ON p.account_id=c.person_id LEFT JOIN business_consent_state s ON s.business_account_id=c.business_account_id AND s.recipient_id=c.person_id WHERE c.business_account_id=$1 ORDER BY eligibility DESC,a.username,c.person_id",[businessAccountId]);
  const recipients=r.rows,eligible=recipients.filter(x=>x.eligibility==="eligible").length;return {campaign,total:recipients.length,eligible,excluded:recipients.length-eligible,recipients};
 }
 // Internal primitive only: no HTTP route until billing, confirmation UX, global platform caps and abuse controls exist.
 async enqueueDraft(owner:string,campaignId:string,key:string):Promise<{campaign_id:string;queued:number;skipped:number;replayed:boolean}>{
  if(!owner||!campaignId||!key||key.length>200)throw new CampaignError("invalid");
  const c=await this.pool.connect();
  try{
   await c.query("BEGIN");
   const q=await c.query<{id:string;status:string;enqueue_key:string|null}>("SELECT id,status,enqueue_key FROM business_campaigns WHERE id=$1 AND business_account_id=$2 FOR UPDATE",[campaignId,owner]);
   if(q.rowCount!==1)throw new CampaignError("not_found");
   const campaign=q.rows[0]!;
   if(campaign.status!=="draft"){
    if(["queued","sending","completed"].includes(campaign.status)&&campaign.enqueue_key===key){
     const n=await c.query<{queued:number;skipped:number}>("SELECT count(*) FILTER(WHERE status IN ('queued','processing','delivery_pending','sent'))::int AS queued,count(*) FILTER(WHERE status='skipped')::int AS skipped FROM business_campaign_jobs WHERE campaign_id=$1",[campaignId]);
     await c.query("COMMIT");return {campaign_id:campaignId,queued:n.rows[0]!.queued,skipped:n.rows[0]!.skipped,replayed:true};
    }throw new CampaignError("conflict");
   }
   const entitlement=await c.query("SELECT 1 FROM business_entitlements WHERE business_account_id=$1 AND campaigns_enabled=TRUE FOR SHARE",[owner]);
   if(entitlement.rowCount!==1)throw new CampaignError("not_entitled");
   await c.query("INSERT INTO business_campaign_dispatch_limits(business_account_id) VALUES($1) ON CONFLICT(business_account_id) DO NOTHING",[owner]);
   const audience=await c.query<{recipient_id:string;conversation_id:string|null;customer_status:string}>("SELECT c.person_id AS recipient_id,dc.conversation_id,c.status AS customer_status FROM crm_customers c LEFT JOIN direct_conversations dc ON dc.account_low=LEAST(c.business_account_id,c.person_id) AND dc.account_high=GREATEST(c.business_account_id,c.person_id) WHERE c.business_account_id=$1 ORDER BY c.person_id",[owner]);
   let queued=0,skipped=0;
   for(const a of audience.rows){
    if(a.customer_status==="archived"||!a.conversation_id){skipped++;continue;}
    const p=await c.query<{enabled:boolean}>("SELECT enabled FROM business_offer_preferences WHERE account_id=$1 FOR UPDATE",[a.recipient_id]);
    if(!p.rowCount||!p.rows[0]!.enabled){skipped++;continue;}
    const s=await c.query<{status:string}>("SELECT status FROM business_consent_state WHERE business_account_id=$1 AND recipient_id=$2 FOR UPDATE",[owner,a.recipient_id]);
    if(!s.rowCount||s.rows[0]!.status!=="granted"){skipped++;continue;}
    const ct=await c.query("SELECT 1 FROM contacts WHERE account_low=LEAST($1::text,$2::text) AND account_high=GREATEST($1::text,$2::text) FOR KEY SHARE",[owner,a.recipient_id]);
    if(!ct.rowCount){skipped++;continue;}
    const crm=await c.query("SELECT 1 FROM crm_customers WHERE business_account_id=$1 AND person_id=$2 AND status<>'archived' FOR SHARE",[owner,a.recipient_id]);
    if(!crm.rowCount){skipped++;continue;}
    const op="campaign:"+campaignId+":"+a.recipient_id;
    const ins=await c.query("INSERT INTO business_campaign_jobs(campaign_id,business_account_id,recipient_id,conversation_id,operation_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(campaign_id,recipient_id) DO NOTHING",[campaignId,owner,a.recipient_id,a.conversation_id,op]);
    if(ins.rowCount===1)queued++;
   }
   await c.query("UPDATE business_campaigns SET status='queued',enqueue_key=$3,updated_at=now() WHERE id=$1 AND business_account_id=$2",[campaignId,owner,key]);
   await c.query("COMMIT");return {campaign_id:campaignId,queued,skipped,replayed:false};
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 }
 async updateDraft(owner:string,campaignId:string,titleInput:string,bodyInput:string):Promise<CampaignDraft>{
  const title=titleInput.trim(),body=bodyInput.trim();
  if(!owner||!campaignId||title.length<1||title.length>100||body.length<1||body.length>4000)throw new CampaignError("invalid");
  const r=await this.pool.query<CampaignDraft>("UPDATE business_campaigns SET title=$3,body=$4,updated_at=now() WHERE id=$1 AND business_account_id=$2 AND status='draft' RETURNING id,business_account_id,title,body,status,created_at,updated_at",[campaignId,owner,title,body]);
  if(r.rowCount===1)return r.rows[0]!;
  const exists=await this.pool.query("SELECT 1 FROM business_campaigns WHERE id=$1 AND business_account_id=$2",[campaignId,owner]);
  if(!exists.rowCount)throw new CampaignError("not_found");
  throw new CampaignError("conflict");
 }
 async cancelCampaign(owner:string,campaignId:string):Promise<{campaign_id:string;cancelled:number;in_flight:number;replayed:boolean}>{
  if(!owner||!campaignId)throw new CampaignError("invalid");
  const client=await this.pool.connect();
  try{
   await client.query("BEGIN");
   const result=await client.query<{status:string}>("SELECT status FROM business_campaigns WHERE id=$1 AND business_account_id=$2 FOR UPDATE",[campaignId,owner]);
   if(result.rowCount!==1)throw new CampaignError("not_found");
   const current=result.rows[0]!.status;
   if(current==="completed")throw new CampaignError("conflict");
   if(current==="cancelled"){
    const counts=await client.query<{cancelled:number;in_flight:number}>("SELECT count(*) FILTER(WHERE status='cancelled')::int AS cancelled,count(*) FILTER(WHERE status IN ('processing','delivery_pending'))::int AS in_flight FROM business_campaign_jobs WHERE campaign_id=$1",[campaignId]);
    await client.query("COMMIT");
    return {campaign_id:campaignId,cancelled:counts.rows[0]!.cancelled,in_flight:counts.rows[0]!.in_flight,replayed:true};
   }
   await client.query("UPDATE business_campaigns SET status='cancelled',updated_at=now() WHERE id=$1 AND business_account_id=$2",[campaignId,owner]);
   const changed=await client.query("UPDATE business_campaign_jobs SET status='cancelled',skip_reason='campaign_cancelled',completed_at=now(),lease_until=NULL,lease_token=NULL,updated_at=now() WHERE campaign_id=$1 AND status='queued'",[campaignId]);
   const active=await client.query<{n:number}>("SELECT count(*)::int AS n FROM business_campaign_jobs WHERE campaign_id=$1 AND status IN ('processing','delivery_pending')",[campaignId]);
   await client.query("COMMIT");
   return {campaign_id:campaignId,cancelled:changed.rowCount??0,in_flight:active.rows[0]!.n,replayed:false};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
 }
 async mayDispatch(job:CampaignJob):Promise<"ready"|"cancelled"|"stale">{
  const r=await this.pool.query<{campaign_status:string}>("SELECT c.status AS campaign_status FROM business_campaign_jobs j JOIN business_campaigns c ON c.id=j.campaign_id WHERE j.id=$1 AND j.status='processing' AND j.lease_token=$2 AND j.lease_until>clock_timestamp()",[job.id,job.lease_token]);
  if(r.rowCount===1&&["queued","sending"].includes(r.rows[0]!.campaign_status))return "ready";
  const cancelled=await this.pool.query("UPDATE business_campaign_jobs j SET status='cancelled',skip_reason='campaign_cancelled',completed_at=now(),lease_until=NULL,lease_token=NULL,updated_at=now() FROM business_campaigns c WHERE j.id=$1 AND j.campaign_id=c.id AND j.status='processing' AND j.lease_token=$2 AND c.status='cancelled' RETURNING j.id",[job.id,job.lease_token]);
  return cancelled.rowCount===1?"cancelled":"stale";
 }
 async claimJobs(limit=20,leaseMs=60000):Promise<CampaignJob[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>120000)throw new CampaignError("invalid");
  // Lock and spend a shared per-business token; one job per claim prevents batch bypass.
  const r=await this.pool.query<CampaignJob>("WITH candidate AS (SELECT j.id,j.campaign_id,j.business_account_id,LEAST(l.capacity,l.tokens+GREATEST(0,EXTRACT(EPOCH FROM (clock_timestamp()-l.refilled_at))*l.refill_per_second)) AS available_tokens FROM business_campaign_jobs j JOIN business_campaigns c ON c.id=j.campaign_id JOIN business_campaign_dispatch_limits l ON l.business_account_id=j.business_account_id WHERE c.status IN ('queued','sending') AND j.available_at<=now() AND (j.status='queued' OR (j.status='processing' AND j.lease_until<now())) AND LEAST(l.capacity,l.tokens+GREATEST(0,EXTRACT(EPOCH FROM (clock_timestamp()-l.refilled_at))*l.refill_per_second))>=1 ORDER BY j.created_at,j.id FOR UPDATE OF j,l SKIP LOCKED LIMIT 1), claimed AS (UPDATE business_campaign_jobs j SET status='processing',attempt_count=j.attempt_count+1,lease_until=now()+($1*interval '1 millisecond'),lease_token=gen_random_uuid()::text,updated_at=now() FROM candidate x JOIN business_campaigns c ON c.id=x.campaign_id WHERE j.id=x.id RETURNING j.id,j.campaign_id,j.business_account_id,j.recipient_id,j.conversation_id,c.body,j.status,j.operation_key,j.attempt_count,j.lease_token), spent AS (UPDATE business_campaign_dispatch_limits l SET tokens=x.available_tokens-1,refilled_at=clock_timestamp(),updated_at=now() FROM candidate x WHERE l.business_account_id=x.business_account_id RETURNING l.business_account_id) SELECT * FROM claimed",[leaseMs]);
  const campaignIds=[...new Set(r.rows.map(job=>job.campaign_id))];
  if(campaignIds.length)await this.pool.query("UPDATE business_campaigns SET status='sending',updated_at=now() WHERE id=ANY($1::text[]) AND status='queued'",[campaignIds]);
  return r.rows;
 }
 async attachMessage(jobId:string,token:string,messageId:string):Promise<void>{
  const r=await this.pool.query("UPDATE business_campaign_jobs SET status='delivery_pending',message_id=$3,lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=$1 AND status='processing' AND lease_token=$2 AND lease_until>clock_timestamp()",[jobId,token,messageId]);if(r.rowCount!==1)throw new CampaignError("conflict");
 }
 async reconcileDelivery(jobId:string,messageId:string,state:"completed"|"cancelled"|"terminal_failure"):Promise<void>{
  const status=state==="completed"?"sent":state==="cancelled"?"skipped":"failed",reason=state==="cancelled"?"delivery_cancelled":null;
  const r=await this.pool.query("UPDATE business_campaign_jobs SET status=$3,skip_reason=$4,completed_at=now(),updated_at=now() WHERE id=$1 AND message_id=$2 AND status='delivery_pending'",[jobId,messageId,status,reason]);if(r.rowCount!==1)throw new CampaignError("conflict");
 }
 async processBatch(store:Store,limit=20):Promise<{claimed:number;submitted:number;skipped:number;retried:number;failed:number}> {
  const jobs=await this.claimJobs(limit,60000);let submitted=0,skipped=0,retried=0,failed=0;
  for(const job of jobs){
   try{
    const dispatchState=await this.mayDispatch(job);if(dispatchState!=="ready"){if(dispatchState==="cancelled")skipped++;continue;}\n    const message=await store.send(job.business_account_id,job.conversation_id,job.operation_key,job.body,null,null,"business_offer");
    await this.attachMessage(job.id,job.lease_token,message.message_id);submitted++;
   }catch(error){
    if(error instanceof ForbiddenError){
     const r=await this.pool.query("UPDATE business_campaign_jobs j SET status=CASE WHEN EXISTS(SELECT 1 FROM business_campaigns c WHERE c.id=j.campaign_id AND c.status='cancelled') THEN 'cancelled' ELSE 'skipped' END,skip_reason=CASE WHEN EXISTS(SELECT 1 FROM business_campaigns c WHERE c.id=j.campaign_id AND c.status='cancelled') THEN 'campaign_cancelled' ELSE 'consent_or_contact_not_eligible' END,completed_at=now(),lease_until=NULL,lease_token=NULL,updated_at=now() WHERE j.id=$1 AND j.status='processing' AND j.lease_token=$2 AND j.lease_until>clock_timestamp()",[job.id,job.lease_token]);
     if(r.rowCount===1)skipped++;
    }else{
     const terminal=job.attempt_count>=8,delay=terminal?0:Math.min(2**job.attempt_count,256)*1000;
     const r=await this.pool.query("UPDATE business_campaign_jobs SET status=$3,available_at=now()+($4*interval '1 millisecond'),lease_until=NULL,lease_token=NULL,last_error=$5,completed_at=CASE WHEN $3='failed' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1 AND status='processing' AND lease_token=$2 AND lease_until>clock_timestamp()",[job.id,job.lease_token,terminal?'failed':'queued',delay,String(error).slice(0,500)]);
     if(r.rowCount===1){if(terminal)failed++;else retried++;}
    }
   }
  }
  return {claimed:jobs.length,submitted,skipped,retried,failed};
 }
 async reconcilePending():Promise<number>{
  const r=await this.pool.query("UPDATE business_campaign_jobs j SET status=CASE o.state WHEN 'completed' THEN 'sent' WHEN 'cancelled' THEN 'skipped' WHEN 'terminal_failure' THEN 'failed' END,skip_reason=CASE WHEN o.state='cancelled' THEN COALESCE(o.last_error,'delivery_cancelled') ELSE j.skip_reason END,completed_at=now(),updated_at=now() FROM delivery_outbox o WHERE j.status='delivery_pending' AND j.message_id=o.message_id AND j.recipient_id=o.recipient_id AND o.state IN ('completed','cancelled','terminal_failure') RETURNING j.campaign_id");
  await this.pool.query("UPDATE business_campaigns c SET status='completed',updated_at=now() WHERE c.status IN ('queued','sending') AND NOT EXISTS(SELECT 1 FROM business_campaign_jobs j WHERE j.campaign_id=c.id AND j.status NOT IN ('sent','skipped','failed','cancelled'))");
  return r.rowCount??0;
 }
 async statusSummary(businessAccountId:string,campaignId:string):Promise<{campaign:CampaignDraft;jobs:{queued:number;processing:number;delivery_pending:number;sent:number;skipped:number;failed:number;cancelled:number;total:number};updated_at:Date|null}>{
  if(!businessAccountId||!campaignId)throw new CampaignError("invalid");
  type SummaryRow=CampaignDraft&{queued:number;processing:number;delivery_pending:number;sent:number;skipped:number;failed:number;cancelled:number;total:number;last_job_update:Date|null};
  const result=await this.pool.query<SummaryRow>("SELECT c.id,c.business_account_id,c.title,c.body,c.status,c.created_at,c.updated_at,count(j.id)::int AS total,count(j.id) FILTER(WHERE j.status='queued')::int AS queued,count(j.id) FILTER(WHERE j.status='processing')::int AS processing,count(j.id) FILTER(WHERE j.status='delivery_pending')::int AS delivery_pending,count(j.id) FILTER(WHERE j.status='sent')::int AS sent,count(j.id) FILTER(WHERE j.status='skipped')::int AS skipped,count(j.id) FILTER(WHERE j.status='failed')::int AS failed,count(j.id) FILTER(WHERE j.status='cancelled')::int AS cancelled,max(j.updated_at) AS last_job_update FROM business_campaigns c LEFT JOIN business_campaign_jobs j ON j.campaign_id=c.id AND j.business_account_id=c.business_account_id WHERE c.id=$1 AND c.business_account_id=$2 GROUP BY c.id",[campaignId,businessAccountId]);
  const row=result.rows[0];if(!row)throw new CampaignError("not_found");
  const {queued,processing,delivery_pending,sent,skipped,failed,cancelled,total,last_job_update,...campaign}=row;
  return {campaign,jobs:{queued,processing,delivery_pending,sent,skipped,failed,cancelled,total},updated_at:last_job_update};
 }
 async runWorker(store:Store,signal:AbortSignal):Promise<void>{
  let delayMs=500;
  while(!signal.aborted){
   try{
    await this.processBatch(store,1);
    await this.reconcilePending();
    delayMs=500;
   }catch(error){
    console.error('[campaign-worker] iteration failed',error);
    delayMs=Math.min(delayMs*2,15000);
   }
   await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
 }
}