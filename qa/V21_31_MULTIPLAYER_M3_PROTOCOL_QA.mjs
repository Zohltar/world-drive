import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

for(const file of [
  'server/multiplayer-server.mjs',
  'electron/multiplayer-runtime.cjs',
  'src/multiplayer-client-m3.js'
])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});

const browser=fs.readFileSync('server/multiplayer-server.mjs','utf8');
const electron=fs.readFileSync('electron/multiplayer-runtime.cjs','utf8');
const client=fs.readFileSync('src/multiplayer-client-m3.js','utf8');

const relayMarkers=[
  'velocityHeading:finite(message.velocityHeading,message.heading)',
  'longitudinalAccel:clamp(finite(message.longitudinalAccel),-20,15)',
  'steer:clamp(finite(message.steer),-1.2,1.2)',
  'braking:!!message.braking',
  'reversing:!!message.reversing',
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
for(const marker of relayMarkers){
  assert(browser.includes(marker),`browser relay drops/changes field: ${marker}`);
  assert(electron.includes(marker),`electron relay drops/changes field: ${marker}`);
}

for(const marker of [
  'seq:++localSequence',
  'vehicleId:state.vehicleId',
  'velocityHeading:motion.velocityHeading',
  'longitudinalAccel:motion.longitudinalAccel',
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
])assert(client.includes(marker),`M3 sender missing state field: ${marker}`);

assert(client.includes('if(seq>0&&peer.lastSeq>0&&seq<=peer.lastSeq)return'),'M3 receiver must reject stale sequence numbers');
assert(client.includes('INTERPOLATION_DELAY_MS=110'),'M3 receiver interpolation buffer changed unexpectedly');
assert(client.includes('MAX_EXTRAPOLATION_MS=105'),'M3 receiver extrapolation horizon changed unexpectedly');
assert(client.includes('SNAPSHOT_HISTORY_MS=900'),'M3 snapshot retention changed unexpectedly');

console.log('V21.31 MULTIPLAYER M3 PROTOCOL QA: PASS',{
  relays:['browser','electron'],
  lighting:['brake','reverse','night','signal-left','signal-right','blink'],
  pose:['heading','velocityHeading','bodyPitch','bodyRoll','wheelPitch','wheelRoll'],
  stalePacketRejection:true,
  networkHz:30
});
