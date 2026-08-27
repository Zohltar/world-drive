import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {
  mergeLocalAuthoredMultiplayerState,
  upgradeLegacyMultiplayerState,
  upgradeLegacyMultiplayerPayload
} from '../src/multiplayer.js';
import {
  createDeferredGlbSystem,
  readLocalAuthoredPresentationState,
  resetLocalAuthoredPresentationState
} from '../src/deferred-glb-system.js';

for(const file of [
  'src/multiplayer.js',
  'src/multiplayer-client-m3.js',
  'src/multiplayer-visuals.js',
  'src/multiplayer-visuals-m3.js',
  'src/multiplayer-vehicle-adapter.js',
  'src/deferred-glb-system.js',
  'src/vehicle-authored-registry.js',
  'src/vehicle-glb-entries.js',
  'src/multiplayer-vehicle-registry.js',
  'src/multiplayer-support-math.js'
])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});

const entry=fs.readFileSync('src/multiplayer.js','utf8');
const client=fs.readFileSync('src/multiplayer-client-m3.js','utf8');
const visualEntry=fs.readFileSync('src/multiplayer-visuals.js','utf8');
const visuals=fs.readFileSync('src/multiplayer-visuals-m3.js','utf8');
const adapter=fs.readFileSync('src/multiplayer-vehicle-adapter.js','utf8');
const deferred=fs.readFileSync('src/deferred-glb-system.js','utf8');
const authoredRegistry=fs.readFileSync('src/vehicle-authored-registry.js','utf8');
const localEntries=fs.readFileSync('src/vehicle-glb-entries.js','utf8');
const main=fs.readFileSync('src/main.js','utf8');

assert(entry.includes("from './multiplayer-client-m3.js'"),'public multiplayer client must route through maintained client');
assert(entry.includes("from './deferred-glb-system.js'"),'public multiplayer client must consume exact local authored presentation state');
assert(visualEntry.includes("from './multiplayer-visuals-m3.js'"),'public multiplayer visuals must route through maintained visual entrypoint');
assert(client.includes("from './multiplayer-vehicle-registry.js'"),'client must consume central metric registry');
assert(!client.includes('VEHICLE_WHEELBASE'),'client must not duplicate wheelbases');
assert(client.includes('getMultiplayerVehicleSpec(snapshot.vehicleId).physics.wheelbase'),'prediction must use registry wheelbase');
assert(client.includes('const NETWORK_STATE_HZ=30'),'network cadence must remain 30 Hz');
assert(client.includes("lightingProtocol:'m2.4'"),'lighting protocol marker must remain explicit');
assert(client.includes('reversing:lighting.reversing'),'reverse state must be transmitted independently of speed');
assert(client.includes('nightLevel:lighting.nightLevel'),'night state must be transmitted');
assert(client.includes('signalLeft:lighting.signalLeft')&&client.includes('signalRight:lighting.signalRight'),'signal sides must be transmitted');
assert(client.includes('signalBlink:lighting.signalBlink'),'blink phase must be transmitted');
assert(client.includes('peer.visual.updateRemoteVehicle?.(dt,remoteState)'),'sampled peer state must feed the M4 local-controller adapter');
assert(client.includes('solveRemoteSupport?.({lat:peer.lat,lon:peer.lon,heading:peer.heading,visual:peer.visual})'),'receiver-local support must remain after interpolation');
assert(client.includes("return {connect,disconnect,toggle,update,getPeers,isConnected:"),'public client API drift');

// M4.7: reproduce the actual local authored path. An inactive local facade must
// not publish; once active, the exact state passed to update() becomes the
// multiplayer presentation authority even before its async GLB factory loads.
resetLocalAuthoredPresentationState();
const fakeFacade=createDeferredGlbSystem({
  label:'QA Sonata',
  options:{},
  loadFactory:async()=>()=>({setActive(){},update(){},ready:true})
});
fakeFacade.update(.016,{braking:true,reversing:true,nightLevel:.4});
assert.equal(readLocalAuthoredPresentationState().sequence,0,'inactive authored facade must not publish local presentation state');
fakeFacade.setActive(true);
fakeFacade.update(.016,{braking:true,reversing:true,nightLevel:.4});
const captured=readLocalAuthoredPresentationState();
assert.equal(captured.source,'QA Sonata','active authored source label drift');
assert.equal(captured.braking,true,'exact local authored brake request was not captured');
assert.equal(captured.reversing,true,'exact local authored reverse request was not captured');
assert.equal(captured.nightLevel,.4,'exact local authored night request was not captured');

const mergedReverse=mergeLocalAuthoredMultiplayerState(
  {type:'state',vehicleId:'sonata',braking:false,reversing:false,gear:1},
  captured
);
assert.equal(mergedReverse.braking,true,'network state must copy exact local authored brake request');
assert.equal(mergedReverse.reversing,true,'network state must copy exact local authored reverse request');
assert.equal(mergedReverse.gear,-1,'local authored reversing=true must force explicit network R regardless of stale gear');
assert.equal(mergedReverse.nightLevel,.4,'network state must copy exact local authored night level');

fakeFacade.update(.016,{braking:false,reversing:false,nightLevel:.2});
const capturedForward=readLocalAuthoredPresentationState();
const mergedForward=mergeLocalAuthoredMultiplayerState(
  {type:'state',vehicleId:'sonata',gear:-1,reversing:true},
  capturedForward
);
assert.equal(mergedForward.reversing,false,'local authored reverse-off must override stale network reverse');
assert.equal(Object.hasOwn(mergedForward,'gear'),false,'stale explicit R must be removed when local authored reverse is off');
fakeFacade.setActive(false);
assert.equal(readLocalAuthoredPresentationState().source,null,'deactivating authored facade must clear its published state');

// Legacy relay compatibility: old relays already forward reversing. Synthesize
// R only for an explicit reverse request; never invent a forward gear when the
// old packet simply has no gear information.
const legacyReverse=upgradeLegacyMultiplayerState({type:'state',reversing:true});
assert.equal(legacyReverse.gear,-1,'legacy reversing=true must synthesize gear R');
const legacyForward=upgradeLegacyMultiplayerState({type:'state',reversing:false});
assert.equal(Object.hasOwn(legacyForward,'gear'),false,'legacy reversing=false must not invent a forward gear');
const currentPacket=upgradeLegacyMultiplayerState({type:'state',gear:3,reversing:false});
assert.equal(currentPacket.gear,3,'explicit M4.1+ gear must never be rewritten');
const upgradedSnapshot=JSON.parse(upgradeLegacyMultiplayerPayload(JSON.stringify({type:'snapshot',states:[
  {id:'p1',reversing:true},
  {id:'p2',reversing:false},
  {id:'p3',gear:-1,reversing:true}
]})));
assert.deepEqual(upgradedSnapshot.states.map(state=>state.gear??null),[-1,null,-1],'legacy snapshot gear upgrade drift');

assert(deferred.includes("method==='update'&&requestedActive"),'active local authored update must publish exact presentation state');
assert(deferred.includes('publishLocalAuthoredPresentationState(label,args[1]||{})'),'local authored state capture must occur at facade boundary');
assert(entry.includes('mergeLocalAuthoredMultiplayerState'),'multiplayer entrypoint must merge exact local authored state');
assert(entry.includes('merged.gear=-1'),'authored reverse request must force network R');

assert(visuals.includes("from './multiplayer-vehicle-adapter.js'"),'remote visuals must use M4 adapter');
assert(visuals.includes('exact LOCAL authored controller'),'M4 local-controller parity documentation missing');
assert(!visuals.includes('createRemoteHdVehicle'),'M4 must not maintain a second remote GLB loader');
assert(!visuals.includes('createRemoteAuthoredLighting'),'M4 must not maintain a second remote lamp controller');
assert(!visuals.includes('multiplayer-hd-vehicles-m3')&&!visuals.includes('multiplayer-hd-vehicles-m31'),'retired remote GLB cache must not return to runtime');
assert(!visuals.includes('multiplayer-authored-lighting'),'retired remote lamp implementation must not return to runtime');
assert(adapter.includes('loadAuthoredVehicleFactory(vehicleId)'),'adapter must instantiate the canonical local factory');
assert(adapter.includes('createVehicleSystem({initialId:vehicleId})'),'remote peers must use isolated vehicle systems');
assert(authoredRegistry.includes("semi_6x4:Object.freeze"),'canonical authored registry must include semi');
assert(localEntries.includes("from './vehicle-authored-registry.js'"),'local GLB entries must resolve through the same registry as multiplayer');

assert(main.includes("import { createMultiplayerClient } from './multiplayer.js';"),'main must consume public multiplayer client entrypoint');
assert(main.includes("import { createMultiplayerVisualSystem } from './multiplayer-visuals.js';"),'main must consume public multiplayer visual entrypoint');
assert(main.includes('createRemoteVisual:multiplayerVisuals.createRemoteVehicleVisual'),'main must inject remote visuals');
assert(main.includes('solveRemoteSupport:multiplayerVisuals.solveRemoteVehicleSupport'),'main must inject receiver-local support');

console.log('V21.31 MULTIPLAYER M4.7 CLIENT QA: PASS',{
  publicClient:'multiplayer-client-m3',
  publicVisuals:'multiplayer-visuals-m3',
  networkHz:30,
  localAuthoredPresentationAuthority:true,
  exactReverseReplication:true,
  staleGearCannotOverrideLocalReverse:true,
  legacyRelayReverseCompatibility:true,
  visualSource:'same local authored controller',
  duplicateRemoteVisualImplementation:false
});
