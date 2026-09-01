import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {
  consumeCivilTrafficMultiplayerPayload,
  mergeCivilTrafficIntoOutgoingState,
  publishLocalCivilTrafficSnapshot,
  readCivilTrafficMultiplayerBridge,
  resetCivilTrafficMultiplayerBridge,
  sanitizeCivilTrafficNetworkSnapshot
} from '../src/traffic/civil-traffic-network-bridge.js';

resetCivilTrafficMultiplayerBridge();

const clipped=sanitizeCivilTrafficNetworkSnapshot({
  sequence:4,
  routeLength:5000,
  agents:[
    {id:'a',vehicleId:'suv',direction:-1,cum:1200,speed:20,laneOffset:-1.72},
    {id:'b',vehicleId:'sedan',direction:1,cum:1500,speed:18,laneOffset:1.72},
    {id:'c',vehicleId:'pickup',direction:1,cum:1700,speed:18,laneOffset:1.72}
  ]
});
assert.equal(clipped.protocol,'traffic-mp1');
assert.equal(clipped.agents.length,2,'network snapshot must never exceed the local two-car traffic cap');

// p2 joins a session where p1 already exists. Snapshot discovery must elect p1.
consumeCivilTrafficMultiplayerPayload(JSON.stringify({type:'welcome',id:'p2',count:2}));
let bridge=readCivilTrafficMultiplayerBridge();
assert.equal(bridge.ownId,'p2');
assert.equal(bridge.authorityId,'p2','before roster discovery p2 may temporarily consider itself authority');

consumeCivilTrafficMultiplayerPayload(JSON.stringify({
  type:'snapshot',
  states:[{
    type:'state',id:'p1',seq:10,
    trafficState:{
      protocol:'traffic-mp1',sequence:7,routeLength:5000,
      agents:[{id:'traffic-4',vehicleId:'suv',direction:-1,cum:1325,speed:21,cruiseSpeed:21,laneOffset:-1.72}]
    }
  }]
}));
bridge=readCivilTrafficMultiplayerBridge();
assert.equal(bridge.authorityId,'p1','earliest peer id must become civil traffic authority');
assert.equal(bridge.isAuthority,false,'p2 must follow p1 traffic');
assert.equal(bridge.remoteSnapshot.agents[0].vehicleId,'suv');
assert.equal(bridge.remoteSnapshot.agents[0].cum,1325);

publishLocalCivilTrafficSnapshot({routeLength:5000,agents:[{id:'local',vehicleId:'sonata',direction:1,cum:900,speed:15,laneOffset:1.72}]});
const followerOutgoing=mergeCivilTrafficIntoOutgoingState({type:'state',seq:20});
assert.equal(followerOutgoing.trafficState,undefined,'non-authority client must not publish competing civil traffic');

// Authority leaves. p2 must immediately become the new elected authority.
consumeCivilTrafficMultiplayerPayload(JSON.stringify({type:'leave',id:'p1'}));
bridge=readCivilTrafficMultiplayerBridge();
assert.equal(bridge.authorityId,'p2');
assert.equal(bridge.isAuthority,true);
const authorityOutgoing=mergeCivilTrafficIntoOutgoingState({type:'state',seq:21});
assert.equal(authorityOutgoing.trafficState?.protocol,'traffic-mp1','new authority must publish its local traffic snapshot');
assert.equal(authorityOutgoing.trafficState?.agents?.[0]?.vehicleId,'sonata');

resetCivilTrafficMultiplayerBridge();
consumeCivilTrafficMultiplayerPayload(JSON.stringify({type:'welcome',id:'p1',count:1}));
publishLocalCivilTrafficSnapshot({routeLength:4200,agents:[]});
const p1Outgoing=mergeCivilTrafficIntoOutgoingState({type:'state',seq:1});
assert.equal(p1Outgoing.trafficState?.agents?.length,0,'empty traffic state must synchronize despawns too');

const facade=fs.readFileSync(new URL('../src/traffic/civil-traffic.js',import.meta.url),'utf8');
const multiplayer=fs.readFileSync(new URL('../src/multiplayer.js',import.meta.url),'utf8');
const relay=fs.readFileSync(new URL('../server/multiplayer-server.mjs',import.meta.url),'utf8');
const electronRelay=fs.readFileSync(new URL('../electron/multiplayer-runtime.cjs',import.meta.url),'utf8');
assert.ok(facade.includes("mode==='follower'"),'follower client must have an explicit no-local-simulation path');
assert.ok(facade.includes('publishLocalCivilTrafficSnapshot'),'authority must publish the R7 local traffic state');
assert.ok(facade.includes('network.remoteSnapshot'),'follower must consume the elected authority snapshot');
assert.ok(multiplayer.includes('mergeCivilTrafficIntoOutgoingState'),'existing 30 Hz multiplayer state must carry authority traffic');
assert.ok(multiplayer.includes('consumeCivilTrafficMultiplayerPayload'),'incoming multiplayer messages must feed the traffic authority bridge');
assert.ok(relay.includes('trafficState:safeTrafficState(message.trafficState)'),'Node relay must sanitize and forward civil traffic state');
assert.ok(electronRelay.includes('trafficState:safeTrafficState(message.trafficState)'),'Electron host relay must preserve the same shared traffic state');
assert.ok(electronRelay.includes("value.protocol!=='traffic-mp1'"),'Electron relay must reject unrelated traffic payloads');

const require=createRequire(import.meta.url);
const electronRuntime=require('../electron/multiplayer-runtime.cjs');
assert.equal(typeof electronRuntime.createMultiplayerRuntime,'function','Electron multiplayer runtime must remain loadable after traffic relay extension');
assert.equal(typeof electronRuntime.sanitizeRemoteHost,'function');

console.log('PASS Traffic MP1 shared multiplayer civil traffic');
console.log('  - earliest connected peer is deterministic authority');
console.log('  - follower never publishes competing random traffic');
console.log('  - at most two network agents share id/model/cum/speed/lane');
console.log('  - authority leave promotes the next peer');
console.log('  - Node and Electron host relays preserve the same sanitized traffic state');
console.log('  - empty snapshots synchronize despawns and late joins use normal state snapshots');
