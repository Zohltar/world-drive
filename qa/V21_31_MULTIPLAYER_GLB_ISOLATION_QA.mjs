import assert from 'node:assert/strict';
import fs from 'node:fs';

const multiplayer=fs.readFileSync('src/multiplayer.js','utf8');
const visuals=fs.readFileSync('src/multiplayer-visuals.js','utf8');
const procedural=fs.readFileSync('src/multiplayer-visuals-v18.js','utf8');
const hd=fs.readFileSync('src/multiplayer-hd-vehicles.js','utf8');
const main=fs.readFileSync('src/main.js','utf8');

// Remote HD must remain independent from the LOCAL authored runtime systems.
// Those systems are tied to vehicleSystem.activeId and would make a remote peer
// hide/show the local car. Multiplayer owns a separate lazy asset cache instead.
for(const path of [
  './civic-glb.js','./countach-glb.js','./f1-glb.js','./i3-glb.js',
  './id4-glb.js','./sonata-glb.js','./wrx-glb.js'
]){
  assert(!multiplayer.includes(path),`multiplayer.js unexpectedly depends on ${path}`);
  assert(!visuals.includes(path),`multiplayer-visuals.js unexpectedly depends on ${path}`);
  assert(!hd.includes(path),`multiplayer HD cache unexpectedly depends on ${path}`);
}

// V18 procedural visual/support remains available as immediate fallback and as
// the hidden receiver-local terrain/suspension skeleton after the HD swap.
assert(visuals.includes("from './multiplayer-visuals-v18.js'"),'HD wrapper must preserve V18 fallback');
assert(procedural.includes('bodyGroup.children.filter'),'procedural baseline must still select body sources');
assert(procedural.includes('child.userData?.vehicleId===vehicleId'),'procedural body selection must stay vehicle-specific');
assert(procedural.includes('sourceWheel.vehicleId!==vehicleId'),'procedural wheels must stay vehicle-specific');
assert(visuals.includes('pivot.visible=false'),'HD swap must hide rather than destroy support pivots');
assert(visuals.includes('procedural.bodyMeshes'),'HD swap must hide the old visible body only after attach');

// HD loading is lazy: no GLTFLoader in the startup import graph until a remote
// supported vehicle asks for a model. Templates are shared, peer scenes cloned.
assert(hd.includes("import('three/addons/loaders/GLTFLoader.js')"),'remote GLB loader must be dynamic');
assert(hd.includes("import('three/addons/utils/SkeletonUtils.js')"),'remote skeleton clone helper must be dynamic');
assert(hd.includes('templatePromises=new Map()'),'remote model load promises must be cached');
assert(hd.includes('templates=new Map()'),'normalized templates must be cached');
assert(hd.includes('createRemoteHdVehicle'),'missing remote HD clone factory');
assert(visuals.includes('createRemoteHdVehicle(THREE,vehicleId)'),'remote visual must request HD asynchronously');
assert(visuals.includes('if(!instance?.root)'),'failed HD request must retain fallback');
assert(visuals.includes('lateLoadsIgnored'),'disposed peers must ignore late async loads');

// Client still replaces the whole peer presentation cleanly on vehicle/name change.
assert(multiplayer.includes('function replacePeerVisual(peer,vehicleId)'), 'missing remote visual replacement path');
assert(multiplayer.includes('if(vehicleId!==peer.vehicleId||name!==peer.name)'), 'remote vehicle changes must trigger replacement');
assert(multiplayer.includes('peer.visual.dispose();'), 'old remote visual must be disposed on replacement');
assert(multiplayer.includes('peer.snapshots.length=0;'), 'vehicle replacement must reset interpolation history');

// Startup keeps only the lightweight multiplayer modules; the heavy vehicle GLBs
// are referenced as Vite URLs and fetched only by the remote HD cache on demand.
assert(/import\s*\{\s*createMultiplayerClient\s*\}\s*from\s*['"]\.\/multiplayer\.js['"]/.test(main), 'multiplayer client must remain in startup bundle');
assert(/import\s*\{\s*createMultiplayerVisualSystem\s*\}\s*from\s*['"]\.\/multiplayer-visuals\.js['"]/.test(main), 'multiplayer visuals must remain in startup bundle');

const requiredAssets={
  wrx:'subaru_wrx_vb.glb',
  id4:'id4_2021_detailed.glb',
  civic:'2006_honda_civic_si.glb',
  sonata:'2006_hyundai_sonata.glb',
  i3_2017:'2017_bmw_i3.glb',
  f1_2010:'f1_2010_ferrari.glb',
  countach_80:'countach_80.glb'
};
for(const [vehicleId,asset] of Object.entries(requiredAssets)){
  assert(hd.includes(`${vehicleId}:Object.freeze`),`${vehicleId}: missing remote HD profile`);
  assert(hd.includes(asset),`${vehicleId}: missing authored remote GLB asset ${asset}`);
}

// Unknown/unsupported IDs still fall through to the old visible WRX procedural
// fallback instead of disappearing.
assert(multiplayer.includes("const s=specs[vehicleId]||specs.wrx;"), 'unknown remote vehicle IDs must retain visible fallback');

console.log('V21.31 MULTIPLAYER / LAZY HD ISOLATION QA: PASS',{
  remoteVisualSource:'lazy authored GLB + procedural support fallback',
  localGlbRuntimeDependency:false,
  templateCache:true,
  supportedRemoteHd:Object.keys(requiredAssets),
  unknownVehicleFallback:'wrx'
});
