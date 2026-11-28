import type { Pool as PoolType } from "pg";

export type BusinessOfferPreference = { account_id:string; enabled:boolean; version:number; updated_at:Date };
export type BusinessConsent = {
  business_account_id:string;
  business_username:string;
  business_display_name:string;
  status:"granted"|"revoked";
  policy_version:string;
  source:string;
  version:number;
  updated_at:Date;
};
export class ConsentError extends Error {
  constructor(readonly code:"invalid"|"not_found"|"preference_disabled") { super(code); }
}
const POLICY_VERSION="business-offers-v1";

export class ConsentStore {
  constructor(readonly pool:PoolType) {}

  async getOfferPreference(accountId:string):Promise<BusinessOfferPreference> {
    if(!accountId) throw new ConsentError("invalid");
    const result=await this.pool.query<BusinessOfferPreference>(
      `SELECT account_id,enabled,version,updated_at
       FROM business_offer_preferences WHERE account_id=$1`,[accountId]
    );
    return result.rows[0]??{account_id:accountId,enabled:false,version:0,updated_at:new Date(0)};
  }

  async setOfferPreference(accountId:string,enabled:boolean):Promise<BusinessOfferPreference> {
    if(!accountId||typeof enabled!=="boolean") throw new ConsentError("invalid");
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      const result=await c.query<BusinessOfferPreference>(
        `INSERT INTO business_offer_preferences(account_id,enabled)
         VALUES($1,$2)
         ON CONFLICT(account_id) DO UPDATE SET
           enabled=EXCLUDED.enabled,
           version=business_offer_preferences.version+1,
           updated_at=now()
         RETURNING account_id,enabled,version,updated_at`,[accountId,enabled]
      );
      const preference=result.rows[0]!;
      await c.query(
        "INSERT INTO business_offer_preference_events(account_id,enabled,version) VALUES($1,$2,$3)",
        [accountId,enabled,preference.version]
      );
      if(!enabled) {
        const revoked=await c.query<{business_account_id:string;version:string}>(
          `UPDATE business_consent_state SET status='revoked',source='global_preference_off',
             version=version+1,updated_at=now()
           WHERE recipient_id=$1 AND status='granted'
           RETURNING business_account_id,version`,[accountId]
        );
        for(const row of revoked.rows) {
          await c.query(
            `INSERT INTO business_consent_events
             (business_account_id,recipient_id,action,policy_version,source,actor_id,version)
             VALUES($1,$2,'revoked',$3,'global_preference_off',$2,$4)`,
            [row.business_account_id,accountId,POLICY_VERSION,row.version]
          );
        }
      }
      await c.query("COMMIT");
      return preference;
    } catch(error) {
      await c.query("ROLLBACK");
      throw error;
    } finally { c.release(); }
  }

  async setBusinessConsent(recipientId:string,businessAccountId:string,granted:boolean):Promise<BusinessConsent> {
    if(!recipientId||!businessAccountId||recipientId===businessAccountId||typeof granted!=="boolean")
      throw new ConsentError("invalid");
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      if(granted) {
        const preference=await c.query(
          "SELECT 1 FROM business_offer_preferences WHERE account_id=$1 AND enabled=TRUE FOR SHARE",
          [recipientId]
        );
        if(!preference.rowCount) throw new ConsentError("preference_disabled");
      }
      const low=recipientId<businessAccountId?recipientId:businessAccountId;
      const high=recipientId<businessAccountId?businessAccountId:recipientId;
      const contact=await c.query(
        "SELECT 1 FROM contacts WHERE account_low=$1 AND account_high=$2 FOR KEY SHARE",[low,high]
      );
      if(!contact.rowCount) throw new ConsentError("not_found");
      const status=granted?"granted":"revoked";
      const source="user_settings";
      const state=await c.query<{version:string}>(
        `INSERT INTO business_consent_state
         (business_account_id,recipient_id,status,policy_version,source,version)
         VALUES($1,$2,$3,$4,$5,1)
         ON CONFLICT(business_account_id,recipient_id) DO UPDATE SET
           status=EXCLUDED.status,policy_version=EXCLUDED.policy_version,
           source=EXCLUDED.source,version=business_consent_state.version+1,updated_at=now()
         RETURNING version`,
        [businessAccountId,recipientId,status,POLICY_VERSION,source]
      );
      const version=Number(state.rows[0]!.version);
      await c.query(
        `INSERT INTO business_consent_events
         (business_account_id,recipient_id,action,policy_version,source,actor_id,version)
         VALUES($1,$2,$3,$4,$5,$2,$6)`,
        [businessAccountId,recipientId,status,POLICY_VERSION,source,version]
      );
      await c.query("COMMIT");
      return (await this.getBusinessConsent(recipientId,businessAccountId))!;
    } catch(error) {
      await c.query("ROLLBACK");
      throw error;
    } finally { c.release(); }
  }

  async getBusinessConsent(recipientId:string,businessAccountId:string):Promise<BusinessConsent|null> {
    if(!recipientId||!businessAccountId) throw new ConsentError("invalid");
    const result=await this.pool.query<BusinessConsent>(
      `SELECT s.business_account_id,a.username AS business_username,
         a.display_name AS business_display_name,s.status,s.policy_version,s.source,
         s.version,s.updated_at
       FROM business_consent_state s JOIN accounts a ON a.id=s.business_account_id
       WHERE s.recipient_id=$1 AND s.business_account_id=$2`,
      [recipientId,businessAccountId]
    );
    return result.rows[0]??null;
  }

  async listBusinessConsents(recipientId:string):Promise<BusinessConsent[]> {
    if(!recipientId) throw new ConsentError("invalid");
    const result=await this.pool.query<BusinessConsent>(
      `SELECT s.business_account_id,a.username AS business_username,
         a.display_name AS business_display_name,s.status,s.policy_version,s.source,
         s.version,s.updated_at
       FROM business_consent_state s JOIN accounts a ON a.id=s.business_account_id
       WHERE s.recipient_id=$1 ORDER BY s.updated_at DESC,s.business_account_id`,
      [recipientId]
    );
    return result.rows;
  }

  // Campaign workers must call this at dispatch time, not rely on a preview snapshot.
  async isEligibleForBusinessOffers(businessAccountId:string,recipientId:string):Promise<boolean> {
    const result=await this.pool.query(
      `SELECT 1
       FROM business_offer_preferences p
       JOIN business_consent_state s
         ON s.recipient_id=p.account_id AND s.business_account_id=$1 AND s.status='granted'
       JOIN contacts c
         ON c.account_low=LEAST($1,$2) AND c.account_high=GREATEST($1,$2)
       WHERE p.account_id=$2 AND p.enabled=TRUE`,
      [businessAccountId,recipientId]
    );
    return !!result.rowCount;
  }
}
