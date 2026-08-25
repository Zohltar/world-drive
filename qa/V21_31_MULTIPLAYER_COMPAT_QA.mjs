import assert from 'node:assert/strict';
import fs from 'node:fs';

const mp=fs.readFileSync('src/multiplayer.js','utf8');
const visuals=fs.readFileSync('src/multiplayer-visuals.js','utf8');
const vehicles=fs.readFileSync('src/vehicle-system.js','utf8');

// Remote multiplayer presentation must remain independent from authored local GLBs.
for(const file of ['civic-glb','countach-glb','f1-glb','i3-glb','id4-glb','sonata-glb','wrx-glb']){
  assert(!mp.includes(file),`multiplayer.js must not import/use ${file}`);
  assert(!visuals.includes(file),`multiplayer-visuals.js must not import/use ${file}`);
}
assert(!mp.includes('GLTFLoader'),'multiplayer remote path must not depend on GLTFLoader');
assert(!visuals.includes('GLTFLoader'),'multiplayer visuals must not depend on GLTFLoader');

// Local state advertises vehicle identity and receiver swaps presentation safely.
assert(mp.includes('vehicleId:state.vehicleId'),'local multiplayer state must send vehicleId');
assert(mp.includes('const vehicleId=message.vehicleId||peer.vehicleId'),'remote state must read vehicleId');
assert(mp.includes('if(vehicleId!==peer.vehicleId||name!==peer.name)'),'remote vehicle/name change must replace presentation');
assert(mp.includes('replacePeerVisual(peer,vehicleId)'),'remote visual replacement must be invoked');
assert(mp.includes('peer.snapshots.length=0'),'vehicle replacement must clear interpolation history');

// Lifecycle/disposal safety for join/leave/reconnect.
assert(mp.includes('peer.visual.dispose()'),'peer visual must dispose resources');
assert(mp.includes('scene.remove(peer.visual.root)'),'peer visual must leave scene on replacement/removal');
assert(mp.includes('clearPeers()'),'multiplayer client must expose/use peer clearing logic');
assert(mp.includes('onRemotePeerRemoved?.(id)'),'remote removal callback must be preserved');

// Exact remote visuals clone procedural body/wheels; authored local GLB readiness is irrelevant.
assert(visuals.includes('bodyGroup.children.filter'),'remote exact body must come from procedural fleet geometry');
assert(visuals.includes('child.userData?.vehicleId===vehicleId'),'remote body selection must be vehicle-specific');
assert(visuals.includes('sourceWheel.vehicleId!==vehicleId'),'remote wheel selection must be vehicle-specific');

const stateFields=[
  'lat','lon','heading','speed','steer','braking','onRoad','skidFront','skidRear',
  'bodyPitch','bodyYaw','bodyRoll','bodyY','wheelPitch','wheelRoll'
];
for(const field of stateFields){
  assert(mp.includes(`${field}:state.${field}`),`local state must send ${field}`);
}

const knownFleet=[...vehicles.matchAll(/\bid\s*:\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
const fallbackSpecs=[...mp.matchAll(/^\s{4}([a-zA-Z0-9_]+):\{color:/gm)].map(m=>m[1]);
const missingFallback=[...new Set(knownFleet.filter(id=>!fallbackSpecs.includes(id)))];

console.log('V21.31 MULTIPLAYER COMPAT QA: PASS',{
  authored_glb_dependency:false,
  remote_visual_source:'procedural fleet',
  vehicle_change_reset:true,
  peer_disposal:true,
  transmitted_fields:stateFields.length,
  fleet_ids:[...new Set(knownFleet)],
  lightweight_fallback_ids:fallbackSpecs,
  missing_lightweight_fallback:missingFallback
});
