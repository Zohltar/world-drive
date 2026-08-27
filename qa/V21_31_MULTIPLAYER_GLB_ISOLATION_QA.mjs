import assert from 'node:assert/strict';
import fs from 'node:fs';

const multiplayer=fs.readFileSync('src/multiplayer.js','utf8');
const visuals=fs.readFileSync('src/multiplayer-visuals.js','utf8');
const procedural=fs.readFileSync('src/multiplayer-visuals-v18.js','utf8');
const fallback=fs.readFileSync('src/multiplayer-fallback-visual.js','utf8');
const hd=fs.readFileSync('src/multiplayer-hd-vehicles.js','utf8');
const main=fs.readFileSync('src/main.js','utf8');

for(const path of [
  './civic-glb.js','./countach-glb.js','./f1-glb.js','./i3-glb.js',
  './id4-glb.js','./sonata-glb.js','./wrx-glb.js'
]){
  assert(!multiplayer.includes(path),`multiplayer.js unexpectedly depends on ${path}`);
  assert(!visuals.includes(path),`multiplayer-visuals.js unexpectedly depends on ${path}`);
  assert(!hd.includes(path),`multiplayer HD cache unexpectedly depends on ${path}`);
}

assert(visuals.includes("from './multiplayer-visuals-v18.js'"),'HD wrapper must preserve V18 exact fallback');
assert(visuals.includes("from './multiplayer-fallback-visual.js'"),'HD wrapper must own guaranteed support fallback');
assert(procedural.includes('bodyGroup.children.filter'),'procedural baseline must still select body sources');
assert(procedural.includes('child.userData?.vehicleId===vehicleId'),'procedural body selection must stay vehicle-specific');
assert(procedural.includes('sourceWheel.vehicleId!==vehicleId'),'procedural wheels must stay vehicle-specific');
assert(visuals.includes('visual=createRemoteSupportFallback(THREE,vehicleId,name)'),'failed exact clone must create upgradeable fallback');
assert(visuals.includes('supportFallbacks'),'fallback usage must be observable');
assert(visuals.includes('attachParent=visual.bodyGroup||visual.root'),'HD attach must support both exact and lightweight fallbacks');

const fallbackIndex=visuals.indexOf('visual=createRemoteSupportFallback(THREE,vehicleId,name)');
const safetyReturnIndex=visuals.indexOf('if(!visual)return visual;',fallbackIndex);
const hdRequestIndex=visuals.indexOf('createRemoteHdVehicle(THREE,vehicleId)');
assert(fallbackIndex>=0,'missing guaranteed fallback creation');
assert(safetyReturnIndex>fallbackIndex,'safety return must occur only after guaranteed fallback attempt');
assert(hdRequestIndex>safetyReturnIndex,'HD request must occur after fallback-safe visual exists');

assert(fallback.includes('const wheels=['),'support fallback must expose four wheel pivots');
assert(fallback.includes('baseX:x'),'support fallback must preserve wheel X support geometry');
assert(fallback.includes('baseZ:z'),'support fallback must preserve wheel Z support geometry');
assert(visuals.includes('pivot.visible=false'),'HD swap must hide rather than destroy support pivots');

// Remote grade-following architecture: the fallback/HD body must have the same
// sprung-body separation as the local vehicle. Pitch/roll apply to bodyGroup,
// while support wheels stay directly under root and retain stable contact X/Z.
assert(fallback.includes('const bodyGroup=new THREE.Group()'),'fallback must expose a sprung bodyGroup');
assert(fallback.includes("bodyGroup.rotation.order='XYZ'"),'fallback bodyGroup must use stable local Euler order');
assert(fallback.includes('root.add(bodyGroup)'),'sprung bodyGroup must be attached to remote root');
assert(fallback.includes('bodyGroup.add(body)'),'fallback body must live on sprung bodyGroup');
assert(fallback.includes('bodyGroup.add(cabin)'),'fallback cabin must live on sprung bodyGroup');
assert(fallback.includes('bodyGroup.add(lamp)'),'fallback rear lamps must follow sprung body attitude');
assert(fallback.includes('for(const entry of wheels)root.add(entry.pivot)'),'support wheels must remain outside sprung bodyGroup');
assert(fallback.includes('bodyGroup,'),'fallback must return bodyGroup to multiplayer pose solver');
assert(!fallback.includes('bodyGroup:null'),'fallback must not use root-level sign-inverted pitch path');

assert(hd.includes("import('three/addons/loaders/GLTFLoader.js')"),'remote GLB loader must be dynamic');
assert(hd.includes("import('three/addons/utils/SkeletonUtils.js')"),'remote skeleton clone helper must be dynamic');
assert(hd.includes('templatePromises=new Map()'),'remote model load promises must be cached');
assert(hd.includes('templates=new Map()'),'normalized templates must be cached');
assert(hd.includes('createRemoteHdVehicle'),'missing remote HD clone factory');
assert(visuals.includes('createRemoteHdVehicle(THREE,vehicleId)'),'every upgradeable remote visual must request HD asynchronously');
assert(visuals.includes('if(!instance?.root||!attachParent)'),'failed HD request must retain fallback');
assert(visuals.includes('lateLoadsIgnored'),'disposed peers must ignore late async loads');

assert(multiplayer.includes('function replacePeerVisual(peer,vehicleId)'), 'missing remote visual replacement path');
assert(multiplayer.includes('if(vehicleId!==peer.vehicleId||name!==peer.name)'), 'remote vehicle changes must trigger replacement');
assert(multiplayer.includes('peer.visual.dispose();'), 'old remote visual must be disposed on replacement');
assert(multiplayer.includes('peer.snapshots.length=0;'), 'vehicle replacement must reset interpolation history');

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

assert(multiplayer.includes("const s=specs[vehicleId]||specs.wrx;"), 'legacy client fallback must remain as final safety net');

console.log('V21.31 MULTIPLAYER / GUARANTEED LAZY HD QA: PASS',{
  remoteVisualSource:'lazy authored GLB + guaranteed support fallback',
  localGlbRuntimeDependency:false,
  guaranteedUpgradeAfterExactFailure:true,
  slopeFollowingBodyGroup:true,
  supportWheelsRemainRootSpace:true,
  templateCache:true,
  supportedRemoteHd:Object.keys(requiredAssets)
});
