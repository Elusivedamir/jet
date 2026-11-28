import type { Pool as PoolType } from "pg";

export type CrmStatus = "new" | "active" | "follow_up" | "customer" | "archived";
export type CrmCustomer = {
  id: string;
  person_id: string;
  username: string;
  display_name: string;
  status: CrmStatus;
  conversation_id: string | null;
  created_at: Date;
  updated_at: Date;
};
export type CrmNote = {
  id: string;
  customer_id: string;
  author_id: string;
  body: string;
  created_at: Date;
};
export class CrmError extends Error {
  constructor(readonly code: "invalid" | "not_found" | "forbidden") { super(code); }
}
const statuses = new Set<CrmStatus>(["new","active","follow_up","customer","archived"]);

export class CrmStore {
  constructor(readonly pool: PoolType) {}

  async createCustomer(businessAccountId: string, usernameInput: string): Promise<CrmCustomer> {
    const username = usernameInput.trim().toLowerCase();
    if (!businessAccountId || !/^[a-z0-9_]{3,24}$/.test(username)) throw new CrmError("invalid");
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const person = await c.query<{id:string}>("SELECT id FROM accounts WHERE username=$1",[username]);
      const personId = person.rows[0]?.id;
      if (!personId || personId === businessAccountId) throw new CrmError("not_found");
      const low = businessAccountId < personId ? businessAccountId : personId;
      const high = businessAccountId < personId ? personId : businessAccountId;
      const contact = await c.query("SELECT 1 FROM contacts WHERE account_low=$1 AND account_high=$2",[low,high]);
      if (!contact.rowCount) throw new CrmError("not_found");
      const result = await c.query<CrmCustomer>(
        `INSERT INTO crm_customers(business_account_id,person_id)
         VALUES($1,$2) ON CONFLICT(business_account_id,person_id)
         DO UPDATE SET updated_at=crm_customers.updated_at
         RETURNING id,person_id,' '::text AS username,' '::text AS display_name,status,created_at,updated_at`,
        [businessAccountId,personId]
      );
      const card = result.rows[0]!;
      const profile = await c.query<{username:string;display_name:string;conversation_id:string|null}>(
        `SELECT a.username,a.display_name,dc.conversation_id
         FROM accounts a LEFT JOIN direct_conversations dc
           ON dc.account_low=$1 AND dc.account_high=$2
         WHERE a.id=$2`,[low,high]
      );
      await c.query("COMMIT");
      return {...card,username:profile.rows[0]!.username,display_name:profile.rows[0]!.display_name,conversation_id:profile.rows[0]!.conversation_id};
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally { c.release(); }
  }

  async listCustomers(businessAccountId: string): Promise<CrmCustomer[]> {
    if (!businessAccountId) throw new CrmError("invalid");
    const result = await this.pool.query<CrmCustomer>(
      `SELECT c.id,c.person_id,a.username,a.display_name,c.status,dc.conversation_id,c.created_at,c.updated_at
       FROM crm_customers c JOIN accounts a ON a.id=c.person_id
       LEFT JOIN direct_conversations dc
         ON dc.account_low=LEAST(c.business_account_id,c.person_id)
        AND dc.account_high=GREATEST(c.business_account_id,c.person_id)
       WHERE c.business_account_id=$1
       ORDER BY c.updated_at DESC,c.id`,[businessAccountId]
    );
    return result.rows;
  }

  async updateStatus(businessAccountId: string, customerId: string, statusInput: string): Promise<CrmCustomer> {
    if (!businessAccountId || !customerId || !statuses.has(statusInput as CrmStatus)) throw new CrmError("invalid");
    const result = await this.pool.query<CrmCustomer>(
      `UPDATE crm_customers c SET status=$3,updated_at=now()
       FROM accounts a WHERE c.id=$1 AND c.business_account_id=$2 AND a.id=c.person_id
       RETURNING c.id,c.person_id,a.username,a.display_name,c.status,c.created_at,c.updated_at,
         (SELECT dc.conversation_id FROM direct_conversations dc
          WHERE dc.account_low=LEAST(c.business_account_id,c.person_id)
            AND dc.account_high=GREATEST(c.business_account_id,c.person_id)) AS conversation_id`,
      [customerId,businessAccountId,statusInput]
    );
    if (!result.rowCount) throw new CrmError("not_found");
    return result.rows[0]!;
  }

  async addNote(businessAccountId: string, customerId: string, bodyInput: string): Promise<CrmNote> {
    const body = bodyInput.trim();
    if (!businessAccountId || !customerId || body.length < 1 || body.length > 4000) throw new CrmError("invalid");
    const result = await this.pool.query<CrmNote>(
      `INSERT INTO crm_notes(customer_id,business_account_id,author_id,body)
       SELECT id,business_account_id,$1,$3 FROM crm_customers
       WHERE id=$2 AND business_account_id=$1
       RETURNING id,customer_id,author_id,body,created_at`,
      [businessAccountId,customerId,body]
    );
    if (!result.rowCount) throw new CrmError("not_found");
    return result.rows[0]!;
  }

  async listNotes(businessAccountId: string, customerId: string): Promise<CrmNote[]> {
    if (!businessAccountId || !customerId) throw new CrmError("invalid");
    const owner = await this.pool.query(
      "SELECT 1 FROM crm_customers WHERE id=$1 AND business_account_id=$2",
      [customerId,businessAccountId]
    );
    if (!owner.rowCount) throw new CrmError("not_found");
    const result = await this.pool.query<CrmNote>(
      `SELECT id,customer_id,author_id,body,created_at FROM crm_notes
       WHERE customer_id=$1 AND business_account_id=$2 ORDER BY created_at DESC,id`,
      [customerId,businessAccountId]
    );
    return result.rows;
  }
}
