import fs from 'node:fs';
import {publishTransmissionNetworkGear,resetTransmissionNetworkGear} from './src/transmission-network-state.js';

const source=fs.readFileSync('src/multiplayer.js','utf8');
if(!source.includes("import {ensureWorldDriveDiagnostics} from './diagnostics.js';"))throw new Error('multiplayer does not import canonical diagnostics');
if(!source.includes('const multiplayerDiagnostics=ensureWorldDriveDiagnostics().multiplayer;'))throw new Error('multiplayer diagnostics category is not canonical');
if(!source.includes('multiplayerDiagnostics.localGear=()=>({'))throw new Error('canonical local-gear callable missing');
if(/globalThis\.__WORLD_DRIVE_MULTIPLAYER_LOCAL_GEAR__\s*=/.test(source))throw new Error('legacy local-gear writer remains');
if(!source.includes('multiplayerDiagnostics.wire=()=>({'))throw new Error('canonical wire diagnostics missing after C6.8');
if(/globalThis\.__WORLD_DRIVE_MULTIPLAYER_WIRE__\s*=/.test(source))throw new Error('legacy wire writer returned');

try{delete globalThis.WorldDriveDiagnostics;}catch{}
try{delete globalThis.__WORLD_DRIVE_MULTIPLAYER_LOCAL_GEAR__;}catch{}
try{delete globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__;}catch{}
await import(`./src/multiplayer.js?c67=${Date.now()}`);
const root=globalThis.WorldDriveDiagnostics;
if(!root?.multiplayer||typeof root.multiplayer.localGear!=='function')throw new Error('canonical multiplayer localGear callable not installed');
if(globalThis.__WORLD_DRIVE_MULTIPLAYER_LOCAL_GEAR__!==undefined)throw new Error('legacy local-gear global was recreated');
if(typeof root.multiplayer.wire!=='function')throw new Error('canonical wire diagnostics missing');
if(globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__!==undefined)throw new Error('legacy wire global was recreated');

publishTransmissionNetworkGear(-1);
let diag=root.multiplayer.localGear();
if(diag?.gear!==-1||diag?.reversing!==true)throw new Error(`reverse diagnostic mismatch: ${JSON.stringify(diag)}`);
publishTransmissionNetworkGear(0);
diag=root.multiplayer.localGear();
if(diag?.gear!==0||diag?.reversing!==false)throw new Error(`neutral diagnostic mismatch: ${JSON.stringify(diag)}`);
publishTransmissionNetworkGear(3.8);
diag=root.multiplayer.localGear();
if(diag?.gear!==3||diag?.reversing!==false)throw new Error(`forward diagnostic mismatch: ${JSON.stringify(diag)}`);
const a=root.multiplayer.localGear(),b=root.multiplayer.localGear();
if(a===b)throw new Error('local-gear diagnostics allocation cadence changed; snapshots must allocate per invocation');
resetTransmissionNetworkGear();

console.log('CLEANUP C6.7 MULTIPLAYER LOCAL-GEAR DIAGNOSTICS QA: PASS',{
  legacyRemoved:true,
  payload:['gear','reversing'],
  reverse:true,
  neutral:true,
  forward:true,
  wireBehaviorUntouched:true,
  wireDiagnosticsCanonical:true,
  invocationAllocationPreserved:true
});
