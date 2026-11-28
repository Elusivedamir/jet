import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { Pool as PoolType } from "pg";

const KEY_LENGTH=64;
const SCRYPT_OPTIONS={N:32768,r:8,p:1,maxmem:64*1024*1024};
const SESSION_TTL_DAYS=30;
const scrypt=(password:string,salt:Buffer):Promise<Buffer>=>new Promise((resolve,reject)=>{
  scryptCallback(password,salt,KEY_LENGTH,SCRYPT_OPTIONS,(error,key)=>{
    if(error)reject(error);else resolve(key as Buffer);
  });
});

export type PublicAccount={id:string;username:string;display_name:string;created_at:Date};
export type AuthResult={account:PublicAccount;token:string;expires_at:Date};

export class AuthError extends Error {
  constructor(readonly code:"invalid"|"exists"|"credentials"|"unauthorized"|"rate_limited") {super(code);}
}

function tokenDigest(token:string):string {
  return createHash("sha256").update(token,"utf8").digest("hex");
}
async function passwordHash(password:string):Promise<string> {
  const salt=randomBytes(16);
  const key=await scrypt(password,salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
async function passwordMatches(password:string,encoded:string):Promise<boolean> {
  const parts=encoded.split("$");
  if(parts.length!==3||parts[0]!=="scrypt") return false;
  try {
    const salt=Buffer.from(parts[1]!,"base64url");
    const expected=Buffer.from(parts[2]!,"base64url");
    if(salt.length!==16||expected.length!==KEY_LENGTH)return false;
    const actual=await scrypt(password,salt);
    return timingSafeEqual(actual,expected);
  } catch {return false;}
}
function validateCredentials(username:string,password:string,displayName?:string) {
  if(!/^[a-zA-Z0-9_]{3,24}$/.test(username) || password.length<12 || password.length>128 ||
     (displayName!==undefined && (displayName.trim().length<1||displayName.trim().length>48))) {
    throw new AuthError("invalid");
  }
}

export class AuthStore {
  constructor(readonly pool:PoolType) {}

  async register(usernameInput:string,password:string,displayNameInput:string):Promise<AuthResult> {
    const username=usernameInput.trim().toLowerCase();
    const displayName=displayNameInput.trim();
    validateCredentials(username,password,displayName);
    const hash=await passwordHash(password);
    const token=randomBytes(32).toString("base64url");
    const digest=tokenDigest(token);
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      const inserted=await c.query<PublicAccount>(
        "INSERT INTO accounts(username,password_hash,display_name) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING RETURNING id,username,display_name,created_at",
        [username,hash,displayName]);
      if(inserted.rowCount!==1) throw new AuthError("exists");
      const expires=await c.query<{expires_at:Date}>(
        "INSERT INTO sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+($3 * interval '1 day')) RETURNING expires_at",
        [digest,inserted.rows[0]!.id,SESSION_TTL_DAYS]);
      await c.query("COMMIT");
      return {account:inserted.rows[0]!,token,expires_at:expires.rows[0]!.expires_at};
    } catch(e) {await c.query("ROLLBACK");throw e;}
    finally {c.release();}
  }

  async login(usernameInput:string,password:string):Promise<AuthResult> {
    const username=usernameInput.trim().toLowerCase();
    if(!/^[a-zA-Z0-9_]{3,24}$/.test(username)||password.length<1||password.length>128) throw new AuthError("credentials");
    const usernameKey=createHash("sha256").update(username,"utf8").digest("hex");
    // Bound storage for arbitrary usernames while retaining a durable, atomic bucket per normalized username.
    await this.pool.query("DELETE FROM auth_login_limits WHERE updated_at<now()-interval '1 day'");
    const rate=await this.pool.query<{blocked:boolean}>(`INSERT INTO auth_login_limits(username_key,window_started_at,attempts,updated_at)
      VALUES($1,now(),1,now())
      ON CONFLICT(username_key) DO UPDATE SET
        attempts=CASE
          WHEN auth_login_limits.blocked_until>now() THEN auth_login_limits.attempts
          WHEN auth_login_limits.window_started_at<=now()-interval '15 minutes' THEN 1
          ELSE auth_login_limits.attempts+1 END,
        window_started_at=CASE
          WHEN auth_login_limits.blocked_until>now() THEN auth_login_limits.window_started_at
          WHEN auth_login_limits.window_started_at<=now()-interval '15 minutes' THEN now()
          ELSE auth_login_limits.window_started_at END,
        blocked_until=CASE
          WHEN auth_login_limits.blocked_until>now() THEN auth_login_limits.blocked_until
          WHEN auth_login_limits.window_started_at<=now()-interval '15 minutes' THEN NULL
          WHEN auth_login_limits.attempts>=10 THEN now()+interval '15 minutes'
          ELSE NULL END,
        updated_at=now()
      RETURNING COALESCE(blocked_until>now(),FALSE) AS blocked`,[usernameKey]);
    if(rate.rows[0]!.blocked)throw new AuthError("rate_limited");
    const result=await this.pool.query<PublicAccount & {password_hash:string}>(
      "SELECT id,username,display_name,created_at,password_hash FROM accounts WHERE username=$1",[username]);
    const row=result.rows[0];
    if(!row || !(await passwordMatches(password,row.password_hash))) throw new AuthError("credentials");
    const token=randomBytes(32).toString("base64url");
    const expires=(await this.pool.query<{expires_at:Date}>(
      "INSERT INTO sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+($3 * interval '1 day')) RETURNING expires_at",
      [tokenDigest(token),row.id,SESSION_TTL_DAYS])).rows[0]!.expires_at;
    await this.pool.query("DELETE FROM auth_login_limits WHERE username_key=$1",[usernameKey]);
    const {password_hash:_,...account}=row;
    return {account,token,expires_at:expires};
  }

  async authenticate(token:string):Promise<PublicAccount|null> {
    if(!/^[A-Za-z0-9_-]{40,64}$/.test(token))return null;
    const result=await this.pool.query<PublicAccount>(
      `SELECT a.id,a.username,a.display_name,a.created_at
       FROM sessions s JOIN accounts a ON a.id=s.account_id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`,
      [tokenDigest(token)]);
    return result.rows[0]??null;
  }

  async logout(token:string):Promise<void> {
    await this.pool.query("UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL",[tokenDigest(token)]);
  }

  async me(accountId:string):Promise<PublicAccount|null> {
    const result=await this.pool.query<PublicAccount>(
      "SELECT id,username,display_name,created_at FROM accounts WHERE id=$1",[accountId]);
    return result.rows[0]??null;
  }
}
