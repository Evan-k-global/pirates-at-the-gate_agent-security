import { env } from 'cloudflare:workers';
import { signer,MAX_EVENTS,EVENT_DOMAIN,POLICY,POLICY_TEXT,fieldHash,sha256,canonical,batchFields } from './protocol.mjs';

type Event={fields:string[];signature:string;hash:string};
type Run={version:string;runId:string;runField:string;policyField:string;recorder:string;status:string;events:Event[];dispatches:number;checkpoint?:{signature:string;digest:string};createdAt:number};
function config(){const e=env as unknown as {DB:D1Database;WITNESS_RECORDER_KEY:string};if(!e.DB||!e.WITNESS_RECORDER_KEY)throw Error('Recorder unavailable');return e;}
export function trust(){const e=config();return {version:'witness-trust-v1',recorder:signer.derivePublicKey(e.WITNESS_RECORDER_KEY),policy:POLICY,signatureScheme:'Pallas Schnorr',scope:'Pinned server recorder; not a remote attestation of the host.'};}
function response(data:unknown,status=200,headers:Record<string,string>={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
async function body(request:Request){const reader=request.body?.getReader();if(!reader)throw Error('Missing body');let n=0;const chunks:Uint8Array[]=[];while(true){const r=await reader.read();if(r.done)break;n+=r.value.length;if(n>4096){await reader.cancel();throw Error('Request too large');}chunks.push(r.value);}const bytes=new Uint8Array(n);let p=0;for(const c of chunks){bytes.set(c,p);p+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));}
async function session(request:Request){const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)witness_session=([a-f0-9-]+)\.([a-f0-9-]+)/);if(!cookie)return null;const {DB}=config();const row=await DB.prepare('SELECT state, revision, token_hash FROM witness_runs WHERE id=?').bind(cookie[1]).first<{state:string;revision:number;token_hash:string}>();if(!row||row.token_hash!==await sha256(cookie[2]))return null;const run=JSON.parse(row.state) as Run;if(Date.now()-run.createdAt>86400000)return null;return {run,revision:row.revision};}
async function save(run:Run,revision:number){const r=await config().DB.prepare('UPDATE witness_runs SET state=?, revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(run),run.runId,revision).run();if(r.meta.changes!==1)throw Error('Concurrent request: refresh and retry.');}
function publicState(run:Run){return {runId:run.runId,status:run.status,events:run.events,dispatches:run.dispatches,checkpoint:run.checkpoint,recorder:run.recorder,maxEvents:MAX_EVENTS};}
export async function labGet(request:Request){try{const s=await session(request);return response({run:s?publicState(s.run):null,trust:trust()});}catch{return response({error:'The independent recorder is unavailable. No action can be dispatched.'},503);}}
export async function labPost(request:Request){
 try{
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return response({error:'Cross-origin requests are not allowed.'},403);
 let b;try{b=await body(request);}catch{return response({error:'Invalid request (maximum 4 KB).'},400);}
 const {DB,WITNESS_RECORDER_KEY:key}=config();
 if(b.action==='start'){
  const ip=request.headers.get('cf-connecting-ip')??'local';const bucket=await sha256(key+ip+Math.floor(Date.now()/3600000));
  const quota=await DB.prepare('INSERT INTO witness_quotas(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<30 RETURNING count').bind(bucket).first();
  if(!quota)return response({error:'Demo run limit reached. Try again next hour.'},429);
  const id=crypto.randomUUID(),token=crypto.randomUUID();const run:Run={version:'witness-bundle-v1',runId:id,runField:await fieldHash(id),policyField:await fieldHash(POLICY_TEXT),recorder:signer.derivePublicKey(key),status:'open',events:[],dispatches:0,createdAt:Date.now()};
  await DB.prepare('INSERT INTO witness_runs(id,token_hash,state,revision,created_at) VALUES(?,?,?,0,?)').bind(id,await sha256(token),JSON.stringify(run),Date.now()).run();
  return response({run:publicState(run),message:'Mission issued: read the local package, up to three times.'},200,{'Set-Cookie':`witness_session=${id}.${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${new URL(request.url).protocol==='https:'?'; Secure':''}`});
 }
 const s=await session(request);if(!s)return response({error:'Start a new run first.'},401);const {run,revision}=s;
 if(b.action==='export'){
  if(!run.events.length)return response({error:'Record an action before sealing.'},400);
  if(run.status!=='sealed'){
   run.status='sealed';const signature=signer.signFields(batchFields(run),key).signature;
   run.checkpoint={signature,digest:await sha256(canonical({runField:run.runField,policyField:run.policyField,events:run.events,signature}))};await save(run,revision);
  }
  return response({run:publicState(run),bundle:run,message:'Run sealed. The terminal checkpoint pins this exact trace.'});
 }
 if(run.status==='sealed')return response({error:'This run is sealed. Start a new run to record more actions.'},409);
 if(b.action==='outage'){
  // Fault injection at the recorder-before-dispatch boundary. No bypass to the service exists here.
  return response({run:publicState(run),result:{decision:'paused',dispatched:false,recorded:false,faultInjected:true},message:'Injected recorder outage: no event persisted and no operation dispatched. Service counter is unchanged.'});
 }
 if(b.action!=='request'||!['read','write'].includes(b.operation)||!['own','external','other'].includes(b.scope)||typeof b.nonce!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(b.nonce))return response({error:'Unsupported operation, scope, or nonce.'},400);
 if(run.events.length>=MAX_EVENTS)return response({error:'Eight-event limit reached. Seal and verify this run.'},409);
 const nonce=await fieldHash(b.nonce);const fresh=!run.events.some(e=>e.fields[8]===nonce);const allowed=b.operation==='read'&&b.scope==='own'&&fresh&&run.dispatches<3;
 const fields=[String(run.events.length+1),b.operation==='read'?'1':'2',String({own:1,external:2,other:3}[b.scope as 'own'|'external'|'other']),'1',fresh?'1':'0',allowed?'1':'0',allowed?'1':'0',await fieldHash(crypto.randomUUID()),nonce,run.events.at(-1)?.hash??'0'];
 const signature=signer.signFields([EVENT_DOMAIN,BigInt(run.runField),BigInt(run.policyField),...fields.map(BigInt)],key).signature;
 const event={fields,signature,hash:await fieldHash(canonical({fields,signature}))};run.events.push(event);if(allowed)run.dispatches++;
 // The protected effect is this synthetic service counter. Both it and its signed record commit in one CAS write.
 // Never replace this with external effects without reservation, dispatch/result records and reconciliation.
 await save(run,revision);
 const reason=allowed?'The approved package was read.':!fresh?'Replayed operation rejected.':run.dispatches>=3&&b.operation==='read'&&b.scope==='own'?'Mission budget exhausted.':'Operation is outside the mission policy.';
 return response({run:publicState(run),result:{decision:allowed?'allowed':'denied',dispatched:allowed,recorded:true,service:allowed?{package:'sample-math@1.0.0',readCount:run.dispatches}:null},message:reason});
 }catch(e){const conflict=e instanceof Error&&e.message.startsWith('Concurrent');return response({error:conflict?'Another operation completed first. Refresh and retry.':'Recorder unavailable. No successful dispatch is reported. Refresh to reconcile the authoritative state.'},conflict?409:503);}
}
