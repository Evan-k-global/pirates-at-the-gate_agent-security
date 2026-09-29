import deployment from '@/public/evidence/deployment.json';
import target from '@/config/checkpoint-target.json';
import statement from '@/public/evidence/statement.json';
import contractKey from '@/public/evidence/contract-verification-key.json';
export async function GET(){
 const d=deployment as {status:string;graphql:string;address?:string|null;verificationKeyHash?:string};
 if(d.status!=='included')return Response.json({verified:false,message:'On-chain publication is optional and excluded from this release. The source includes the contract and deployment tools. No chain inclusion is claimed.'},{headers:{'Cache-Control':'no-store'}});
 if(d.graphql!=='https://sepolia.zeko.io/graphql'||!target.address||d.address!==target.address)return Response.json({verified:false,message:'Checkpoint target is not independently configured.'},{status:409});
 try{const r=await fetch(d.graphql,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:`query { account(publicKey: "${d.address}") { zkappState verificationKey { hash } } }`}),signal:AbortSignal.timeout(10000)});const json=await r.json() as {data?:{account?:{zkappState:string[];verificationKey:{hash:string}}}};const a=json.data?.account;const valid=!!a&&a.zkappState[0]===statement.root&&a.zkappState[1]===statement.run&&a.zkappState[2]===String(statement.count)&&a.zkappState[3]===String(statement.dispatches)&&a.verificationKey.hash===String(contractKey.hash);return Response.json({verified:valid,checkedAt:new Date().toISOString(),message:valid?'Live Zeko L2 state matches the reference trace root, run, event count, dispatch count, and contract key. Ethereum finality is not established by this check.':'The live checkpoint does not match. Do not treat this reference as chain-confirmed.'},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({verified:false,message:'The chain endpoint is unavailable. Inclusion cannot be checked right now.'},{status:503});}
}
