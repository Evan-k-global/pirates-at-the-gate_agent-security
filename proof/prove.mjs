import 'reflect-metadata';
import {Field,UInt32,PublicKey,Signature,Poseidon,Cache,setNumberOfWorkers,verify,PrivateKey} from 'o1js';
import {WitnessProgram,Statement,Trace,EventFields,SIZE} from './build/Witness.js';
import {verifyBundle} from '../lib/witness/protocol.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';
setNumberOfWorkers(2);
const bundle=JSON.parse(fs.readFileSync('../public/evidence/reference-bundle.json')),trust=JSON.parse(fs.readFileSync('../public/evidence/trust.json'));
await verifyBundle(bundle,trust,bundle.checkpoint.digest);
const values=bundle.events.map(e=>e.fields.map(Field));while(values.length<SIZE)values.push(Array.from({length:10},()=>Field(0)));
const input=new Statement({recorder:PublicKey.fromBase58(bundle.recorder),run:Field(bundle.runField),policy:Field(bundle.policyField),root:Poseidon.hash([Field(870103),Field(bundle.runField),Field(bundle.policyField),Field(bundle.events.length),...values.flat()]),count:UInt32.from(bundle.events.length),dispatches:UInt32.from(bundle.dispatches)});
const trace=new Trace({events:values.map(values=>new EventFields({values})),signature:Signature.fromBase58(bundle.checkpoint.signature)});
const {verificationKey}=await WitnessProgram.compile({cache:Cache.FileSystem('cache')});
console.time('prove');const {proof}=await WitnessProgram.check(input,trace);console.timeEnd('prove');
assert(await verify(proof,verificationKey));console.log('PASS Real policy proof verifies');
const json=proof.toJSON();fs.writeFileSync('../public/evidence/proof.json',JSON.stringify(json,null,2));
fs.writeFileSync('../public/evidence/statement.json',JSON.stringify({recorder:bundle.recorder,run:input.run.toString(),policy:input.policy.toString(),root:input.root.toString(),count:bundle.events.length,dispatches:bundle.dispatches,checkpointDigest:bundle.checkpoint.digest},null,2));
const badPublic=structuredClone(json);badPublic.publicInput[4]=(BigInt(badPublic.publicInput[4])+1n).toString();assert.equal(await verify(badPublic,verificationKey),false);console.log('PASS Modified public statement rejected');
const changed=new Trace({events:values.map(v=>new EventFields({values:[...v]})),signature:trace.signature});changed.events[0].values[7]=Field(999);await assert.rejects(()=>WitnessProgram.check(input,changed));console.log('PASS Modified private witness rejected');
const testKey=PrivateKey.random();
for(const [label,index,column,value] of [['Unauthorized write dispatched',1,6,1],['Replay incorrectly marked fresh',4,4,1],['Budget excess dispatched',7,6,1],['Sequence gap',2,0,9]]){
 const bad=values.map(v=>[...v]);bad[index][column]=Field(value);
 const badInput=new Statement({...input,recorder:testKey.toPublicKey(),root:Poseidon.hash([Field(870103),input.run,input.policy,input.count.value,...bad.flat()])});
 const badTrace=new Trace({events:bad.map(values=>new EventFields({values})),signature:Signature.create(testKey,[Field(870102),input.run,input.policy,input.count.value,...bad.flat()])});
 await assert.rejects(()=>WitnessProgram.check(badInput,badTrace));console.log('PASS',label,'rejected inside real circuit');
}
fs.writeFileSync('../public/evidence/proof-tests.json',JSON.stringify({testedAt:new Date().toISOString(),proofsEnabled:true,passed:7,checks:['Real proof verifies','Modified public statement rejected','Modified private witness rejected','Signed unauthorized dispatch rejected','Signed replay violation rejected','Signed budget violation rejected','Signed sequence gap rejected'],verificationKeyHash:verificationKey.hash.toString()},null,2));
console.log(JSON.stringify({root:input.root.toString(),events:bundle.events.length,dispatches:bundle.dispatches}));
