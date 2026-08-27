import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createVehicleSystem} from '../src/vehicle-system.js';
import {getMultiplayerVehicleSpec,listMultiplayerVehicleSpecs,listMultiplayerVehicleIds} from '../src/multiplayer-vehicle-registry.js';

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
  for(let i=0;i<local.physics.axles.length;i++){
    const axle=local.physics.axles[i];
    const remoteAxle=remote.physics.axles[i];
    assert.equal(remoteAxle.id,axle.id,`${id}: axle id drift`);
    assert.equal(remoteAxle.positionM,axle.positionM,`${id}: axle longitudinal position drift`);
    assert.equal(remoteAxle.trackWidth,axle.trackWidth,`${id}: axle track drift`);
  }
}

const semi=getMultiplayerVehicleSpec('semi_6x4');
assert.equal(semi.physics.wheelbase,5.45,'semi must use authoritative 5.45 m wheelbase');
assert.equal(semi.physics.axles.length,3,'semi must expose three physical axles');
assert.equal(semi.visual.supportContacts.length,6,'semi terrain support must use six left/right contact probes');

for(const id of ['id4','wrx','civic','sonata','f1_2010','countach_80','i3_2017']){
  assert.equal(getMultiplayerVehicleSpec(id).hd.enabled,true,`${id}: HD remote asset must be registered`);
}
assert.equal(semi.hd.enabled,false,'semi currently has no authored HD GLB and must use registry support visual');

const fallback=fs.readFileSync('src/multiplayer-fallback-visual.js','utf8');
const hd=fs.readFileSync('src/multiplayer-hd-vehicles-m3.js','utf8');
const support=fs.readFileSync('src/multiplayer-visuals-v18.js','utf8');
assert(fallback.includes("from './multiplayer-vehicle-registry.js'"),'fallback must read registry metrics');
assert(!fallback.includes('const SPECS='),'fallback must not reintroduce hand-maintained vehicle metrics');
assert(hd.includes("from './multiplayer-vehicle-registry.js'"),'HD cache must read registry metrics');
assert(!hd.includes('REMOTE_HD_SPECS'),'HD cache must not reintroduce a second HD spec table');
assert(support.includes("from './multiplayer-support-math.js'"),'runtime support must use pure tested support solver');
assert(!support.includes('contacts.length!==4'),'multi-axle support must not assume exactly four contacts');

console.log('V21.31 MULTIPLAYER M3 REGISTRY QA: PASS',{
  fleet:authoritativeIds,
  specs:listMultiplayerVehicleSpecs().length,
  semi:{wheelbase:semi.physics.wheelbase,axles:semi.physics.axles.length,supportContacts:semi.visual.supportContacts.length},
  duplicatedFallbackMetrics:false,
  duplicatedHdSpecs:false
});
