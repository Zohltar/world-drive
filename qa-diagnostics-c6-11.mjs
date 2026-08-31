import assert from 'node:assert/strict';
import fs from 'node:fs';

const facadeSource=fs.readFileSync('src/multiplayer-visuals.js','utf8');
const loadedSource=fs.readFileSync('src/multiplayer-visuals-m3.js','utf8');
for(const source of [facadeSource,loadedSource]){
  assert.ok(source.includes("import {ensureWorldDriveDiagnostics} from './diagnostics.js';"),'multiplayer visual diagnostics root import missing');
  assert.ok(!source.includes('__WORLD_DRIVE_MULTIPLAYER_HD_VISUALS__'),'legacy multiplayer HD diagnostics global remains');
}
assert.ok(facadeSource.includes('ensureWorldDriveDiagnostics().multiplayer.hdVisuals=diagnostics'),'lazy multiplayer visual diagnostics canonical writer missing');
assert.ok(loadedSource.includes('ensureWorldDriveDiagnostics().multiplayer.hdVisuals=diagnostics'),'loaded multiplayer visual diagnostics canonical writer missing');
assert.ok(facadeSource.includes("const module=await import('./multiplayer-visuals-m3.js')"),'lazy multiplayer visual load boundary changed');
assert.ok(loadedSource.includes('installPresentationSmoothing(THREE,support,perf)'),'presentation smoothing path changed');
assert.ok(loadedSource.includes('createRemoteVehicleAdapter({'),'authored remote adapter path changed');
assert.ok(loadedSource.includes('support.root.scale.set(VEHICLE_RENDER_ROOT_SCALE'),'shared render scale path changed');

try{delete globalThis.WorldDriveDiagnostics;}catch{}
try{delete globalThis.__WORLD_DRIVE_MULTIPLAYER_HD_VISUALS__;}catch{}

const facadeModule=await import(`./src/multiplayer-visuals.js?c611=${Date.now()}`);
const facade=facadeModule.createMultiplayerVisualSystem({});
assert.equal(typeof globalThis.WorldDriveDiagnostics?.multiplayer?.hdVisuals,'function','lazy canonical multiplayer HD diagnostics not installed');
assert.equal(globalThis.__WORLD_DRIVE_MULTIPLAYER_HD_VISUALS__,undefined,'legacy HD diagnostics global recreated by lazy facade');
const lazy=globalThis.WorldDriveDiagnostics.multiplayer.hdVisuals();
assert.deepEqual(Object.keys(lazy),['enabled','lazy','loaded','loading','loadError','visualSource'],'lazy diagnostics payload shape changed');
assert.deepEqual(lazy,{
  enabled:false,
  lazy:true,
  loaded:false,
  loading:false,
  loadError:null,
  visualSource:'same-local-authored-controller'
});
assert.deepEqual(facade.diagnostics(),lazy,'canonical lazy diagnostics must preserve facade payload');

const loadedModule=await import(`./src/multiplayer-visuals-m3.js?c611=${Date.now()}`);
const loadedSystem=loadedModule.createMultiplayerVisualSystem({});
assert.equal(typeof globalThis.WorldDriveDiagnostics.multiplayer.hdVisuals,'function','loaded canonical multiplayer HD diagnostics not installed');
assert.equal(globalThis.__WORLD_DRIVE_MULTIPLAYER_HD_VISUALS__,undefined,'legacy HD diagnostics global recreated by loaded system');
const loaded=globalThis.WorldDriveDiagnostics.multiplayer.hdVisuals();
assert.equal(loaded.enabled,true);
assert.equal(loaded.mode,'multiplayer-m4.2-local-controller-parity');
assert.equal(loaded.visualSource,'same-local-authored-controller');
assert.equal(loaded.visualsCreated,0);
assert.equal(loaded.adapterCreated,0);
assert.equal(loaded.smoothingVisuals,0);
assert.deepEqual(loaded.adapters,[]);
assert.deepEqual(loaded.smoothing,{positionRate:30,yawRate:26,receiverSupportAligned:true,verticalDoubleSmoothing:false});
assert.deepEqual(loadedSystem.diagnostics(),loaded,'canonical loaded diagnostics must preserve M4 payload');

const second=globalThis.WorldDriveDiagnostics.multiplayer.hdVisuals();
assert.notEqual(second,loaded,'loaded HD diagnostics must allocate a fresh snapshot per invocation');
assert.notEqual(second.smoothing,loaded.smoothing,'smoothing diagnostics must allocate per invocation');
assert.notEqual(second.adapters,loaded.adapters,'adapter diagnostics list must allocate per invocation');

console.log('CLEANUP C6.11 MULTIPLAYER HD VISUAL DIAGNOSTICS QA: PASS',{
  legacyRemoved:true,
  canonicalPath:'WorldDriveDiagnostics.multiplayer.hdVisuals',
  lazyPayloadPreserved:true,
  loadedPayloadPreserved:true,
  lazyToLoadedOwnershipPreserved:true,
  renderingPathUntouched:true
});
