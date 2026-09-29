import 'reflect-metadata';
import fs from 'node:fs';
import {Mina,PrivateKey,PublicKey,UInt64,AccountUpdate,Cache,fetchAccount,setNumberOfWorkers} from 'o1js';
import {WitnessProgram,WitnessCheckpoint,WitnessProof} from './build/Witness.js';
setNumberOfWorkers(2);
const graphql='https://sepolia.zeko.io/graphql';
Mina.setActiveInstance(Mina.Network({networkId:'testnet',mina:graphql,archive:graphql}));
const payerData=JSON.parse(fs.readFileSync('private/deployer.json')),keyData=JSON.parse(fs.readFileSync('private/checkpoint.json'));
const payerKey=PrivateKey.fromBase58(payerData.privateKey),key=PrivateKey.fromBase58(keyData.privateKey),payer=payerKey.toPublicKey(),address=key.toPublicKey();
const fee=UInt64.from(2500); // 0.0000025 sETH; fixed testnet-only fee ceiling.
const out='../public/evidence/deployment.json';
let record=fs.existsSync(out)?JSON.parse(fs.readFileSync(out)):{status:'pending'};
if(['deploy_sending','deploy_unknown','checkpoint_sending','checkpoint_unknown'].includes(record.status))throw Error('An earlier submission has an unknown outcome. Reconcile the payer nonce, transaction, and checkpoint account before any retry.');
const save=()=>fs.writeFileSync(out,JSON.stringify(record,null,2));
const payerAccount=await fetchAccount({publicKey:payer});if(payerAccount.error||payerAccount.account.balance.toBigInt()<100000n)throw Error('Fund the dedicated deployment account with at least 0.0001 sETH.');
await WitnessProgram.compile({cache:Cache.FileSystem('cache')});const {verificationKey}=await WitnessCheckpoint.compile({cache:Cache.FileSystem('cache')});
const statement=JSON.parse(fs.readFileSync('../public/evidence/statement.json'));const proof=await WitnessProof.fromJSON(JSON.parse(fs.readFileSync('../public/evidence/proof.json')));
const contract=new WitnessCheckpoint(address);let found=await fetchAccount({publicKey:address});
async function confirm(predicate){for(let i=0;i<60;i++){const r=await fetchAccount({publicKey:address});if(!r.error&&predicate(r.account))return r.account;await new Promise(r=>setTimeout(r,2000));}throw Error('Confirmation not observed. Resume by reading the recorded transaction and account state; do not resubmit blindly.');}
record={...record,network:'Zeko Sepolia testnet',graphql,address:address.toBase58(),recorder:proof.publicInput.recorder.toBase58(),verificationKeyHash:verificationKey.hash.toString(),root:statement.root,ethereumFinality:'not asserted'};
if(found.error){
 if(record.deployTransactionHash)throw Error('An earlier deployment is pending; inspect it before retrying.');
 const tx=await Mina.transaction({sender:payer,fee},async()=>{AccountUpdate.fundNewAccount(payer);await contract.deploy();});
 const creation=Mina.getNetworkConstants().accountCreationFee.toBigInt();
 if(creation>1000000n)throw Error('Unexpected account creation fee; inspect the live testnet network constants.');
 await tx.prove();record.status='deploy_sending';save();let sent;try{sent=await tx.sign([payerKey,key]).send();}catch(error){record.status='deploy_unknown';save();throw error;}
 if(sent.status==='rejected'){record.status='deploy_rejected';save();throw Error('Deployment rejected: '+JSON.stringify(sent.errors));}record.deployTransactionHash=sent.hash;record.status='deploy_submitted';save();console.log('Deployment submitted',sent.hash);await confirm(()=>true);
}
found=await fetchAccount({publicKey:address});if(found.account.zkapp.verificationKey.hash.toString()!==verificationKey.hash.toString())throw Error('Existing account verification key differs.');
if(found.account.zkapp.appState[0].toString()==='0'){
 if(record.publishTransactionHash)throw Error('An earlier checkpoint is pending; inspect it before retrying.');
 await fetchAccount({publicKey:payer});
 const tx=await Mina.transaction({sender:payer,fee},async()=>{await contract.publish(proof);});await tx.prove();record.status='checkpoint_sending';save();let sent;try{sent=await tx.sign([payerKey]).send();}catch(error){record.status='checkpoint_unknown';save();throw error;}
 if(sent.status==='rejected'){record.status='checkpoint_rejected';save();throw Error('Checkpoint rejected: '+JSON.stringify(sent.errors));}record.publishTransactionHash=sent.hash;record.status='checkpoint_submitted';save();console.log('Checkpoint submitted',sent.hash);
 await confirm(a=>a.zkapp?.appState?.[0]?.toString()===statement.root);
}
const account=(await fetchAccount({publicKey:address})).account;
if(account.zkapp.appState[0].toString()!==statement.root)throw Error('Checkpoint root mismatch.');
record.status='included';record.confirmedAt=new Date().toISOString();record.state=account.zkapp.appState.map(x=>x.toString());save();
const manifestPath='../public/evidence/manifest.json';const manifest=JSON.parse(fs.readFileSync(manifestPath));Object.assign(manifest,{chainStatus:'included',address:record.address,transactionHash:record.publishTransactionHash});fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
console.log(JSON.stringify(record,null,2));
