import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {createMultiplayerRuntime}=require('./electron/multiplayer-runtime.cjs');

if(typeof WebSocket!=='function')throw new Error('Node 22 WebSocket global required for live MP traffic QA');

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function waitHttp(url,timeoutMs=5000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    try{const response=await fetch(url);if(response.ok)return;}catch{}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function openSocket(url){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(url);
    const timer=setTimeout(()=>reject(new Error(`WebSocket open timeout ${url}`)),4000);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve(ws);},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error(`WebSocket error ${url}`));},{once:true});
  });
}

function waitJson(ws,predicate,timeoutMs=4000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(new Error('Timed out waiting for multiplayer message'));},timeoutMs);
    const onMessage=event=>{
      let message;try{message=JSON.parse(String(event.data));}catch{return;}
      if(!predicate(message))return;
      cleanup();resolve(message);
    };
    const onClose=()=>{cleanup();reject(new Error('WebSocket closed before expected multiplayer message'));};
    const cleanup=()=>{
      clearTimeout(timer);
      ws.removeEventListener('message',onMessage);
      ws.removeEventListener('close',onClose);
    };
    ws.addEventListener('message',onMessage);
    ws.addEventListener('close',onClose,{once:true});
  });
}

async function hello(ws,name){
  const welcomePromise=waitJson(ws,message=>message.type==='welcome');
  ws.send(JSON.stringify({type:'hello',name,vehicleId:'sonata'}));
  return welcomePromise;
}

function trafficState(){
  return {
    protocol:'traffic-mp1',
    sequence:9,
    routeLength:5200,
    agents:[{
      id:'traffic-9',vehicleId:'suv',kind:'oncoming',direction:-1,
      cum:1660,speed:20.5,cruiseSpeed:20.5,laneOffset:-1.72
    }]
  };
}

function sendState(ws,sequence=1){
  ws.send(JSON.stringify({
    type:'state',seq:sequence,name:'Authority',lat:45.5,lon:-73.5,y:20,
    heading:0,speed:12,vehicleId:'sonata',steer:0,gear:1,
    trafficState:trafficState()
  }));
}

async function exerciseRelay(url){
  const p1=await openSocket(url);
  const w1=await hello(p1,'P1');
  assert.equal(w1.id,'p1');

  const p2=await openSocket(url);
  const w2=await hello(p2,'P2');
  assert.equal(w2.id,'p2');

  const forwarded=waitJson(p2,message=>message.type==='state'&&message.id==='p1');
  sendState(p1,1);
  const received=await forwarded;
  assert.equal(received.trafficState?.protocol,'traffic-mp1');
  assert.equal(received.trafficState?.agents?.length,1);
  assert.equal(received.trafficState?.agents?.[0]?.vehicleId,'suv');
  assert.equal(received.trafficState?.agents?.[0]?.cum,1660);

  // Late join must receive p1's last traffic snapshot through normal state snapshot.
  const p3=await openSocket(url);
  const snapshotPromise=waitJson(p3,message=>message.type==='snapshot');
  await hello(p3,'P3');
  const snapshot=await snapshotPromise;
  const authorityState=snapshot.states?.find(state=>state.id==='p1');
  assert.equal(authorityState?.trafficState?.agents?.[0]?.id,'traffic-9');

  p1.close();p2.close();p3.close();
  await sleep(40);
}

const nodePort=18081;
const nodeRelay=spawn(process.execPath,['server/multiplayer-server.mjs'],{
  env:{...process.env,WORLD_DRIVE_MP_PORT:String(nodePort)},
  stdio:['ignore','pipe','pipe']
});
let relayErrors='';
nodeRelay.stderr.on('data',chunk=>{relayErrors+=String(chunk);});
try{
  await waitHttp(`http://127.0.0.1:${nodePort}/`);
  await exerciseRelay(`ws://127.0.0.1:${nodePort}`);
}finally{
  nodeRelay.kill('SIGTERM');
}
assert.equal(relayErrors.trim(),'','Node relay must not emit errors during shared traffic test');

const electronPort=18082;
const electronRuntime=createMultiplayerRuntime();
try{
  const hosted=await electronRuntime.hostSession({port:electronPort});
  assert.equal(hosted.ok,true,'Electron relay must host successfully');
  await exerciseRelay(`ws://127.0.0.1:${electronPort}`);
}finally{
  await electronRuntime.stop();
}

console.log('PASS Traffic MP1 live relay synchronization');
console.log('  - Node relay forwards the authority SUV traffic snapshot to p2');
console.log('  - late join snapshot preserves the same authority traffic');
console.log('  - packaged Electron host relay preserves the identical traffic contract');
