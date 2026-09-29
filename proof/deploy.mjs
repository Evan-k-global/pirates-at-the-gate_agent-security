import 'reflect-metadata';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Mina,PrivateKey,UInt64,AccountUpdate,Cache,fetchAccount,setNumberOfWorkers,verify} from 'o1js';
import {WitnessProgram,WitnessCheckpoint,WitnessProof} from './build/Witness.js';
import {configuration,preflight,payerState,accountMissing} from './network.mjs';
setNumberOfWorkers(2);
const config=configuration();
Mina.setActiveInstance(Mina.Network({networkId:config.signingNetwork,mina:config.graphql,archive:config.graphql}));
const read=p=>JSON.parse(fs.readFileSync(p));
const payerKey=PrivateKey.fromBase58(read('private/deployer.json').privateKey),key=PrivateKey.fromBase58(read('private/checkpoint.json').privateKey),payer=payerKey.toPublicKey(),address=key.toPublicKey();
assert.equal(address.toBase58(),read('../config/checkpoint-target.json').address,'Checkpoint key must match the independently configured public target');
const out='../public/evidence/deployment.json';let record=read(out);
if(record.address)assert.equal(record.address,address.toBase58(),'Existing deployment belongs to another target');
if(['deploy_sending','deploy_unknown','checkpoint_sending','checkpoint_unknown'].includes(record.status))throw Error('Earlier submission outcome unknown. Reconcile the recorded payer nonce, transaction and account before any retry.');
const save=()=>{fs.writeFileSync(out+'.tmp',JSON.stringify(record,null,2)+'\n');fs.renameSync(out+'.tmp',out);};
const network=await preflight();console.log(JSON.stringify(network,null,2));
const fee=UInt64.from(config.fee);const balance=BigInt((await payerState(payer.toBase58())).balance.total);
assert(balance>=BigInt(network.accountCreationFee)+2n*config.fee,'Deployer requires native L2 sETH for account creation and two transactions');
const {verificationKey:programKey}=await WitnessProgram.compile({cache:Cache.FileSystem('cache')});
const {verificationKey}=await WitnessCheckpoint.compile({cache:Cache.FileSystem('cache')});
assert.equal(verificationKey.hash.toString(),String(read('../public/evidence/contract-verification-key.json').hash),'Compiled contract differs from the release key');
const statement=read('../public/evidence/statement.json'),proof=await WitnessProof.fromJSON(read('../public/evidence/proof.json'));
assert(await verify(proof,programKey),'Reference proof invalid');assert.equal(proof.publicInput.root.toString(),statement.root);
const contract=new WitnessCheckpoint(address);
async function account(){const r=await fetchAccount({publicKey:address});if(r.error&&!accountMissing(r))throw Error('Account lookup failed: '+r.error.statusText);return r;}
async function confirm(predicate){for(let i=0;i<60;i++){const r=await account();if(!r.error&&predicate(r.account))return r.account;await new Promise(r=>setTimeout(r,2000));}throw Error('Confirmation not observed. Inspect the recorded transaction and account state; do not resubmit blindly.');}
async function transaction(callback){
 await preflight();await fetchAccount({publicKey:payer});const a=await payerState(payer.toBase58());
 const nonce=Number(a.inferredNonce??a.nonce);assert(Number.isSafeInteger(nonce)&&nonce>=0,'Invalid payer nonce');
 const tx=await Mina.transaction({sender:payer,fee,nonce},callback);return {tx,nonce};
}
async function submit(tx,nonce,phase,keys){
 await tx.prove();const latest=await payerState(payer.toBase58());assert.equal(Number(latest.inferredNonce??latest.nonce),nonce,'Payer nonce changed during proving; rebuild before submitting');record.status=phase+'_sending';record.lastSubmission={phase,nonce,fee:config.fee.toString(),payer:payer.toBase58(),preparedAt:new Date().toISOString()};save();
 let sent;try{sent=await tx.sign(keys).send();}catch(error){record.status=phase+'_unknown';save();throw error;}
 if(sent.status==='rejected'){record.status=phase+'_rejected';save();throw Error('Transaction rejected: '+JSON.stringify(sent.errors));}
 if(!sent.hash){record.status=phase+'_unknown';save();throw Error('No transaction hash returned. Reconcile before retrying.');}
 record[phase==='deploy'?'deployTransactionHash':'publishTransactionHash']=sent.hash;record.status=phase+'_submitted';save();console.log(phase+' submitted',sent.hash);
}
record={...record,network:'Zeko Sepolia testnet',graphql:config.graphql,address:address.toBase58(),recorder:proof.publicInput.recorder.toBase58(),verificationKeyHash:verificationKey.hash.toString(),root:statement.root,ethereumFinality:'not asserted',reason:'Recipient-initiated optional checkpoint publication'};
let found=await account();
if(found.error){
 if(record.deployTransactionHash)throw Error('Earlier deployment is pending; inspect it before retrying.');
 const {tx,nonce}=await transaction(async()=>{AccountUpdate.fundNewAccount(payer);await contract.deploy();});
 assert.equal(Mina.getNetworkConstants().accountCreationFee.toString(),network.accountCreationFee,'Account creation fee changed during build');
 await submit(tx,nonce,'deploy',[payerKey,key]);await confirm(a=>!!a.zkapp);
}
found=await account();assert.equal(found.account.zkapp?.verificationKey?.hash.toString(),verificationKey.hash.toString(),'Existing account contract differs');
if(found.account.zkapp.appState[0].toString()==='0'){
 if(record.publishTransactionHash)throw Error('Earlier checkpoint is pending; inspect it before retrying.');
 const {tx,nonce}=await transaction(async()=>{await contract.publish(proof);});await submit(tx,nonce,'checkpoint',[payerKey]);await confirm(a=>a.zkapp?.appState?.[0]?.toString()===statement.root);
}
const final=(await account()).account;
assert.deepEqual(final.zkapp.appState.slice(0,4).map(x=>x.toString()),[statement.root,statement.run,String(statement.count),String(statement.dispatches)]);
record.status='included';record.confirmedAt=new Date().toISOString();record.state=final.zkapp.appState.map(x=>x.toString());save();
const path='../public/evidence/manifest.json',manifest=read(path);Object.assign(manifest,{chainStatus:'included',address:record.address,transactionHash:record.publishTransactionHash});fs.writeFileSync(path,JSON.stringify(manifest,null,2)+'\n');
console.log('Reference checkpoint included on Zeko L2. Ethereum settlement is not asserted.');
