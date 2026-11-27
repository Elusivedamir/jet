import { createServer, IncomingMessage, ServerResponse } from "node:http";
import pg from "pg";
const { Pool } = pg;
import { Store, ConflictError, NotMemberError, InvalidRequestError } from "./store.js";

const pool = new Pool({connectionString:process.env.DATABASE_URL});
const store = new Store(pool);
const schema = await (await import("node:fs/promises")).readFile(new URL("../schema.sql",import.meta.url),"utf8");
for (const statement of schema.split(";").map(s=>s.trim()).filter(Boolean)) await pool.query(statement);
const abort = new AbortController();
void store.runWorker(abort.signal);

// This identity shim exists solely for isolated PoC contract tests. It is
// impossible to enable in production, even if an operator sets the flag by mistake.
function account(req:IncomingMessage):string {
  if(process.env.NODE_ENV==="production" || process.env.JETSON_ALLOW_TEST_IDENTITY!=="true") return "";
  const value=req.headers["x-test-account"];
  return typeof value==="string"?value.trim():"";
}
function json(res:ServerResponse,status:number,value:unknown) {
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
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
const server=createServer(async(req,res)=>{
  try {
    if(req.method==="GET" && req.url==="/healthz"){res.writeHead(204);res.end();return;}
    const user=account(req);
    if(!user){json(res,401,{error:"authentication required"});return;}
    const url=new URL(req.url??"/","http://localhost");
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
      const initial=await store.inbox(user,conversation,0,1);
      void initial;
      let cursor=Number(req.headers["last-event-id"]??url.searchParams.get("after")??0);
      if(!Number.isSafeInteger(cursor)||cursor<0){json(res,400,{error:"invalid cursor"});return;}
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
    if(e instanceof ConflictError) json(res,409,{error:"operation key conflict"});
    else if(e instanceof NotMemberError) json(res,403,{error:"not a conversation member"});
    else if(e instanceof InvalidRequestError || e instanceof URIError) json(res,400,{error:"invalid request"});
    else json(res,500,{error:"internal error"});
  }
});
server.listen(Number(process.env.PORT??8081),"0.0.0.0");
process.on("SIGTERM",()=>{abort.abort();server.close(()=>void pool.end());});
