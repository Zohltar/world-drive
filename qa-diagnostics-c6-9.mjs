import fs from 'node:fs';

const source=fs.readFileSync('src/traffic/civil-traffic-network-bridge.js','utf8');
if(!source.includes("import {ensureWorldDriveDiagnostics} from './diagnostics.js';"))throw new Error('traffic-network diagnostics import missing');
if(!source.includes('const trafficDiagnostics=ensureWorldDriveDiagnostics().traffic;'))throw new Error('canonical traffic diagnostics category missing');
if(!source.includes('trafficDiagnostics.network=()=>{'))throw new Error('canonical traffic-network callable missing');
if(/globalThis\.WorldDriveTrafficNetwork\s*=/.test(source))throw new Error('legacy WorldDriveTrafficNetwork writer remains');

// Guard the Traffic MP1 behavior that C6.9 must not change.
if(!source.includes("ids.sort((a,b)=>peerOrdinal(a)-peerOrdinal(b)||String(a).localeCompare(String(b)));"))throw new Error('authority election ordering changed');
if(!source.includes('?snapshot.agents.slice(0,2).map(sanitizeAgent).filter(Boolean)'))throw new Error('at-most-two-agent snapshot cap changed');
if(!source.includes("if(clean.sequence&&incomingSequence&&clean.sequence<incomingSequence)return;"))throw new Error('incoming sequence guard changed');
if(!source.includes("if(!base||typeof base!=='object'||!connected||!ownId||authorityId!==ownId||!localSnapshot)return base;"))throw new Error('outgoing authority merge guard changed');

try{delete globalThis.WorldDriveDiagnostics;}catch{}
try{delete globalThis.WorldDriveTrafficNetwork;}catch{}
const mod=await import(`./src/traffic/civil-traffic-network-bridge.js?c69=${Date.now()}`);
const root=globalThis.WorldDriveDiagnostics;
if(typeof root?.traffic?.network!=='function')throw new Error('canonical traffic network callable not installed');
if(globalThis.WorldDriveTrafficNetwork!==undefined)throw new Error('legacy WorldDriveTrafficNetwork global was recreated');

const expectedKeys=['connected','ownId','authorityId','isAuthority','peers','remoteAgents','localAgents'];
let diag=root.traffic.network();
if(JSON.stringify(Object.keys(diag))!==JSON.stringify(expectedKeys))throw new Error(`traffic-network payload shape changed: ${JSON.stringify(Object.keys(diag))}`);
if(diag.connected!==false||diag.ownId!==null||diag.authorityId!==null||diag.isAuthority!==false||diag.peers.length!==0||diag.remoteAgents!==0||diag.localAgents!==0){
  throw new Error(`initial traffic-network diagnostics mismatch: ${JSON.stringify(diag)}`);
}

mod.consumeCivilTrafficMultiplayerPayload(JSON.stringify({type:'welcome',id:'p2'}));
diag=root.traffic.network();
if(!diag.connected||diag.ownId!=='p2'||diag.authorityId!=='p2'||!diag.isAuthority||diag.peers.length!==0){
  throw new Error(`welcome/election diagnostics mismatch: ${JSON.stringify(diag)}`);
}

const local=mod.publishLocalCivilTrafficSnapshot({
  routeLength:1200,
  agents:[
    {id:'local-a',vehicleId:'sonata',direction:1,cum:100,speed:12,cruiseSpeed:14,laneOffset:1},
    {id:'local-b',vehicleId:'civic',direction:-1,cum:220,speed:10,cruiseSpeed:11,laneOffset:-1},
    {id:'local-c',vehicleId:'wrx',direction:1,cum:330,speed:9,cruiseSpeed:9,laneOffset:0}
  ]
});
if(local.agents.length!==2)throw new Error('traffic snapshot agent cap changed');
diag=root.traffic.network();
if(diag.localAgents!==2||diag.remoteAgents!==0)throw new Error(`local agent count mismatch: ${JSON.stringify(diag)}`);

mod.consumeCivilTrafficMultiplayerPayload(JSON.stringify({
  type:'state',
  id:'p1',
  trafficState:{
    protocol:'traffic-mp1',
    sequence:7,
    routeLength:1200,
    agents:[{id:'remote-a',vehicleId:'wrx',direction:-1,cum:440,speed:13,cruiseSpeed:15,laneOffset:-1}]
  }
}));
diag=root.traffic.network();
if(diag.authorityId!=='p1'||diag.isAuthority!==false||diag.peers.length!==1||diag.peers[0]!=='p1'||diag.remoteAgents!==1||diag.localAgents!==2){
  throw new Error(`remote authority diagnostics mismatch: ${JSON.stringify(diag)}`);
}

const a=root.traffic.network();
const b=root.traffic.network();
if(a===b)throw new Error('traffic-network diagnostics snapshots must allocate per invocation');
if(a.peers===b.peers)throw new Error('traffic-network peer lists must allocate per invocation');
a.peers.push('mutated');
if(root.traffic.network().peers.includes('mutated'))throw new Error('traffic-network peer diagnostics leaked mutable state');

mod.resetCivilTrafficMultiplayerBridge();
diag=root.traffic.network();
if(diag.connected!==false||diag.ownId!==null||diag.authorityId!==null||diag.isAuthority!==false||diag.peers.length!==0||diag.remoteAgents!==0||diag.localAgents!==0){
  throw new Error(`reset traffic-network diagnostics mismatch: ${JSON.stringify(diag)}`);
}

console.log('CLEANUP C6.9 TRAFFIC-NETWORK DIAGNOSTICS QA: PASS',{
  legacyRemoved:true,
  canonicalPath:'WorldDriveDiagnostics.traffic.network',
  payloadShapePreserved:true,
  authorityBehaviorPreserved:true,
  localAgentCountPreserved:true,
  remoteAgentCountPreserved:true,
  invocationAllocationPreserved:true
});
