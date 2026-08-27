import assert from 'node:assert/strict';
import fs from 'node:fs';

const mp=fs.readFileSync('src/multiplayer.js','utf8');
const visuals=fs.readFileSync('src/multiplayer-visuals.js','utf8');
const procedural=fs.readFileSync('src/multiplayer-visuals-v18.js','utf8');
const hd=fs.readFileSync('src/multiplayer-hd-vehicles.js','utf8');
const vehicles=fs.readFileSync('src/vehicle-system.js','utf8');

// Multiplayer protocol and the lightweight wrapper must remain independent from
// the LOCAL authored GLB runtime systems. Remote HD owns a separate lazy cache.
for(const file of ['civic-glb','countach-glb','f1-glb','i3-glb','id4-glb','sonata-glb','wrx-glb']){
  assert(!mp.includes(file),`multiplayer.js must not import/use ${file}`);
  assert(!visuals.includes(file),`multiplayer-visuals.js must not import/use ${file}`);
  assert(!hd.includes(`./${file}.js`),`remote HD cache must not import local runtime ${file}`);
}
assert(!mp.includes('GLTFLoader'),'multiplayer network path must not depend on GLTFLoader');
assert(!visuals.includes('GLTFLoader'),'multiplayer wrapper must keep GLTFLoader behind lazy cache');
assert(hd.includes("import('three/addons/loaders/GLTFLoader.js')"),'remote HD loader must remain lazy/dynamic');

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
assert(visuals.includes('lateLoadsIgnored'),'late async HD completion must be disposal-safe');

// V18 remote procedural geometry remains the exact support/fallback source.
assert(visuals.includes("from './multiplayer-visuals-v18.js'"),'HD wrapper must retain procedural baseline');
assert(procedural.includes('bodyGroup.children.filter'),'remote support body must come from procedural fleet geometry');
assert(procedural.includes('child.userData?.vehicleId===vehicleId'),'remote body selection must be vehicle-specific');
assert(procedural.includes('sourceWheel.vehicleId!==vehicleId'),'remote wheel selection must be vehicle-specific');
assert(visuals.includes('pivot.visible=false'),'HD layer must hide support wheels without removing them');

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
  local_authored_runtime_dependency:false,
  remote_visual_source:'lazy authored GLB over procedural support skeleton',
  vehicle_change_reset:true,
  peer_disposal:true,
  transmitted_fields:stateFields.length,
  fleet_ids:[...new Set(knownFleet)],
  lightweight_fallback_ids:fallbackSpecs,
  missing_lightweight_fallback:missingFallback
});
