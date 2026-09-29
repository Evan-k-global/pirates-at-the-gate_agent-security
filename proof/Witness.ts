import {Field,UInt32,Bool,PublicKey,Signature,Struct,Provable,Poseidon,ZkProgram,SmartContract,State,state,method,Permissions} from 'o1js';
import {POLICY_FIELD,RECORDER} from './constants.js';
export const SIZE=8;
export class Statement extends Struct({recorder:PublicKey,run:Field,policy:Field,root:Field,count:UInt32,dispatches:UInt32}){}
export class EventFields extends Struct({values:Provable.Array(Field,10)}){}
export class Trace extends Struct({events:Provable.Array(EventFields,SIZE),signature:Signature}){}
export const WitnessProgram=ZkProgram({name:'witness-private-policy-v1',publicInput:Statement,methods:{check:{privateInputs:[Trace],async method(input:Statement,trace:Trace){
 input.policy.assertEquals(Field(POLICY_FIELD));input.count.assertGreaterThan(UInt32.zero);input.count.assertLessThanOrEqual(UInt32.from(SIZE));input.run.assertNotEquals(Field(0));
 let dispatched=UInt32.zero;const flat:Field[]=[];
 for(let i=0;i<SIZE;i++){
  const v=trace.events[i].values;flat.push(...v);const active=UInt32.from(i).lessThan(input.count);
  for(const f of v)Provable.if(active,Field(0),f).assertEquals(Field(0));
  Provable.if(active,v[0],Field(i+1)).assertEquals(Field(i+1));
  active.implies(v[1].equals(1).or(v[1].equals(2))).assertTrue('operation vocabulary');
  active.implies(v[2].equals(1).or(v[2].equals(2)).or(v[2].equals(3))).assertTrue('scope vocabulary');
  active.implies(v[3].equals(1)).assertTrue('healthy recorder required');
  let fresh=Bool(true);for(let j=0;j<i;j++)fresh=fresh.and(v[8].equals(trace.events[j].values[8]).not());
  const allowed=v[1].equals(1).and(v[2].equals(1)).and(fresh).and(dispatched.lessThan(UInt32.from(3)));
  active.implies(v[4].equals(fresh.toField())).assertTrue('replay check');
  active.implies(v[5].equals(allowed.toField())).assertTrue('decision check');
  active.implies(v[6].equals(allowed.toField())).assertTrue('dispatch check');
  dispatched=Provable.if(active.and(allowed),dispatched.add(1),dispatched);
 }
 dispatched.assertEquals(input.dispatches);
 trace.signature.verify(input.recorder,[Field(870102),input.run,input.policy,input.count.value,...flat]).assertTrue('independent recorder signature');
 Poseidon.hash([Field(870103),input.run,input.policy,input.count.value,...flat]).assertEquals(input.root);
}}}});
export class WitnessProof extends ZkProgram.Proof(WitnessProgram){}
export class WitnessCheckpoint extends SmartContract {
 @state(Field) root=State<Field>();
 @state(Field) run=State<Field>();
 @state(UInt32) count=State<UInt32>();
 @state(UInt32) dispatches=State<UInt32>();
 init(){super.init();this.account.permissions.set({...Permissions.default(),editState:Permissions.proof(),setVerificationKey:Permissions.VerificationKey.impossibleDuringCurrentVersion(),setPermissions:Permissions.impossible(),send:Permissions.impossible()});}
 @method async publish(proof:WitnessProof){
  this.root.getAndRequireEquals().assertEquals(Field(0));proof.verify();
  proof.publicInput.recorder.assertEquals(PublicKey.fromBase58(RECORDER));proof.publicInput.root.assertNotEquals(Field(0));
  this.root.set(proof.publicInput.root);this.run.set(proof.publicInput.run);this.count.set(proof.publicInput.count);this.dispatches.set(proof.publicInput.dispatches);
 }
}
