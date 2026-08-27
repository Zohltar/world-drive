import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

for(const file of [
  'src/multiplayer.js',
  'src/multiplayer-client-m3.js',
  'src/multiplayer-visuals.js',
  'src/multiplayer-visuals-m3.js',
  'src/multiplayer-hd-vehicles.js',
  'src/multiplayer-hd-vehicles-m3.js',
  'src/multiplayer-authored-lighting.js',
  'src/multiplayer-authored-lighting-m251.js',
  'src/multiplayer-authored-lighting-v2.js',
  'src/multiplayer-vehicle-registry.js',
  'src/multiplayer-support-math.js'
]){
  execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
}

const entry=fs.readFileSync('src/multiplayer.js','utf8');
const client=fs.readFileSync('src/multiplayer-client-m3.js','utf8');
const visualEntry=fs.readFileSync('src/multiplayer-visuals.js','utf8');
const visuals=fs.readFileSync('src/multiplayer-visuals-m3.js','utf8');
const legacyHd=fs.readFileSync('src/multiplayer-hd-vehicles.js','utf8');
const legacyLighting=fs.readFileSync('src/multiplayer-authored-lighting.js','utf8');
const legacyM251=fs.readFileSync('src/multiplayer-authored-lighting-m251.js','utf8');
const main=fs.readFileSync('src/main.js','utf8');

assert(entry.includes("from './multiplayer-client-m3.js'"),'public multiplayer client must route through M3');
assert(visualEntry.includes("from './multiplayer-visuals-m3.js'"),'public multiplayer visuals must route through M3');
assert(client.includes("from './multiplayer-vehicle-registry.js'"),'M3 client must consume central vehicle registry');
assert(!client.includes('VEHICLE_WHEELBASE'),'M3 client must not duplicate vehicle wheelbases');
assert(!client.includes('const specs={'),'M3 client must not embed a second vehicle visual spec table');
assert(client.includes('getMultiplayerVehicleSpec(snapshot.vehicleId).physics.wheelbase'),'prediction must use authoritative registry wheelbase');
assert(client.includes('const NETWORK_STATE_HZ=30'),'network cadence must remain 30 Hz');
assert(client.includes("lightingProtocol:'m2.4'"),'lighting protocol marker must remain explicit');
assert(client.includes('reversing:lighting.reversing'),'reverse state must be transmitted independently of speed');
assert(client.includes('nightLevel:lighting.nightLevel'),'night state must be transmitted');
assert(client.includes('signalLeft:lighting.signalLeft')&&client.includes('signalRight:lighting.signalRight'),'signal sides must be transmitted');
assert(client.includes('signalBlink:lighting.signalBlink'),'blink phase must be transmitted');
assert(client.includes('peer.visual.setLighting?.({'),'sampled peer state must feed one lighting contract');
assert(client.includes('solveRemoteSupport?.({lat:peer.lat,lon:peer.lon,heading:peer.heading,visual:peer.visual})'),'receiver-local support must remain after interpolation');
assert(client.includes("return {connect,disconnect,toggle,update,getPeers,isConnected:"),'M3 public client API drift');

assert(visuals.includes('registry support chassis -> optional HD GLB -> contract-validated GLB lighting'),'M3 visual sequence documentation missing');
assert(visuals.includes("instance.lightingMode==='authored-glb-lamps-v2'"),'HD lighting must only replace fallback after authored contract validation');
assert(visuals.includes('if(fallbackLighting?.rig)fallbackLighting.rig.visible=false'),'validated authored lighting must hide temporary fallback rig');
assert(visuals.includes('for(const mesh of hidden.bodyMeshes)mesh.visible=false'),'HD attachment must hide support body');
assert(visuals.includes('for(const pivot of hidden.wheelPivots)pivot.visible=false'),'HD attachment must hide support wheels');

// Retired entrypoints must never grow a second implementation again.
assert(legacyHd.includes("from './multiplayer-hd-vehicles-m3.js'"),'legacy HD entrypoint must be a M3 compatibility shim');
assert(legacyHd.length<500,'legacy HD entrypoint must not contain a duplicate cache/spec implementation');
assert(legacyLighting.includes("from './multiplayer-authored-lighting-v2.js'"),'legacy authored-lighting entrypoint must route to M3 v2');
assert(legacyLighting.length<500,'legacy authored-lighting entrypoint must not contain duplicate lamp logic');
assert(legacyM251.includes("from './multiplayer-authored-lighting-v2.js'"),'retired M2.5.1 entrypoint must route to M3 v2');
assert(legacyM251.length<500,'retired M2.5.1 workaround must remain a compatibility shim');
assert(!legacyLighting.includes('BoxGeometry'),'legacy authored-lighting shim must not recreate procedural lamp boxes');
assert(!legacyM251.includes('wrxReverseCandidateScore'),'retired WRX heuristic must not return');

assert(main.includes("import { createMultiplayerClient } from './multiplayer.js';"),'main must consume public multiplayer client entrypoint');
assert(main.includes("import { createMultiplayerVisualSystem } from './multiplayer-visuals.js';"),'main must consume public multiplayer visual entrypoint');
assert(main.includes('createRemoteVisual:multiplayerVisuals.createRemoteVehicleVisual'),'main must inject M3 remote visuals into M3 client');
assert(main.includes('solveRemoteSupport:multiplayerVisuals.solveRemoteVehicleSupport'),'main must inject receiver-local support into M3 client');

console.log('V21.31 MULTIPLAYER M3 CLIENT QA: PASS',{
  publicClient:'multiplayer-client-m3',
  publicVisuals:'multiplayer-visuals-m3',
  networkHz:30,
  registryPrediction:true,
  duplicatedWheelbaseTable:false,
  retiredDuplicateImplementations:true,
  lightingSequence:'network -> support -> HD -> validated authored lamps'
});
