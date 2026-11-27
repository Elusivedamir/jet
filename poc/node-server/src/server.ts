import { createServer, IncomingMessage, ServerResponse } from "node:http";
import pg from "pg";
const { Pool } = pg;
import { Store, ConflictError, NotMemberError, ForbiddenError, InvalidRequestError } from "./store.js";
import { AuthStore, AuthError } from "./auth.js";
import { ContactsStore, ContactError } from "./contacts.js";
import { ChannelsStore, ChannelError } from "./channels.js";

const pool = new Pool({connectionString:process.env.DATABASE_URL});
const store = new Store(pool);
const auth = new AuthStore(pool);
const contacts = new ContactsStore(pool);
const channels = new ChannelsStore(pool);
const schema = await (await import("node:fs/promises")).readFile(new URL("../schema.sql",import.meta.url),"utf8");
for (const statement of schema.split(";").map(s=>s.trim()).filter(Boolean)) await pool.query(statement);
const abort = new AbortController();
void store.runWorker(abort.signal);

function bearer(req:IncomingMessage):string {
  const value=req.headers.authorization;
  const match=typeof value==="string"?value.match(/^Bearer ([A-Za-z0-9_-]{40,64})$/):null;
  return match?.[1]??"";
}
// Test-only identity shim. It is disabled by default and cannot run in production.
async function account(req:IncomingMessage):Promise<string> {
  const token=bearer(req);
  if(token) return (await auth.authenticate(token))?.id??"";
  if(process.env.NODE_ENV==="production" || process.env.JETSON_ALLOW_TEST_IDENTITY!=="true") return "";
  const value=req.headers["x-test-account"];
  return typeof value==="string"?value.trim():"";
}
function json(res:ServerResponse,status:number,value:unknown) {
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store","pragma":"no-cache"});
  res.end(JSON.stringify(value));
}
async function body(req:IncomingMessage):Promise<Record<string,unknown>> {
  if(!req.headers["content-type"]?.toLowerCase().startsWith("application/json")) throw new InvalidRequestError();
  const chunks:Buffer[]=[];
  let size=0;
  for await (const chunk of req) {
    const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    size+=part.length;
    if(size>65536) throw new InvalidRequestError();
    chunks.push(part);
  }
  let parsed:unknown;
  try { parsed=JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new InvalidRequestError(); }
  if(!parsed || typeof parsed!=="object" || Array.isArray(parsed)) throw new InvalidRequestError();
  return parsed as Record<string,unknown>;
}
function requiredString(input:Record<string,unknown>,key:string,max:number):string {
  const value=input[key];
  if(typeof value!=="string"||value.length<1||value.length>max)throw new InvalidRequestError();
  return value;
}
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url??"/","http://localhost");
    if(req.method==="GET" && url.pathname==="/healthz"){res.writeHead(204);res.end();return;}

    if(req.method==="POST" && url.pathname==="/v1/auth/register") {
      const input=await body(req);
      const result=await auth.register(requiredString(input,"username",24),requiredString(input,"password",128),requiredString(input,"display_name",48));
      json(res,201,{account:result.account,access_token:result.token,token_type:"Bearer",expires_at:result.expires_at});return;
    }
    if(req.method==="POST" && url.pathname==="/v1/auth/login") {
      const input=await body(req);
      const result=await auth.login(requiredString(input,"username",24),requiredString(input,"password",128));
      json(res,200,{account:result.account,access_token:result.token,token_type:"Bearer",expires_at:result.expires_at});return;
    }

    const user=await account(req);
    if(!user){json(res,401,{error:"authentication required"});return;}
    if(req.method==="GET" && url.pathname==="/v1/me") {
      const me=await auth.me(user);
      if(!me){json(res,401,{error:"authentication required"});return;}
      json(res,200,{account:me});return;
    }
    if(req.method==="POST" && url.pathname==="/v1/auth/logout") {
      const token=bearer(req);
      if(token)await auth.logout(token);
      res.writeHead(204,{"cache-control":"no-store"});res.end();return;
    }
    if(req.method==="GET" && url.pathname==="/v1/users/search") {
      const q=url.searchParams.get("q")??"";
      json(res,200,await contacts.search(user,q));return;
    }
    if(req.method==="POST" && url.pathname==="/v1/contacts/requests") {
      const input=await body(req);
      const request=await contacts.request(user,requiredString(input,"username",24));
      json(res,201,{request});return;
    }
    if(req.method==="GET" && url.pathname==="/v1/contacts/requests") {
      json(res,200,await contacts.requests(user));return;
    }
    const decline=url.pathname.match(/^\/v1\/contacts\/requests\/([^/]+)\/decline$/);
    if(req.method==="POST" && decline) {
      await contacts.decline(user,decodeURIComponent(decline[1]!));
      res.writeHead(204);res.end();return;
    }
    const accept=url.pathname.match(/^\/v1\/contacts\/requests\/([^/]+)\/accept$/);
    if(req.method==="POST" && accept) {
      const result=await contacts.accept(user,decodeURIComponent(accept[1]!));
      json(res,200,result);return;
    }
    if(req.method==="GET" && url.pathname==="/v1/contacts") {
      json(res,200,await contacts.list(user));return;
    }
    if(req.method==="GET" && url.pathname==="/v1/channels/search") {
      json(res,200,await channels.search(url.searchParams.get("q")??""));return;
    }
    if(req.method==="POST" && url.pathname==="/v1/channels") {
      const input=await body(req);
      const description=input.description===undefined ? "" : typeof input.description==="string" ? input.description : (()=>{throw new InvalidRequestError();})();
      const channel=await channels.create(user,requiredString(input,"title",80),requiredString(input,"slug",32),
        typeof input.visibility==="string" ? input.visibility : "",description);
      json(res,201,channel);return;
    }
    const channelAdmins=url.pathname.match(/^\/v1\/channels\/([^/]+)\/admins$/);
    if(req.method==="POST" && channelAdmins) {
      const input=await body(req);
      await channels.addAdmin(user,decodeURIComponent(channelAdmins[1]!),requiredString(input,"username",24));
      res.writeHead(204);res.end();return;
    }
    const channelMembership=url.pathname.match(/^\/v1\/channels\/([^/]+)\/membership$/);
    if(req.method==="DELETE" && channelMembership) {
      await channels.leave(user,decodeURIComponent(channelMembership[1]!));
      res.writeHead(204);res.end();return;
    }
    const joinChannel=url.pathname.match(/^\/v1\/channels\/([^/]+)\/join$/);
    if(req.method==="POST" && joinChannel) {
      const input=await body(req);
      const inviteCode=input.invite_code===undefined ? "" : typeof input.invite_code==="string" ? input.invite_code : (()=>{throw new InvalidRequestError();})();
      json(res,200,await channels.join(user,decodeURIComponent(joinChannel[1]!),inviteCode));return;
    }
    if(req.method==="POST" && url.pathname==="/v1/conversations/groups") {
      const input=await body(req);
      if(!Array.isArray(input.usernames) || input.usernames.some(value=>typeof value!=="string")) throw new InvalidRequestError();
      const group=await contacts.createGroup(user,requiredString(input,"title",80),input.usernames as string[]);
      json(res,201,group);return;
    }
    if(req.method==="GET" && url.pathname==="/v1/conversations") {
      json(res,200,await contacts.conversations(user));return;
    }
    if(req.method==="POST" && url.pathname==="/v1/conversations/direct") {
      const input=await body(req);
      const conversation_id=await contacts.directConversation(user,requiredString(input,"username",24));
      json(res,200,{conversation_id});return;
    }
    const match=url.pathname.match(/^\/v1\/conversations\/([^/]+)\/messages$/);
    if(req.method==="POST" && match) {
      const input=await body(req);
      if(typeof input.operation_key!=="string" || typeof input.payload!=="string" ||
         input.operation_key.length<1 || input.operation_key.length>200 ||
         input.payload.length<1 || input.payload.length>32768) throw new InvalidRequestError();
      const message=await store.send(user,decodeURIComponent(match[1]!),input.operation_key,input.payload);
      json(res,202,message);return;
    }
    if(req.method==="GET" && match) {
      const after=Number(url.searchParams.get("after")??0);
      if(!Number.isSafeInteger(after)||after<0) throw new InvalidRequestError();
      const messages=await store.history(user,decodeURIComponent(match[1]!),after,50);
      json(res,200,messages);return;
    }
    const events=url.pathname.match(/^\/v1\/conversations\/([^/]+)\/events$/);
    if(req.method==="GET" && events) {
      const conversation=decodeURIComponent(events[1]!);
      let cursor=Number(req.headers["last-event-id"]??url.searchParams.get("after")??0);
      if(!Number.isSafeInteger(cursor)||cursor<0)throw new InvalidRequestError();
      // Verify membership before opening a long-lived stream.
      await store.inbox(user,conversation,cursor,1);
      res.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-cache","connection":"keep-alive","x-accel-buffering":"no"});
      const timer=setInterval(async()=>{
        try {
          const messages=await store.inbox(user,conversation,cursor,50);
          for(const message of messages){res.write(`id: ${message.position}\nevent: message\ndata: ${JSON.stringify(message)}\n\n`);cursor=Number(message.position);}
          if(!messages.length)res.write(": keepalive\n\n");
        } catch { clearInterval(timer);res.end(); }
      },750);
      res.on("close",()=>clearInterval(timer));
      return;
    }
    const ack=url.pathname.match(/^\/v1\/messages\/([^/]+)\/ack$/);
    if(req.method==="POST" && ack) {
      await store.acknowledge(user,decodeURIComponent(ack[1]!));res.writeHead(204);res.end();return;
    }
    json(res,404,{error:"not found"});
  } catch(e) {
    if(e instanceof ChannelError) {
      if(e.code==="invalid") json(res,400,{error:"invalid channel data"});
      else if(e.code==="exists") json(res,409,{error:"channel slug unavailable"});
      else if(e.code==="forbidden") json(res,403,{error:"channel operation not permitted"});
      else json(res,404,{error:"channel not found or invite invalid"});
    }
    else if(e instanceof ContactError) {
      if(e.code==="invalid") json(res,400,{error:"invalid request"});
      else if(e.code==="not_recipient") json(res,403,{error:"only the recipient can accept this request"});
      else if(e.code==="already_contact") json(res,409,{error:"already a contact"});
      else if(e.code==="reverse_pending") json(res,409,{error:"an incoming request already exists"});
      else json(res,404,{error:"user or request not found"});
    }
    else if(e instanceof AuthError) {
      if(e.code==="exists")json(res,409,{error:"username unavailable"});
      else if(e.code==="invalid")json(res,400,{error:"invalid registration data"});
      else json(res,401,{error:"invalid credentials"});
    }
    else if(e instanceof ConflictError) json(res,409,{error:"operation key conflict"});
    else if(e instanceof ForbiddenError) json(res,403,{error:"channel is read-only for subscribers"});
    else if(e instanceof NotMemberError) json(res,403,{error:"not a conversation member"});
    else if(e instanceof InvalidRequestError || e instanceof URIError) json(res,400,{error:"invalid request"});
    else json(res,500,{error:"internal error"});
  }
});
server.listen(Number(process.env.PORT??8081),"0.0.0.0");
process.on("SIGTERM",()=>{abort.abort();server.close(()=>void pool.end());});
