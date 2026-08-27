import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem} from '../src/vehicle-system.js';
import {getMultiplayerVehicleSpec,listMultiplayerVehicleSpecs,listMultiplayerVehicleIds} from '../src/multiplayer-vehicle-registry.js';
import {getAuthoredVehicleDescriptor} from '../src/vehicle-authored-registry.js';

const vehicleSystem=createVehicleSystem({initialId:'wrx'});
const authoritativeIds=vehicleSystem.list().map(v=>v.id);
assert.deepEqual(listMultiplayerVehicleIds(),authoritativeIds,'multiplayer registry must cover exact vehicle-system fleet');

for(const id of authoritativeIds){
  const local=createVehicleSystem({initialId:id}).active;
  const remote=getMultiplayerVehicleSpec(id);
  assert.equal(remote.id,id);
  assert.equal(remote.physics.wheelbase,local.physics.wheelbase,`${id}: wheelbase drift`);
  assert.equal(remote.physics.trackWidth,local.physics.trackWidth,`${id}: track drift`);
  assert.equal(remote.physics.bodyLength,local.physics.bodyLength,`${id}: body length drift`);
  assert.equal(remote.physics.bodyWidth,local.physics.bodyWidth,`${id}: body width drift`);
  assert.equal(remote.physics.axles.length,local.physics.axles.length,`${id}: axle count drift`);
  assert.equal(remote.visual.supportContacts.length,local.physics.axles.length*2,`${id}: support contacts must be one left/right pair per axle`);
  assert(getAuthoredVehicleDescriptor(id),`${id}: canonical authored controller descriptor missing`);
  assert.equal('hd' in remote,false,`${id}: metric registry must not own HD asset contracts`);
  assert.equal('lighting' in remote,false,`${id}: metric registry must not own lamp contracts`);
  for(let i=0;i<local.physics.axles.length;i++){
    const axle=local.physics.axles[i],remoteAxle=remote.physics.axles[i];
    assert.equal(remoteAxle.id,axle.id,`${id}: axle id drift`);
    assert.equal(remoteAxle.positionM,axle.positionM,`${id}: axle longitudinal position drift`);
    assert.equal(remoteAxle.trackWidth,axle.trackWidth,`${id}: axle track drift`);
  }
}

const semi=getMultiplayerVehicleSpec('semi_6x4');
assert.equal(semi.physics.wheelbase,5.45,'semi must use authoritative 5.45 m wheelbase');
assert.equal(semi.physics.axles.length,3,'semi must expose three physical axles');
assert.equal(semi.visual.supportContacts.length,6,'semi terrain support must use six left/right contact probes');

const registrySource=fs.readFileSync('src/multiplayer-vehicle-registry.js','utf8');
const fallback=fs.readFileSync('src/multiplayer-fallback-visual.js','utf8');
const support=fs.readFileSync('src/multiplayer-visuals-v18.js','utf8');
assert(!registrySource.includes('LIGHTING_CONTRACTS'),'M4 metric registry must not duplicate authored lamp contracts');
assert(!registrySource.includes('hdAsset')&&!registrySource.includes('hdUrl'),'M4 metric registry must not duplicate authored asset paths');
assert(fallback.includes("from './multiplayer-vehicle-registry.js'"),'temporary fallback must read registry metrics');
assert(!fallback.includes('const SPECS='),'fallback must not reintroduce hand-maintained vehicle metrics');
assert(support.includes("from './multiplayer-support-math.js'"),'runtime support must use pure tested support solver');
assert(!support.includes('contacts.length!==4'),'multi-axle support must not assume exactly four contacts');

console.log('V21.31 MULTIPLAYER M4 METRIC REGISTRY QA: PASS',{
  fleet:authoritativeIds,
  specs:listMultiplayerVehicleSpecs().length,
  semi:{wheelbase:semi.physics.wheelbase,axles:semi.physics.axles.length,supportContacts:semi.visual.supportContacts.length},
  metricsOnly:true,
  authoredControllersSeparated:true
});
