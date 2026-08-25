import assert from 'node:assert/strict';
import fs from 'node:fs';

const multiplayer=fs.readFileSync('src/multiplayer.js','utf8');
const visuals=fs.readFileSync('src/multiplayer-visuals.js','utf8');
const main=fs.readFileSync('src/main.js','utf8');

// Multiplayer remote presentation must stay independent from authored local GLBs.
for(const path of [
  './civic-glb.js','./countach-glb.js','./f1-glb.js','./i3-glb.js',
  './id4-glb.js','./sonata-glb.js','./wrx-glb.js'
]){
  assert(!multiplayer.includes(path),`multiplayer.js unexpectedly depends on ${path}`);
  assert(!visuals.includes(path),`multiplayer-visuals.js unexpectedly depends on ${path}`);
}

// Remote exact visuals are built from already-authored procedural sources.
assert(visuals.includes('bodyGroup.children.filter'), 'remote visuals must select procedural body sources');
assert(visuals.includes('child.userData?.vehicleId===vehicleId'), 'remote body selection must be vehicle-specific');
assert(visuals.includes('sourceWheel.vehicleId!==vehicleId'), 'remote wheels must be vehicle-specific');
assert(visuals.includes('return null;'), 'exact remote visual must permit fallback when a source is unavailable');

// Client must replace the remote presentation cleanly when vehicle/name changes.
assert(multiplayer.includes('function replacePeerVisual(peer,vehicleId)'), 'missing remote visual replacement path');
assert(multiplayer.includes('if(vehicleId!==peer.vehicleId||name!==peer.name)'), 'remote vehicle changes must trigger replacement');
assert(multiplayer.includes('peer.visual.dispose();'), 'old remote visual must be disposed on replacement');
assert(multiplayer.includes('peer.snapshots.length=0;'), 'vehicle replacement must reset interpolation history');

// Local authored systems are code-split, but multiplayer itself remains statically available.
assert(/import\s*\{\s*createMultiplayerClient\s*\}\s*from\s*['"]\.\/multiplayer\.js['"]/.test(main), 'multiplayer client must remain in startup bundle');
assert(/import\s*\{\s*createMultiplayerVisualSystem\s*\}\s*from\s*['"]\.\/multiplayer-visuals\.js['"]/.test(main), 'multiplayer visuals must remain in startup bundle');

// Supported remote passenger profiles. Unknown IDs deliberately fall back rather than disappear.
for(const vehicleId of ['id4','wrx','civic','sonata','i3_2017','f1_2010']){
  assert(multiplayer.includes(`${vehicleId}:`)||visuals.includes(`${vehicleId}:`),`${vehicleId}: missing remote presentation profile`);
}
assert(multiplayer.includes("const s=specs[vehicleId]||specs.wrx;"), 'unknown remote vehicle IDs must retain visible fallback');

console.log('V21.31 MULTIPLAYER / GLB ISOLATION QA: PASS',{
  remoteVisualSource:'procedural fleet geometry',
  authoredGlbDependency:false,
  vehicleChangeReplacement:true,
  unknownVehicleFallback:'wrx'
});
