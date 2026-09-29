import fs from 'node:fs';
import {PrivateKey} from 'o1js';
const dir=new URL('private/',import.meta.url);
for(const name of ['deployer','checkpoint'])if(fs.existsSync(new URL(name+'.json',dir)))throw Error('Deployment keys already exist; refusing to replace '+name+'.');
const record=JSON.parse(fs.readFileSync(new URL('../public/evidence/deployment.json',import.meta.url)));
if(!['not_requested','pending'].includes(record.status))throw Error('Deployment state already exists. Use a fresh source copy for a new target.');
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const publicKeys={};
for(const name of ['deployer','checkpoint']){
 const key=PrivateKey.random();publicKeys[name]=key.toPublicKey().toBase58();
 fs.writeFileSync(new URL(name+'.json',dir),JSON.stringify({privateKey:key.toBase58(),publicKey:publicKeys[name]},null,2),{flag:'wx',mode:0o600});
}
fs.writeFileSync(new URL('../config/checkpoint-target.json',import.meta.url),JSON.stringify({address:publicKeys.checkpoint},null,2)+'\n');
console.log(JSON.stringify({network:'Zeko Sepolia',...publicKeys,submitted:false},null,2));
console.log('Optional deployment keys created. Back up private/ securely. Fund only the deployer with native L2 sETH if you choose to deploy.');
