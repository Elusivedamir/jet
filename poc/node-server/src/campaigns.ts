import { randomUUID } from "node:crypto";
import type { Pool as PoolType } from "pg";
export type CampaignDraft = { id:string; business_account_id:string; title:string; body:string; status:"draft"|"queued"|"sending"|"completed"|"cancelled"; created_at:Date; updated_at:Date };
export type CampaignAudienceRow = { person_id:string; username:string; display_name:string; customer_status:string; eligibility:"eligible"|"excluded"; exclusion_reason:string|null };
export type CampaignJob = { id:string; campaign_id:string; business_account_id:string; recipient_id:string; conversation_id:string; status:string; operation_key:string; attempt_count:number; lease_token:string };
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
  const r=await this.pool.query<CampaignAudienceRow>("SELECT c.person_id,a.username,a.display_name,c.status AS customer_status, CASE WHEN ct.account_low IS NULL THEN 'excluded' WHEN COALESCE(p.enabled,FALSE)=FALSE THEN 'excluded' WHEN COALESCE(s.status,'revoked')<>'granted' THEN 'excluded' ELSE 'eligible' END AS eligibility, CASE WHEN ct.account_low IS NULL THEN 'contact_not_accepted' WHEN COALESCE(p.enabled,FALSE)=FALSE THEN 'global_preference_off' WHEN COALESCE(s.status,'revoked')<>'granted' THEN 'business_consent_missing' ELSE NULL END AS exclusion_reason FROM crm_customers c JOIN accounts a ON a.id=c.person_id LEFT JOIN contacts ct ON ct.account_low=LEAST(c.business_account_id,c.person_id) AND ct.account_high=GREATEST(c.business_account_id,c.person_id) LEFT JOIN business_offer_preferences p ON p.account_id=c.person_id LEFT JOIN business_consent_state s ON s.business_account_id=c.business_account_id AND s.recipient_id=c.person_id WHERE c.business_account_id=$1 ORDER BY eligibility DESC,a.username,c.person_id",[businessAccountId]);
  const recipients=r.rows,eligible=recipients.filter(x=>x.eligibility==="eligible").length;return {campaign,total:recipients.length,eligible,excluded:recipients.length-eligible,recipients};
 }
 // Internal primitive only: no HTTP route until billing, confirmation UX, rate limits and abuse controls exist.
 async enqueueDraft(owner:string,campaignId:string,key:string):Promise<{campaign_id:string;queued:number;skipped:number;replayed:boolean}>{
  if(!owner||!campaignId||!key||key.length>200)throw new CampaignError("invalid");
  const c=await this.pool.connect();
  try{
   await c.query("BEGIN");
   const q=await c.query<{id:string;status:string;enqueue_key:string|null}>("SELECT id,status,enqueue_key FROM business_campaigns WHERE id=$1 AND business_account_id=$2 FOR UPDATE",[campaignId,owner]);
   if(q.rowCount!==1)throw new CampaignError("not_found");
   const campaign=q.rows[0]!;
   if(campaign.status!=="draft"){
    if(campaign.status==="queued"&&campaign.enqueue_key===key){
     const n=await c.query<{queued:number;skipped:number}>("SELECT count(*) FILTER(WHERE status IN ('queued','processing','delivery_pending','sent'))::int AS queued,count(*) FILTER(WHERE status='skipped')::int AS skipped FROM business_campaign_jobs WHERE campaign_id=$1",[campaignId]);
     await c.query("COMMIT");return {campaign_id:campaignId,queued:n.rows[0]!.queued,skipped:n.rows[0]!.skipped,replayed:true};
    }throw new CampaignError("conflict");
   }
   const entitlement=await c.query("SELECT 1 FROM business_entitlements WHERE business_account_id=$1 AND campaigns_enabled=TRUE FOR SHARE",[owner]);
   if(entitlement.rowCount!==1)throw new CampaignError("not_entitled");
   const audience=await c.query<{recipient_id:string;conversation_id:string}>("SELECT c.person_id AS recipient_id,dc.conversation_id FROM crm_customers c JOIN direct_conversations dc ON dc.account_low=LEAST(c.business_account_id,c.person_id) AND dc.account_high=GREATEST(c.business_account_id,c.person_id) WHERE c.business_account_id=$1 ORDER BY c.person_id",[owner]);
   let queued=0,skipped=0;
   for(const a of audience.rows){
    const p=await c.query<{enabled:boolean}>("SELECT enabled FROM business_offer_preferences WHERE account_id=$1 FOR UPDATE",[a.recipient_id]);
    if(!p.rowCount||!p.rows[0]!.enabled){skipped++;continue;}
    const s=await c.query<{status:string}>("SELECT status FROM business_consent_state WHERE business_account_id=$1 AND recipient_id=$2 FOR UPDATE",[owner,a.recipient_id]);
    if(!s.rowCount||s.rows[0]!.status!=="granted"){skipped++;continue;}
    const ct=await c.query("SELECT 1 FROM contacts WHERE account_low=LEAST($1::text,$2::text) AND account_high=GREATEST($1::text,$2::text) FOR KEY SHARE",[owner,a.recipient_id]);
    if(!ct.rowCount){skipped++;continue;}
    const op="campaign:"+campaignId+":"+a.recipient_id;
    const ins=await c.query("INSERT INTO business_campaign_jobs(campaign_id,business_account_id,recipient_id,conversation_id,operation_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(campaign_id,recipient_id) DO NOTHING",[campaignId,owner,a.recipient_id,a.conversation_id,op]);
    if(ins.rowCount===1)queued++;
   }
   await c.query("UPDATE business_campaigns SET status='queued',enqueue_key=$3,updated_at=now() WHERE id=$1 AND business_account_id=$2",[campaignId,owner,key]);
   await c.query("COMMIT");return {campaign_id:campaignId,queued,skipped,replayed:false};
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 }
 async claimJobs(limit=20,leaseMs=15000):Promise<CampaignJob[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>120000)throw new CampaignError("invalid");
  const token=randomUUID();
  const r=await this.pool.query<CampaignJob>("WITH candidates AS (SELECT id FROM business_campaign_jobs WHERE available_at<=now() AND (status='queued' OR (status='processing' AND lease_until<now())) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE business_campaign_jobs j SET status='processing',attempt_count=j.attempt_count+1,lease_until=now()+($2*interval '1 millisecond'),lease_token=$3,updated_at=now() FROM candidates WHERE j.id=candidates.id RETURNING j.id,j.campaign_id,j.business_account_id,j.recipient_id,j.conversation_id,j.status,j.operation_key,j.attempt_count,j.lease_token",[limit,leaseMs,token]);return r.rows;
 }
 async attachMessage(jobId:string,token:string,messageId:string):Promise<void>{
  const r=await this.pool.query("UPDATE business_campaign_jobs SET status='delivery_pending',message_id=$3,lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=$1 AND status='processing' AND lease_token=$2 AND lease_until>clock_timestamp()",[jobId,token,messageId]);if(r.rowCount!==1)throw new CampaignError("conflict");
 }
 async reconcileDelivery(jobId:string,messageId:string,state:"completed"|"cancelled"|"terminal_failure"):Promise<void>{
  const status=state==="completed"?"sent":state==="cancelled"?"skipped":"failed",reason=state==="cancelled"?"delivery_cancelled":null;
  const r=await this.pool.query("UPDATE business_campaign_jobs SET status=$3,skip_reason=$4,completed_at=now(),updated_at=now() WHERE id=$1 AND message_id=$2 AND status='delivery_pending'",[jobId,messageId,status,reason]);if(r.rowCount!==1)throw new CampaignError("conflict");
 }
}