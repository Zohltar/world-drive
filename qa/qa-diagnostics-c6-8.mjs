import fs from 'node:fs';
import {publishTransmissionNetworkGear,resetTransmissionNetworkGear} from '../src/transmission-network-state.js';

const source=fs.readFileSync('src/multiplayer.js','utf8');
if(!source.includes("import {ensureWorldDriveDiagnostics} from './diagnostics.js';"))throw new Error('multiplayer diagnostics import missing');
if(!source.includes('const multiplayerDiagnostics=ensureWorldDriveDiagnostics().multiplayer;'))throw new Error('canonical multiplayer diagnostics category missing');
if(!source.includes('multiplayerDiagnostics.wire=()=>({'))throw new Error('canonical wire callable missing');
if(/globalThis\.__WORLD_DRIVE_MULTIPLAYER_WIRE__\s*=/.test(source))throw new Error('legacy wire diagnostics writer remains');
if(!source.includes("const wireDiagnostics={outgoingCount:0,incomingCount:0,outgoing:null,incoming:null};"))throw new Error('wire store initialization changed');
if(!/wireDiagnostics\.outgoingCount\+\+;[\s\S]*?wireDiagnostics\.outgoing=\{at:Date\.now\(\),\.\.\.compactWireState\(prepared\)\};/.test(source))throw new Error('outgoing publication timing changed');
if(!/wireDiagnostics\.incomingCount\+\+;[\s\S]*?wireDiagnostics\.incoming=\{at:Date\.now\(\),type:'snapshot',states:message\.states\.map\(compactWireState\)\.filter\(Boolean\)\}/.test(source))throw new Error('incoming snapshot publication semantics changed');
if(!source.includes('outgoing:wireDiagnostics.outgoing?{...wireDiagnostics.outgoing}:null'))throw new Error('outgoing defensive copy changed');
if(!source.includes('incoming:wireDiagnostics.incoming?JSON.parse(JSON.stringify(wireDiagnostics.incoming)):null'))throw new Error('incoming defensive deep copy changed');

try{delete globalThis.WorldDriveDiagnostics;}catch{}
try{delete globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__;}catch{}
const mod=await import(`../src/multiplayer.js?c68=${Date.now()}`);
const root=globalThis.WorldDriveDiagnostics;
if(typeof root?.multiplayer?.wire!=='function')throw new Error('canonical multiplayer wire callable not installed');
if(globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__!==undefined)throw new Error('legacy multiplayer wire global was recreated');

publishTransmissionNetworkGear(-1);
let diag=root.multiplayer.wire();
if(diag.exactLocalGear!==-1||diag.outgoingCount!==0||diag.incomingCount!==0||diag.outgoing!==null||diag.incoming!==null){
  throw new Error(`initial wire snapshot mismatch: ${JSON.stringify(diag)}`);
}
const raw=mod.enforceExactGearOnOutgoingPayload(JSON.stringify({type:'state',id:'qa',seq:7,vehicleId:'sonata',gear:1,reversing:false,braking:true}),-1);
const sent=JSON.parse(raw);
if(sent.gear!==-1||sent.reversing!==true)throw new Error('outgoing exact-gear behavior changed');
diag=root.multiplayer.wire();
if(diag.outgoingCount!==1||diag.outgoing?.gear!==-1||diag.outgoing?.reversing!==true||diag.outgoing?.braking!==true)throw new Error(`outgoing wire snapshot mismatch: ${JSON.stringify(diag)}`);
const originalGear=diag.outgoing.gear;
diag.outgoing.gear=99;
if(root.multiplayer.wire().outgoing?.gear!==originalGear)throw new Error('outgoing wire snapshot lost defensive copy semantics');

publishTransmissionNetworkGear(0);
if(root.multiplayer.wire().exactLocalGear!==0)throw new Error('wire exactLocalGear is not live');
const a=root.multiplayer.wire(),b=root.multiplayer.wire();
if(a===b)throw new Error('wire diagnostics snapshots must allocate per invocation');
resetTransmissionNetworkGear();

console.log('CLEANUP C6.8 MULTIPLAYER WIRE DIAGNOSTICS QA: PASS',{
  legacyRemoved:true,
  observerOnly:true,
  exactLocalGearLive:true,
  outgoingCount:true,
  outgoingDefensiveCopy:true,
  incomingDeepCopySourceContract:true,
  invocationAllocationPreserved:true
});