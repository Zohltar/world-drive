import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {
  mergeExactTransmissionGear,
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
  'src/multiplayer.js','src/multiplayer/multiplayer-client-m3.js','src/multiplayer-visuals.js','src/multiplayer/multiplayer-visuals-m3.js',
  'src/multiplayer/multiplayer-vehicle-adapter.js','src/deferred-glb-system.js','src/transmission-network-state.js',
  'src/vehicle-authored-registry.js','src/vehicle-glb-entries.js','src/multiplayer/multiplayer-vehicle-registry.js','src/multiplayer/multiplayer-support-math.js'
])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});

const entry=fs.readFileSync('src/multiplayer.js','utf8');
const client=fs.readFileSync('src/multiplayer/multiplayer-client-m3.js','utf8');
const visualEntry=fs.readFileSync('src/multiplayer-visuals.js','utf8');
const visuals=fs.readFileSync('src/multiplayer/multiplayer-visuals-m3.js','utf8');
const adapter=fs.readFileSync('src/multiplayer/multiplayer-vehicle-adapter.js','utf8');
const deferred=fs.readFileSync('src/deferred-glb-system.js','utf8');
const transmissionNetwork=fs.readFileSync('src/transmission-network-state.js','utf8');
const authoredRegistry=fs.readFileSync('src/vehicle-authored-registry.js','utf8');
const localEntries=fs.readFileSync('src/vehicle-glb-entries.js','utf8');
const main=fs.readFileSync('src/main.js','utf8');

assert(entry.includes("import('./multiplayer/multiplayer-client-m3.js')"),'public multiplayer client must lazy-load maintained client');
assert(!entry.includes("import {createMultiplayerClient as createMaintainedMultiplayerClient} from './multiplayer/multiplayer-client-m3.js'"),'maintained multiplayer client must stay out of startup bundle');
assert(entry.includes("from './transmission-network-state.js'"),'entry must read exact numeric transmission gear');
assert(visualEntry.includes("import('./multiplayer/multiplayer-visuals-m3.js')"),'public multiplayer visuals must lazy-load maintained visual runtime');
assert(!visualEntry.includes("export {createMultiplayerVisualSystem} from './multiplayer/multiplayer-visuals-m3.js'"),'visual runtime must stay out of startup bundle');
assert(entry.includes("const prepareVisuals=options.createRemoteVisual?.prepare"),'client must preload lazy visuals before socket connect');
assert(visualEntry.includes('createRemoteVehicleVisual.prepare=prepare'),'visual create callback must expose preload hook');
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
assert(client.includes("return {connect,disconnect,toggle,update,getPeers,isConnected:"),'maintained client API drift');
assert(entry.includes('transformOutgoingState:payload=>'),'lazy public client must scope wire transform to maintained client');
assert(entry.includes('transformIncomingPayload:raw=>'),'lazy public client must scope incoming compatibility to maintained client');
assert(!entry.includes('globalThis.WebSocket='),'multiplayer must never replace global WebSocket');

for(const [input,expectedGear,expectedReverse] of [[-1,-1,true],[0,0,false],[1,1,false],[2,2,false],[6,6,false]]){
  const merged=mergeExactTransmissionGear({type:'state',gear:99,reversing:!expectedReverse},input);
  assert.equal(merged.gear,expectedGear,`wire gear ${input} normalization drift`);
  assert.equal(merged.reversing,expectedReverse,`wire reversing must derive only from gear ${input}`);
}
const flooredForward=mergeExactTransmissionGear({type:'state'},3.9);
assert.equal(flooredForward.gear,3,'forward wire gear must normalize to integer');
assert.equal(flooredForward.reversing,false,'positive wire gear cannot request reverse');

resetLocalAuthoredPresentationState();
const fakeFacade=createDeferredGlbSystem({label:'QA Sonata',options:{},loadFactory:async()=>()=>({setActive(){},update(){},ready:true})});
fakeFacade.update(.016,{braking:true,reversing:true,nightLevel:.4});
assert.equal(readLocalAuthoredPresentationState().sequence,0,'inactive authored facade must not publish local presentation state');
fakeFacade.setActive(true);
fakeFacade.update(.016,{braking:true,reversing:true,nightLevel:.4});
const captured=readLocalAuthoredPresentationState();
assert.equal(captured.source,'QA Sonata','active authored source label drift');
assert.equal(captured.braking,true,'exact local authored brake request was not captured');
assert.equal(captured.reversing,true,'local authored reverse diagnostic capture drift');
assert.equal(captured.nightLevel,.4,'exact local authored night request was not captured');
const authoredMerged=mergeLocalAuthoredMultiplayerState({type:'state',vehicleId:'sonata',braking:false,reversing:false,gear:2},captured);
assert.equal(authoredMerged.braking,true,'network state must copy exact local authored brake request');
assert.equal(authoredMerged.nightLevel,.4,'network state must copy exact local authored night level');
assert.equal(authoredMerged.gear,2,'authored presentation must not rewrite numeric transmission gear');
assert.equal(authoredMerged.reversing,false,'authored presentation must not own reversing wire state');
const exactReverse=mergeExactTransmissionGear(authoredMerged,-1);
assert.equal(exactReverse.gear,-1,'exact transmission R must reach wire state');
assert.equal(exactReverse.reversing,true,'exact transmission R must force wire reverse');
fakeFacade.setActive(false);
assert.equal(readLocalAuthoredPresentationState().source,null,'deactivating authored facade must clear its published state');

const legacyReverse=upgradeLegacyMultiplayerState({type:'state',reversing:true});
assert.equal(legacyReverse.gear,-1,'legacy reversing=true must synthesize gear R');
const legacyForward=upgradeLegacyMultiplayerState({type:'state',reversing:false});
assert.equal(Object.hasOwn(legacyForward,'gear'),false,'legacy reversing=false must not invent a forward gear');
const currentPacket=upgradeLegacyMultiplayerState({type:'state',gear:3,reversing:false});
assert.equal(currentPacket.gear,3,'explicit numeric gear must never be rewritten');
const upgradedSnapshot=JSON.parse(upgradeLegacyMultiplayerPayload(JSON.stringify({type:'snapshot',states:[{id:'p1',reversing:true},{id:'p2',reversing:false},{id:'p3',gear:-1,reversing:true}]})));
assert.deepEqual(upgradedSnapshot.states.map(state=>state.gear??null),[-1,null,-1],'legacy snapshot gear upgrade drift');

assert(transmissionNetwork.includes('let gear=1'),'numeric transmission network state must have an explicit gear');
assert(transmissionNetwork.includes('return n<0?-1:n===0?0:Math.max(1,Math.floor(n))'),'numeric transmission gear normalization contract drift');
assert(entry.includes('readTransmissionNetworkGear()'),'multiplayer entrypoint must consume exact transmission-network gear');
assert(entry.includes('reversing:exactGear===-1'),'wire reverse must derive directly from numeric gear -1');
assert(!entry.includes('merged.gear=-1'),'authored visual state must no longer manufacture network gear');
assert(deferred.includes("method==='update'&&requestedActive"),'active local authored update must keep presentation diagnostics');

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

console.log('V21.31 MULTIPLAYER M4 LAZY CLIENT QA: PASS',{
  publicClient:'lazy -> multiplayer/multiplayer-client-m3',
  publicVisuals:'lazy -> multiplayer/multiplayer-visuals-m3',
  networkHz:30,
  numericGearContract:{reverse:-1,neutral:0,forward:'1..N'},
  exactTransmissionNetworkGear:true,
  reverseDerivedFromGearOnly:true,
  authoredBrakeNightParity:true,
  legacyRelayReverseCompatibility:true,
  visualSource:'same local authored controller',
  startupBundleDefersMultiplayer:true,
  globalWebSocketUntouched:true
});
