import {verify,Field,Poseidon,PublicKey} from 'o1js';
import {verifyBundle} from '../lib/witness/protocol.mjs';
import {createHash} from 'node:crypto';
import fs from 'node:fs';import assert from 'node:assert/strict';
const dir=process.argv[2]??'../public/evidence';const read=n=>JSON.parse(fs.readFileSync(dir+'/'+n));
const bundle=read('reference-bundle.json'),trust=read('trust.json'),statement=read('statement.json'),proof=read('proof.json'),vk=read('verification-key.json');
assert.equal(createHash('sha256').update(vk.data).digest('hex'),'4d6f8601bcb1971bc9c8c738e5ee96d5cf631fd83d2a092a4f490442868d0670','Untrusted proof verification key');
assert.equal(trust.recorder,'B62qo36XaXAU73vRgghNuNm6wiB4g8grqFRdvJMwpaw7FmXwvLC2opo');
console.log(await verifyBundle(bundle,trust,statement.checkpointDigest));
const flat=bundle.events.flatMap(e=>e.fields.map(Field));while(flat.length<80)flat.push(Field(0));
const root=Poseidon.hash([Field(870103),Field(bundle.runField),Field(bundle.policyField),Field(bundle.events.length),...flat]).toString();assert.equal(root,statement.root);
assert(await verify(proof,vk));
assert.deepEqual(proof.publicInput.slice(0,2),PublicKey.fromBase58(trust.recorder).toFields().map(f=>f.toString()));
assert.equal(proof.publicInput[2],statement.run);assert.equal(proof.publicInput[3],statement.policy);assert.equal(proof.publicInput[4],root);assert.equal(proof.publicInput[5],String(statement.count));assert.equal(proof.publicInput[6],String(statement.dispatches));
console.log('PASS: real ZK proof and disclosed synthetic trace match.');
if(fs.existsSync(dir+'/deployment.json')){
 const d=read('deployment.json');if(d.status!=='included'){console.log('Chain checkpoint: not deployed.');process.exit(0);}
 assert.equal(d.graphql,'https://sepolia.zeko.io/graphql');assert.equal(d.address,'B62qmk4WxakoqQqJZza2fhYzKChqESGojZRZd4nuL43pjhzsg8avWmm');assert.equal(d.verificationKeyHash,'15346760952952934163022021666273860883031171003091515451871358163741530902613','Unexpected checkpoint contract');
 const r=await fetch(d.graphql,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'query { account(publicKey: "'+d.address+'") { zkappState verificationKey { hash } } }'})});
 const data=await r.json();const a=data.data?.account;assert(a,'Checkpoint account missing');assert.equal(a.zkappState[0],root);assert.equal(a.zkappState[1],statement.run);assert.equal(a.zkappState[2],String(statement.count));assert.equal(a.zkappState[3],String(statement.dispatches));assert.equal(a.verificationKey.hash,d.verificationKeyHash);
 console.log('PASS: live Zeko L2 checkpoint and contract key match. Ethereum finality is not established by this check.');
}
