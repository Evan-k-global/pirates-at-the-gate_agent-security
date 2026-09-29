import assert from 'node:assert/strict';
export const GRAPHQL='https://sepolia.zeko.io/graphql';
export const SIGNING_NETWORK='testnet';
export function configuration(env=process.env){
 assert.equal(env.ZEKO_GRAPHQL??GRAPHQL,GRAPHQL,'This package supports only Zeko Sepolia');
 assert.equal(env.ZEKO_NETWORK_ID??SIGNING_NETWORK,SIGNING_NETWORK,'Use testnet for o1js signing');
 const raw=env.WITNESS_TX_FEE??'10000';assert.match(raw,/^[0-9]+$/);const fee=BigInt(raw);
 assert(fee>0n&&fee<=1000000n,'Configured fee exceeds the testnet-only cap');
 return {graphql:GRAPHQL,signingNetwork:SIGNING_NETWORK,fee};
}
export async function query(query,variables={}){
 const r=await fetch(GRAPHQL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Sepolia RPC HTTP '+r.status);
 const body=await r.json();if(body.errors?.length)throw Error(JSON.stringify(body.errors));if(!body.data)throw Error('Missing RPC data');return body.data;
}
export function validateNetwork(data,config=configuration()){
 assert.equal(data.networkID,'zeko:testnet','Unexpected RPC network label');
 assert.equal(data.signatureKind,'testnet','Unexpected signature domain');
 assert.equal(data.syncStatus,'SYNCED','Sequencer is not synchronized');
 assert.equal(data.daemonStatus?.chainId,'69420','Unexpected Sepolia L2 identity');
 const creation=BigInt(data.genesisConstants.accountCreationFee);assert(creation>=0n&&creation<=1000000n,'Unexpected account creation cost');
 const rate=Number(data.feePerWeightUnit);assert(Number.isFinite(rate)&&rate>0,'Invalid network fee rate');
 assert(config.fee>=BigInt(Math.ceil(rate)),'Configured transaction fee is below one live weight unit');
 return {checkedAt:new Date().toISOString(),graphql:GRAPHQL,signingNetwork:SIGNING_NETWORK,networkID:data.networkID,chainId:data.daemonStatus.chainId,syncStatus:data.syncStatus,nativeAsset:'sETH',accountCreationFee:creation.toString(),feePerWeightUnit:rate,configuredFee:config.fee.toString(),feeSource:'Configured total fee, not a transaction-weight quote',submitted:false};
}
export async function preflight(){const config=configuration();return validateNetwork(await query('query { networkID signatureKind syncStatus feePerWeightUnit genesisConstants { accountCreationFee } daemonStatus { chainId } }'),config);}
export async function payerState(publicKey){const d=await query('query($pk:PublicKey!){account(publicKey:$pk){nonce inferredNonce balance{total}}}',{pk:publicKey});if(!d.account)throw Error('Deployment account is not funded on Zeko Sepolia');return d.account;}
export function accountMissing(result){return result.error?.statusCode===404;}
