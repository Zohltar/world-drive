import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {
  publishTransmissionNetworkGear,
  readTransmissionNetworkGear
} from '../src/transmission-network-state.js';
import {readTransmissionRuntimeState} from '../src/transmission-runtime-bridge.js';
import {enforceExactGearOnOutgoingPayload} from '../src/multiplayer.js';
import {
  normalizeMultiplayerGear,
  reverseFromMultiplayerGear
} from '../src/multiplayer/multiplayer-client-m3.js';

for(const file of [
  'server/multiplayer-server.mjs',
  'electron/multiplayer-runtime.cjs',
  'src/multiplayer.js',
  'src/multiplayer/multiplayer-client-m3.js',
  'src/transmission-controller.js',
  'src/transmission-network-state.js',
  'src/transmission-runtime-bridge.js'
])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});

const browser=fs.readFileSync('server/multiplayer-server.mjs','utf8');
const electron=fs.readFileSync('electron/multiplayer-runtime.cjs','utf8');
const entry=fs.readFileSync('src/multiplayer.js','utf8');
const client=fs.readFileSync('src/multiplayer/multiplayer-client-m3.js','utf8');
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
for(const [label,source] of [['browser',browser],['electron',electron]]){
  assert(source.includes("if(value===null||value===undefined||value==='')return null"),`${label} relay must preserve missing gear as null`);
  assert(source.includes('reversing:gear!==null?gear===-1:!!message.reversing'),`${label} relay reverse must derive strictly from numeric -1 gear`);
}

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
])assert(client.includes(marker),`M4.11 sender missing state field: ${marker}`);

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

assert.equal(normalizeMultiplayerGear(null,-1),-1,'receiver null gear must preserve previous R');
assert.equal(normalizeMultiplayerGear(undefined,-1),-1,'receiver undefined gear must preserve previous R');
assert.equal(normalizeMultiplayerGear('',-1),-1,'receiver empty gear must preserve previous R');
assert.equal(normalizeMultiplayerGear(0,-1),0,'explicit Neutral must override previous R');
assert.equal(reverseFromMultiplayerGear(-1,false),true,'numeric -1 must derive reversing=true');
assert.equal(reverseFromMultiplayerGear(0,true),false,'numeric 0 must derive reversing=false');
assert(client.includes("const present=input=>input!==null&&input!==undefined&&input!==''"),'receiver must guard null/undefined/empty before Number conversion');

const forcedReverse=JSON.parse(enforceExactGearOnOutgoingPayload(JSON.stringify({
  type:'state',vehicleId:'sonata',gear:0,reversing:false,braking:false
}),-1));
assert.equal(forcedReverse.gear,-1,'outgoing boundary must force exact -1 reverse gear');
assert.equal(forcedReverse.reversing,true,'outgoing boundary must derive reversing from exact -1 gear');
const forcedNeutral=JSON.parse(enforceExactGearOnOutgoingPayload(JSON.stringify({type:'state',gear:-1,reversing:true}),0));
assert.equal(forcedNeutral.gear,0,'outgoing boundary must preserve exact Neutral');
assert.equal(forcedNeutral.reversing,false,'Neutral must disable reverse presentation');

assert(client.includes('transformOutgoingState=null,transformIncomingPayload=null'),'maintained client must expose socket-scoped transforms');
assert(client.includes("typeof transformOutgoingState==='function'"),'owned socket send path must apply scoped outgoing transform');
assert(client.includes("typeof transformIncomingPayload==='function'"),'owned socket receive path must apply scoped incoming transform');
assert(entry.includes('transformOutgoingState:payload=>'),'public entry must inject exact-gear transform into owned client');
assert(entry.includes('transformIncomingPayload:raw=>'),'public entry must inject legacy/diagnostic transform into owned client');
assert(!entry.includes('globalThis.WebSocket='),'public entry must never replace global WebSocket');
assert(!entry.includes('class WorldDriveCompatWebSocket'),'global WebSocket subclass must stay retired');
assert(entry.includes('multiplayerDiagnostics.wire=()=>({'),'canonical wire diagnostics must expose actual outgoing/incoming state');
assert(!entry.includes('globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__='),'legacy wire diagnostics writer must stay retired');

assert(client.includes('const gear=normalizeGear(state.gear,runtime.selectorGear)'),'maintained sender fallback remains documented behind final boundary enforcement');
assert(client.includes('const remoteReversing=reverseFromGear(peer.gear,peer.reversing)'),'receiver must derive reverse from network gear');
assert(client.includes('gear:peer.gear'),'normalized remote state must retain gear');
assert(client.includes('reverseSource:\'network-gear\''),'diagnostics must state explicit reverse source');
assert(client.includes('if(seq>0&&peer.lastSeq>0&&seq<=peer.lastSeq)return'),'receiver must reject stale sequence numbers');
assert(client.includes('INTERPOLATION_DELAY_MS=110'),'receiver interpolation buffer changed unexpectedly');
assert(client.includes('MAX_EXTRAPOLATION_MS=105'),'receiver extrapolation horizon changed unexpectedly');
assert(client.includes('SNAPSHOT_HISTORY_MS=900'),'snapshot retention changed unexpectedly');

console.log('V21.31 MULTIPLAYER SOCKET-SCOPED PROTOCOL QA: PASS',{
  relays:['browser','electron'],
  numericGear:{reverse:-1,neutral:0,forward:'1..N'},
  missingGearPreservesPriorState:true,
  ownedSocketBoundaryEnforcement:true,
  globalWebSocketUntouched:true,
  wireDiagnostics:true,
  exactGearSequence:[3,0,-1],
  lighting:['brake','reverse','night','signal-left','signal-right','blink'],
  pose:['heading','velocityHeading','bodyPitch','bodyRoll','wheelPitch','wheelRoll'],
  stalePacketRejection:true,
  networkHz:30
});
