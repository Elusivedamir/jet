import { after,before,test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
const { Pool }=pg;
import { ConsentStore,ConsentError } from "../src/consent.js";

const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
const consent=new ConsentStore(pool);
const business=randomUUID();
const recipient=randomUUID();
const outsider=randomUUID();

before(async()=>{
  const schema=await readFile(new URL("../schema.sql",import.meta.url),"utf8");
  for(const statement of schema.split(";").map(s=>s.trim()).filter(Boolean)) await pool.query(statement);
  await pool.query("TRUNCATE business_consent_events,business_consent_state,business_offer_preference_events,business_offer_preferences,contacts,accounts CASCADE");
  await pool.query(
    "INSERT INTO accounts(id,username,password_hash,display_name) VALUES($1,'business','test-hash','Business'),($2,'recipient','test-hash','Recipient'),($3,'outsider','test-hash','Outsider')",
    [business,recipient,outsider]
  );
  const [low,high]=[business,recipient].sort();
  await pool.query("INSERT INTO contacts(account_low,account_high) VALUES($1,$2)",[low,high]);
});
after(async()=>pool.end());

test("business offers are off by default and global opt-in alone grants no sender consent",async()=>{
  const pref=await consent.getOfferPreference(recipient);
  assert.equal(pref.enabled,false);
  assert.equal(await consent.isEligibleForBusinessOffers(business,recipient),false);
  await assert.rejects(
    ()=>consent.setBusinessConsent(recipient,business,true),
    error=>error instanceof ConsentError && error.code==="preference_disabled"
  );
  await consent.setOfferPreference(recipient,true);
  assert.equal(await consent.isEligibleForBusinessOffers(business,recipient),false);
});

test("only recipient can grant/revoke per-business consent and dispatch eligibility is rechecked",async()=>{
  await consent.setOfferPreference(recipient,true);
  const granted=await consent.setBusinessConsent(recipient,business,true);
  assert.equal(granted.status,"granted");
  assert.equal(await consent.isEligibleForBusinessOffers(business,recipient),true);
  assert.equal((await consent.listBusinessConsents(recipient)).length,1);
  await assert.rejects(
    ()=>consent.setBusinessConsent(outsider,business,true),
    error=>error instanceof ConsentError && error.code==="not_found"
  );
  await consent.setOfferPreference(recipient,false);
  assert.equal(await consent.isEligibleForBusinessOffers(business,recipient),false);
  assert.equal((await consent.getBusinessConsent(recipient,business))?.status,"revoked");
  await consent.setOfferPreference(recipient,true);
  assert.equal(await consent.isEligibleForBusinessOffers(business,recipient),false,
    "re-enabling the master switch must not restore revoked sender consents");
  const revoked=await consent.setBusinessConsent(recipient,business,false);
  assert.equal(revoked.status,"revoked");
});
