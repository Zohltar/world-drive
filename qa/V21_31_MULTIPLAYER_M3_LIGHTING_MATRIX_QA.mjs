import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeMultiplayerVehicleState} from '../src/multiplayer-vehicle-adapter.js';
import {listAuthoredVehicleDescriptors} from '../src/vehicle-authored-registry.js';

const states={
  day:{braking:false,reversing:false,nightLevel:0,signalLeft:false,signalRight:false,signalBlink:false},
  night:{braking:false,reversing:false,nightLevel:.8,signalLeft:false,signalRight:false,signalBlink:false},
  brake:{braking:true,reversing:false,nightLevel:.4,signalLeft:false,signalRight:false,signalBlink:false},
  'reverse-stopped':{speed:0,braking:false,reversing:true,nightLevel:0,signalLeft:false,signalRight:false,signalBlink:false},
  'reverse+brake+night':{speed:0,braking:true,reversing:true,nightLevel:1,signalLeft:false,signalRight:false,signalBlink:false},
  'left-on':{signalLeft:true,signalRight:false,signalBlink:true},
  'left-off':{signalLeft:true,signalRight:false,signalBlink:false},
  'right-on':{signalLeft:false,signalRight:true,signalBlink:true}
};

const normalized=Object.fromEntries(Object.entries(states).map(([name,state])=>[name,normalizeMultiplayerVehicleState(state,{physics:{maxSteerLow:.45}})]));
assert.equal(normalized.day.braking,false);assert.equal(normalized.day.reversing,false);assert.equal(normalized.day.nightLevel,0);
assert.equal(normalized.night.nightLevel,.8);
assert.equal(normalized.brake.braking,true);
assert.equal(normalized['reverse-stopped'].reversing,true,'selector-R state must survive independently of vehicle speed');
assert.equal(normalized['reverse+brake+night'].reversing,true);assert.equal(normalized['reverse+brake+night'].braking,true);assert.equal(normalized['reverse+brake+night'].nightLevel,1);
assert.equal(normalized['left-on'].signalLeft,true);assert.equal(normalized['left-on'].signalBlink,true);assert.equal(normalized['left-off'].signalBlink,false);assert.equal(normalized['right-on'].signalRight,true);

const client=fs.readFileSync('src/multiplayer-client-m3.js','utf8');
assert(client.includes('readTransmissionRuntimeState'),'network lighting must read the authoritative transmission bridge');
assert(client.includes('Number(runtime.serviceBrake)'),'brake replication must originate from service-brake state');
assert(client.includes('Number(runtime.selectorGear)===-1'),'reverse replication must originate from selector R');
for(const field of ['braking:lighting.braking','reversing:lighting.reversing','nightLevel:lighting.nightLevel','signalLeft:lighting.signalLeft','signalRight:lighting.signalRight','signalBlink:lighting.signalBlink'])assert(client.includes(field),`network snapshot missing ${field}`);
assert(client.includes('peer.visual.updateRemoteVehicle?.(dt,remoteState)'),'all replicated light state must flow through the M4 local-controller adapter');

const coverage=listAuthoredVehicleDescriptors().map(descriptor=>({id:descriptor.id,capabilities:[...(descriptor.capabilities||[])]}));
for(const descriptor of coverage){
  assert(descriptor.capabilities.includes('brake'),`${descriptor.id}: local controller must expose brake behavior`);
  assert(descriptor.capabilities.includes('reverse'),`${descriptor.id}: local controller must expose reverse behavior`);
}
const signalVehicles=coverage.filter(entry=>entry.capabilities.includes('turn-signals')).map(entry=>entry.id).sort();
assert.deepEqual(signalVehicles,['semi_6x4','sonata'],'turn-signal replication must match actual local-controller capabilities, not invent features');
const nightVehicles=coverage.filter(entry=>entry.capabilities.includes('night')).map(entry=>entry.id).sort();
assert(nightVehicles.includes('wrx')&&nightVehicles.includes('sonata')&&nightVehicles.includes('id4'),'authored night-light capability coverage drift');

console.log('V21.31 MULTIPLAYER M4 LIGHTING STATE MATRIX QA: PASS',{
  states:Object.keys(states),
  coverage,
  reverseIndependentOfSpeed:true,
  signalVehicles,
  visualSink:'same local authored controller'
});
