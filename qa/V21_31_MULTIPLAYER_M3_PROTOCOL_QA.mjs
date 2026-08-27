import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {
  publishTransmissionNetworkGear,
  readTransmissionNetworkGear
} from '../src/transmission-network-state.js';
import {readTransmissionRuntimeState} from '../src/transmission-runtime-bridge.js';
import {enforceExactGearOnOutgoingPayload} from '../src/multiplayer.js';

for(const file of [
  'server/multiplayer-server.mjs',
  'electron/multiplayer-runtime.cjs',
  'src/multiplayer.js',
  'src/multiplayer-client-m3.js',
  'src/transmission-controller.js',
  'src/transmission-network-state.js',
  'src/transmission-runtime-bridge.js'
])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});

const browser=fs.readFileSync('server/multiplayer-server.mjs','utf8');
const electron=fs.readFileSync('electron/multiplayer-runtime.cjs','utf8');
const entry=fs.readFileSync('src/multiplayer.js','utf8');
const client=fs.readFileSync('src/multiplayer-client-m3.js','utf8');
const transmission=fs.readFileSync('src/transmission-controller.js','utf8');
const bridge=fs.readFileSync('src/transmission-runtime-bridge.js','utf8');

const commonRelayMarkers=[
  'velocityHeading:finite(message.velocityHeading,message.heading)',
  'longitudinalAccel:clamp(finite(message.longitudinalAccel),-20,15)',
  'steer:clamp(finite(message.steer),-1.2,1.2)',
  'const gear=normalizeGear(message.gear)',
  'gear,',
  'braking:!!message.braking',
  'nightLevel:clamp(finite(message.nightLevel),0,1)',
  'signalLeft:!!message.signalLeft',
  'signalRight:!!message.signalRight',
  'signalBlink:!!message.signalBlink',
  "lightingProtocol:message.lightingProtocol==='m2.4'?'m2.4':null",
  'bodyPitch:clamp(finite(message.bodyPitch),-1.2,1.2)',
  'bodyRoll:clamp(finite(message.bodyRoll),-1.2,1.2)',
  'wheelPitch:clamp(finite(message.wheelPitch),-1.2,1.2)',
  'wheelRoll:clamp(finite(message.wheelRoll),-1.2,1.2)'
];
for(const marker of commonRelayMarkers){
  assert(browser.includes(marker),`browser relay drops/changes field: ${marker}`);
  assert(electron.includes(marker),`electron relay drops/changes field: ${marker}`);
}
assert(browser.includes("if(value===null||value===undefined||value==='')return null"),'browser relay must preserve missing gear as null');
assert(browser.includes('reversing:gear!==null?gear===-1:!!message.reversing'),'browser relay reverse must derive from numeric -1 gear');
// Electron normalizes numeric gear to {-1,0,1..N}; `<0` is equivalent to ===-1
// until its packaged relay is next regenerated from the browser relay.
assert(electron.includes('reversing:gear!==null?gear<0:!!message.reversing'),'electron relay reverse contract drift');

for(const marker of [
  'seq:++localSequence',
  'vehicleId:state.vehicleId',
  'velocityHeading:motion.velocityHeading',
  'longitudinalAccel:motion.longitudinalAccel',
  'gear:lighting.gear',
  'braking:lighting.braking',
  'reversing:lighting.reversing',
  'nightLevel:lighting.nightLevel',
  'signalLeft:lighting.signalLeft',
  'signalRight:lighting.signalRight',
  'signalBlink:lighting.signalBlink',
  'bodyPitch:state.bodyPitch',
  'bodyRoll:state.bodyRoll',
  'wheelPitch:state.wheelPitch',
  'wheelRoll:state.wheelRoll'
])assert(client.includes(marker),`M4.9 sender missing state field: ${marker}`);

assert(transmission.includes("from './transmission-network-state.js'"),'transmission controller must publish a dedicated multiplayer gear state');
assert(transmission.includes('publishTransmissionNetworkGear(args.state.transmissionGear)'),'network gear must be the exact authoritative transmissionGear written for the instrument cluster');
assert(bridge.includes("from './transmission-network-state.js'"),'runtime bridge must consume the authoritative network gear state');
assert(bridge.includes('const gear=Number(readTransmissionNetworkGear())'),'legacy selector bridge must resynchronize from exact displayed gear');

publishTransmissionNetworkGear(3);
assert.equal(readTransmissionNetworkGear(),3,'forward gear must preserve the exact displayed gear number');
assert.equal(readTransmissionRuntimeState().selectorGear,3,'runtime bridge must expose exact displayed forward gear');
publishTransmissionNetworkGear(0);
assert.equal(readTransmissionRuntimeState().selectorGear,0,'Neutral must replicate exactly');
publishTransmissionNetworkGear(-1);
assert.equal(readTransmissionNetworkGear(),-1,'R must publish as -1');
assert.equal(readTransmissionRuntimeState().selectorGear,-1,'runtime bridge must expose R exactly for multiplayer reverse lights');

// M4.9 regression: even if the maintained client assembled a stale Neutral
// packet, the final WebSocket boundary must overwrite it with the exact numeric
// transmission gear immediately before bytes leave the browser.
const forcedReverse=JSON.parse(enforceExactGearOnOutgoingPayload(JSON.stringify({
  type:'state',vehicleId:'sonata',gear:0,reversing:false,braking:false
}),-1));
assert.equal(forcedReverse.gear,-1,'WebSocket boundary must force exact -1 reverse gear');
assert.equal(forcedReverse.reversing,true,'WebSocket boundary must derive reversing from exact -1 gear');
const forcedNeutral=JSON.parse(enforceExactGearOnOutgoingPayload(JSON.stringify({type:'state',gear:-1,reversing:true}),0));
assert.equal(forcedNeutral.gear,0,'WebSocket boundary must preserve exact Neutral');
assert.equal(forcedNeutral.reversing,false,'Neutral must disable reverse presentation');
assert(entry.includes('send(enforceExactGearOnOutgoingPayload')||entry.includes('super.send(enforceExactGearOnOutgoingPayload'),'actual WebSocket.send boundary must enforce exact numeric gear');
assert(entry.includes('__WORLD_DRIVE_MULTIPLAYER_WIRE__'),'wire diagnostics must expose actual outgoing/incoming state');

assert(client.includes('const gear=normalizeGear(state.gear,runtime.selectorGear)'),'maintained sender fallback remains documented behind M4.9 boundary enforcement');
assert(client.includes('const remoteReversing=reverseFromGear(peer.gear,peer.reversing)'),'receiver must derive reverse from network gear');
assert(client.includes('gear:peer.gear'),'normalized remote state must retain gear');
assert(client.includes('reverseSource:\'network-gear\''),'diagnostics must state explicit reverse source');
assert(client.includes('if(seq>0&&peer.lastSeq>0&&seq<=peer.lastSeq)return'),'receiver must reject stale sequence numbers');
assert(client.includes('INTERPOLATION_DELAY_MS=110'),'receiver interpolation buffer changed unexpectedly');
assert(client.includes('MAX_EXTRAPOLATION_MS=105'),'receiver extrapolation horizon changed unexpectedly');
assert(client.includes('SNAPSHOT_HISTORY_MS=900'),'snapshot retention changed unexpectedly');

console.log('V21.31 MULTIPLAYER M4.9 PROTOCOL QA: PASS',{
  relays:['browser','electron'],
  numericGear:{reverse:-1,neutral:0,forward:'1..N'},
  finalWebSocketBoundaryEnforcement:true,
  wireDiagnostics:true,
  exactGearSequence:[3,0,-1],
  lighting:['brake','reverse','night','signal-left','signal-right','blink'],
  pose:['heading','velocityHeading','bodyPitch','bodyRoll','wheelPitch','wheelRoll'],
  stalePacketRejection:true,
  networkHz:30
});
