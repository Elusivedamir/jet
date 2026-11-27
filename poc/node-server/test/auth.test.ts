import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import pg from "pg";
const {Pool}=pg;
import {AuthStore,AuthError} from "../src/auth.js";

const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
const auth=new AuthStore(pool);
before(async()=>{
 const schema=await readFile(new URL("../schema.sql",import.meta.url),"utf8");
 for(const statement of schema.split(";").map(s=>s.trim()).filter(Boolean))await pool.query(statement);
 await pool.query("TRUNCATE sessions,accounts CASCADE");
});
after(async()=>pool.end());

test("registration stores only a password hash and issues an opaque session",async()=>{
 const username="user_"+randomBytes(5).toString("hex");
 const password="correct horse battery staple 2026";
 const result=await auth.register(username,password,"Test User");
 assert.equal(result.account.username,username);
 assert.ok(result.token.length>=40);
 assert.notEqual(result.token,password);
 const stored=await pool.query("SELECT password_hash FROM accounts WHERE id=$1",[result.account.id]);
 assert.match(stored.rows[0]!.password_hash,/^scrypt\$/);
 assert.notEqual(stored.rows[0]!.password_hash,password);
 assert.equal((await auth.authenticate(result.token))?.id,result.account.id);
});

test("duplicate usernames are rejected without creating another account",async()=>{
 const username="dup_"+randomBytes(5).toString("hex");
 await auth.register(username,"a sufficiently long password","First");
 await assert.rejects(()=>auth.register(username,"another sufficiently long password","Second"),(error)=>error instanceof AuthError&&error.code==="exists");
 const count=await pool.query("SELECT count(*)::int AS n FROM accounts WHERE username=$1",[username]);
 assert.equal(count.rows[0]!.n,1);
});

test("login rejects wrong passwords and logout revokes the session",async()=>{
 const username="login_"+randomBytes(5).toString("hex");
 const password="long enough passphrase 123";
 const created=await auth.register(username,password,"Login User");
 await assert.rejects(()=>auth.login(username,"wrong password"),(error)=>error instanceof AuthError&&error.code==="credentials");
 const login=await auth.login(username,password);
 assert.equal((await auth.authenticate(login.token))?.id,created.account.id);
 await auth.logout(login.token);
 assert.equal(await auth.authenticate(login.token),null);
});

test("registration enforces username and password policy",async()=>{
 await assert.rejects(()=>auth.register("x","short","Name"),(error)=>error instanceof AuthError&&error.code==="invalid");
});
