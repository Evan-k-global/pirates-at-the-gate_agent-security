import Client from 'mina-signer';
export const signer = new Client({network:'testnet'});
export const MAX_EVENTS=8;
export const EVENT_DOMAIN=870101n;
export const BATCH_DOMAIN=870102n;
export const TRACE_DOMAIN=870103n;
export const POLICY={version:'witness-policy-v1',operation:'read',scope:'own',maxDispatches:3,maxEvents:8,recorderRequired:true};
export const POLICY_TEXT=JSON.stringify(POLICY);
export const canonical=(value)=>JSON.stringify(value);
export async function sha256(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function fieldHash(text){return BigInt('0x'+(await sha256(text)).slice(0,62)).toString();}
export function eventFields(event){return event.fields.map(BigInt);}
export function batchFields(bundle){const flat=bundle.events.flatMap(eventFields);while(flat.length<MAX_EVENTS*10)flat.push(0n);return [BATCH_DOMAIN,BigInt(bundle.runField),BigInt(bundle.policyField),BigInt(bundle.events.length),...flat];}
export async function verifyBundle(bundle,trust,expectedCheckpoint){
 if(bundle?.version!=='witness-bundle-v1'||bundle.status!=='sealed')throw Error('A sealed v1 bundle is required.');
 if(bundle.recorder!==trust.recorder)throw Error('Recorder does not match the independently pinned key.');
 if(bundle.policyField!==await fieldHash(POLICY_TEXT))throw Error('Unexpected policy.');
 if(bundle.runField!==await fieldHash(bundle.runId))throw Error('Run binding mismatch.');
 if(!Array.isArray(bundle.events)||bundle.events.length<1||bundle.events.length>MAX_EVENTS)throw Error('Invalid event count.');
 let previous='0',dispatches=0;const seen=new Set();
 for(let i=0;i<bundle.events.length;i++){
  const e=bundle.events[i],f=eventFields(e);
  if(f.length!==10||f[0]!==BigInt(i+1)||f[9]!==BigInt(previous))throw Error('Sequence or previous-event binding changed.');
  if(![1n,2n].includes(f[1])||![1n,2n,3n].includes(f[2])||f[3]!==1n)throw Error('Invalid event vocabulary.');
  const fresh=!seen.has(f[8].toString());const allow=f[1]===1n&&f[2]===1n&&fresh&&dispatches<3;
  if(f[4]!==BigInt(Number(fresh))||f[5]!==BigInt(Number(allow))||f[6]!==BigInt(Number(allow)))throw Error('Policy decision or dispatch mismatch.');
  if(!signer.verifyFields({data:[EVENT_DOMAIN,BigInt(bundle.runField),BigInt(bundle.policyField),...f],signature:e.signature,publicKey:trust.recorder}))throw Error('Event signature is invalid.');
  const hash=await fieldHash(canonical({fields:e.fields,signature:e.signature}));
  if(e.hash!==hash)throw Error('Event hash changed.');
  previous=hash;seen.add(f[8].toString());if(allow)dispatches++;
 }
 if(!signer.verifyFields({data:batchFields(bundle),signature:bundle.checkpoint.signature,publicKey:trust.recorder}))throw Error('Terminal checkpoint signature is invalid.');
 const digest=await sha256(canonical({runField:bundle.runField,policyField:bundle.policyField,events:bundle.events,signature:bundle.checkpoint.signature}));
 if(digest!==bundle.checkpoint.digest)throw Error('Checkpoint digest changed.');
 if(expectedCheckpoint&&digest!==expectedCheckpoint)throw Error('Evidence is stale or truncated relative to the expected terminal checkpoint.');
 return {valid:true,eventCount:bundle.events.length,dispatches,checkpoint:digest,scope:'Signatures, ordered trace, terminal checkpoint, replay checks and the fixed policy. No ZK or chain check in this function.'};
}
