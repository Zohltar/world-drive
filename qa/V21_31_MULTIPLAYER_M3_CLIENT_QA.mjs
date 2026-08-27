import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

for(const file of [
  'src/multiplayer.js',
  'src/multiplayer-client-m3.js',
  'src/multiplayer-visuals.js',
  'src/multiplayer-visuals-m3.js',
  'src/multiplayer-vehicle-adapter.js',
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
const authoredRegistry=fs.readFileSync('src/vehicle-authored-registry.js','utf8');
const localEntries=fs.readFileSync('src/vehicle-glb-entries.js','utf8');
const main=fs.readFileSync('src/main.js','utf8');

assert(entry.includes("from './multiplayer-client-m3.js'"),'public multiplayer client must route through maintained client');
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

console.log('V21.31 MULTIPLAYER M4 CLIENT QA: PASS',{
  publicClient:'multiplayer-client-m3',
  publicVisuals:'multiplayer-visuals-m3',
  networkHz:30,
  registryPrediction:true,
  isolatedPeerVehicleSystems:true,
  visualSource:'same local authored controller',
  duplicateRemoteVisualImplementation:false
});
