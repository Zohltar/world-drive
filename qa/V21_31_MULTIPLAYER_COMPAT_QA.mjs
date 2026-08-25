import assert from 'node:assert/strict';
import fs from 'node:fs';

const mp=fs.readFileSync('src/multiplayer.js','utf8');
const main=fs.readFileSync('src/main.js','utf8');
const vehicles=fs.readFileSync('src/vehicle-system.js','utf8');

// Multiplayer must stay independent from authored GLB loaders. Remote peers are
// presentation-only and must never trigger local vehicle asset ownership.
for(const file of ['civic-glb','countach-glb','f1-glb','i3-glb','id4-glb','sonata-glb','wrx-glb']){
  assert(!mp.includes(file),`multiplayer.js must not import/use ${file}`);
}
assert(!mp.includes('GLTFLoader'),'multiplayer remote path must not depend on GLTFLoader');

// Local network state must advertise vehicle identity and the receiver must
// replace a peer visual when the remote vehicle changes.
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

// Network state fields that matter to current driving presentation.
for(const field of [
  'lat','lon','heading','speed','steer','braking','onRoad','skidFront','skidRear',
  'bodyPitch','bodyYaw','bodyRoll','bodyY','wheelPitch','wheelRoll'
]){
  assert(mp.includes(`${field}:state.${field}`),`local state must send ${field}`);
}

// Code splitting must remain local-only. The main bundle now loads authored
// passenger systems asynchronously, while multiplayer continues through its
// independent procedural/exact-geometry presentation path.
assert(main.includes("import('./countach-glb.js')"),'Countach authored system should remain dynamically imported');
assert(main.includes("import('./i3-glb.js')"),'i3 authored system should remain dynamically imported');
assert(!mp.includes("import('./"),'multiplayer client should not dynamically import authored vehicle modules');

// Detect fleet IDs that the lightweight built-in fallback does not model
// explicitly. This is informational rather than a regression failure because
// createRemoteVisual may provide the exact procedural visual path first.
const knownFleet=[...vehicles.matchAll(/\bid\s*:\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
const fallbackSpecs=[...mp.matchAll(/^\s{4}([a-zA-Z0-9_]+):\{color:/gm)].map(m=>m[1]);
const missingFallback=[...new Set(knownFleet.filter(id=>!fallbackSpecs.includes(id)))];

console.log('V21.31 MULTIPLAYER COMPAT QA: PASS',{
  authored_glb_dependency:false,
  vehicle_change_reset:true,
  peer_disposal:true,
  transmitted_fields:16,
  fleet_ids:[...new Set(knownFleet)],
  lightweight_fallback_ids:fallbackSpecs,
  missing_lightweight_fallback:missingFallback
});
