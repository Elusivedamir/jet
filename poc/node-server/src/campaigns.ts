import type { Pool as PoolType } from "pg";

export type CampaignDraft = { id:string; business_account_id:string; title:string; body:string; status:"draft"; created_at:Date; updated_at:Date };
export type CampaignAudienceRow = { person_id:string; username:string; display_name:string; customer_status:string; eligibility:"eligible"|"excluded"; exclusion_reason:string|null };
export class CampaignError extends Error { constructor(readonly code:"invalid"|"not_found") { super(code); } }

export class CampaignStore {
  constructor(readonly pool:PoolType) {}

  async createDraft(businessAccountId:string,titleInput:string,bodyInput:string):Promise<CampaignDraft> {
    const title=titleInput.trim(), body=bodyInput.trim();
    if(!businessAccountId || title.length<1 || title.length>100 || body.length<1 || body.length>4000) throw new CampaignError("invalid");
    const result=await this.pool.query<CampaignDraft>(
      "INSERT INTO business_campaigns(business_account_id,title,body) VALUES($1,$2,$3) RETURNING id,business_account_id,title,body,status,created_at,updated_at",
      [businessAccountId,title,body]);
    return result.rows[0]!;
  }

  async listDrafts(businessAccountId:string):Promise<CampaignDraft[]> {
    if(!businessAccountId) throw new CampaignError("invalid");
    const result=await this.pool.query<CampaignDraft>(
      "SELECT id,business_account_id,title,body,status,created_at,updated_at FROM business_campaigns WHERE business_account_id=$1 ORDER BY updated_at DESC,id",
      [businessAccountId]);
    return result.rows;
  }

  async preview(businessAccountId:string,campaignId:string):Promise<{campaign:CampaignDraft;total:number;eligible:number;excluded:number;recipients:CampaignAudienceRow[]}> {
    if(!businessAccountId || !campaignId) throw new CampaignError("invalid");
    const draft=await this.pool.query<CampaignDraft>(
      "SELECT id,business_account_id,title,body,status,created_at,updated_at FROM business_campaigns WHERE id=$1 AND business_account_id=$2",
      [campaignId,businessAccountId]);
    const campaign=draft.rows[0];
    if(!campaign) throw new CampaignError("not_found");
    const result=await this.pool.query<CampaignAudienceRow>(
      "SELECT c.person_id,a.username,a.display_name,c.status AS customer_status, CASE WHEN ct.account_low IS NULL THEN 'excluded' WHEN COALESCE(p.enabled,FALSE)=FALSE THEN 'excluded' WHEN COALESCE(s.status,'revoked')<>'granted' THEN 'excluded' ELSE 'eligible' END AS eligibility, CASE WHEN ct.account_low IS NULL THEN 'contact_not_accepted' WHEN COALESCE(p.enabled,FALSE)=FALSE THEN 'global_preference_off' WHEN COALESCE(s.status,'revoked')<>'granted' THEN 'business_consent_missing' ELSE NULL END AS exclusion_reason FROM crm_customers c JOIN accounts a ON a.id=c.person_id LEFT JOIN contacts ct ON ct.account_low=LEAST(c.business_account_id,c.person_id) AND ct.account_high=GREATEST(c.business_account_id,c.person_id) LEFT JOIN business_offer_preferences p ON p.account_id=c.person_id LEFT JOIN business_consent_state s ON s.business_account_id=c.business_account_id AND s.recipient_id=c.person_id WHERE c.business_account_id=$1 ORDER BY eligibility DESC,a.username,c.person_id
      [businessAccountId]);
    const recipients=result.rows;
    const eligible=recipients.filter(row=>row.eligibility==="eligible").length;
    return {campaign,total:recipients.length,eligible,excluded:recipients.length-eligible,recipients};
  }
}