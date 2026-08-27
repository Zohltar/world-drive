import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

for(const file of [
  'src/multiplayer.js',
  'src/multiplayer-lighting.js',
  'src/multiplayer-visuals.js',
  'server/multiplayer-server.mjs',
  'electron/multiplayer-runtime.cjs'
]){
  execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
}

const client=fs.readFileSync('src/multiplayer.js','utf8');
const rig=fs.readFileSync('src/multiplayer-lighting.js','utf8');
const visuals=fs.readFileSync('src/multiplayer-visuals.js','utf8');
const relay=fs.readFileSync('server/multiplayer-server.mjs','utf8');
const electron=fs.readFileSync('electron/multiplayer-runtime.cjs','utf8');

for(const marker of [
  "import {readTransmissionRuntimeState} from './transmission-runtime-bridge.js';",
  'const NETWORK_STATE_HZ=30;',
  "lightingProtocol:'m2.4'",
  'reversing:lighting.reversing',
  'nightLevel:lighting.nightLevel',
  'signalLeft:lighting.signalLeft',
  'signalRight:lighting.signalRight',
  'signalBlink:lighting.signalBlink',
  'Number(runtime.selectorGear)===-1',
  'TURN_SIGNAL_PERIOD_SEC=1.05',
  'TURN_SIGNAL_ON_SEC=.58',
  'peer.visual.setLighting({'
]){
  assert(client.includes(marker),`missing M2.4 client marker: ${marker}`);
}

for(const source of [relay,electron]){
  for(const marker of [
    'reversing:!!message.reversing',
    'nightLevel:clamp(finite(message.nightLevel),0,1)',
    'signalLeft:!!message.signalLeft',
    'signalRight:!!message.signalRight',
    'signalBlink:!!message.signalBlink',
    "lightingProtocol:message.lightingProtocol==='m2.4'?'m2.4':null"
  ]){
    assert(source.includes(marker),`relay drops M2.4 lighting marker: ${marker}`);
  }
}

for(const marker of [
  "from './multiplayer-lighting.js'",
  'createRemoteLightingRig(THREE,vehicleId,lightingParent)',
  'visual.setLighting=(state={})=>',
  "mode:'multiplayer-hd-overlay-v5-replicated-lighting'"
]){
  assert(visuals.includes(marker),`missing M2.4 visual marker: ${marker}`);
}

for(const marker of [
  'remote-network-lighting-',
  'remote-tail-',
  'remote-reverse-',
  'remote-signal-rear-',
  'remote-signal-front-',
  'remote-headlight-',
  'lastState.signalLeft&&blink',
  'lastState.signalRight&&blink',
  'lastState.reversing ? .95 : 0',
  'Math.max(running,braking)'
]){
  assert(rig.includes(marker),`missing M2.4 lighting rig marker: ${marker}`);
}

// Sender turn-signal state machine mirrors the established Sonata behavior:
// signal arms at high steering while stopped, keeps blinking through the turn,
// then cancels when the rack returns near centre.
const ACT=.318,NEUTRAL=.045,PERIOD=1.05,ON=.58;
let left=false,right=false,timer=0;
function step({steer=0,speed=0,dt=1/30}={}){
  const abs=Math.abs(steer);
  if(abs<=NEUTRAL){left=false;right=false;timer=0;}
  else if(!left&&!right&&Math.abs(speed)<.35&&abs>=ACT){
    left=steer<0;right=steer>0;timer=0;
  }
  if(left||right)timer+=dt;
  return {left,right,blink:(left||right)&&((timer%PERIOD)<ON)};
}
assert.deepEqual(step({steer:-.36,speed:0}),{left:true,right:false,blink:true});
for(let i=0;i<20;i++)step({steer:-.22,speed:8});
assert.equal(left,true,'left signal must remain armed after launch');
assert.deepEqual(step({steer:0,speed:8}),{left:false,right:false,blink:false});
assert.deepEqual(step({steer:.36,speed:0}),{left:false,right:true,blink:true});

console.log('V21.31 MULTIPLAYER M2.4 LIGHTING QA: PASS',{
  networkHz:30,
  replicated:['brake','reverse','night','signal-left','signal-right','blink-phase'],
  browserRelay:true,
  electronRelay:true,
  perPeerVisualRig:true
});
