import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {
  normalizeMultiplayerGear,
  reverseFromMultiplayerGear
} from '../src/multiplayer-client-m3.js';

const require=createRequire(import.meta.url);
const {createMultiplayerRuntime}=require('../electron/multiplayer-runtime.cjs');

assert.equal(typeof WebSocket,'function','Node 22 WebSocket API unavailable');

function freePort(){
  return new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const address=server.address();
      const port=typeof address==='object'&&address?address.port:null;
      server.close(error=>error?reject(error):resolve(port));
    });
  });
}

function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

function waitForOpen(ws,timeoutMs=2500){
  return new Promise((resolve,reject)=>{
    if(ws.readyState===WebSocket.OPEN)return resolve();
    const timeout=setTimeout(()=>reject(new Error('WebSocket open timeout')),timeoutMs);
    ws.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});
    ws.addEventListener('error',event=>{clearTimeout(timeout);reject(new Error(`WebSocket open error: ${event?.message||'unknown'}`));},{once:true});
  });
}

function waitForMessage(ws,predicate,timeoutMs=2500){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{
      ws.removeEventListener('message',onMessage);
      reject(new Error('WebSocket message timeout'));
    },timeoutMs);
    const onMessage=event=>{
      let message;
      try{message=JSON.parse(String(event.data));}catch{return;}
      if(!predicate(message))return;
      clearTimeout(timeout);
      ws.removeEventListener('message',onMessage);
      resolve(message);
    };
    ws.addEventListener('message',onMessage);
  });
}

async function connectClient(url,name,vehicleId){
  let lastError=null;
  for(let attempt=0;attempt<15;attempt++){
    const ws=new WebSocket(url);
    try{
      await waitForOpen(ws,700);
      const welcomePromise=waitForMessage(ws,message=>message?.type==='welcome');
      ws.send(JSON.stringify({type:'hello',name,vehicleId}));
      await welcomePromise;
      return ws;
    }catch(error){
      lastError=error;
      try{ws.close();}catch{}
      await wait(50);
    }
  }
  throw lastError||new Error('Unable to connect test WebSocket');
}

async function assertReverseRelay(url,label){
  const sender=await connectClient(url,`${label}-sender`,'sonata');
  const receiver=await connectClient(url,`${label}-receiver`,'wrx');
  try{
    const reversePromise=waitForMessage(receiver,message=>message?.type==='state'&&message?.vehicleId==='sonata'&&message?.seq===101);
    sender.send(JSON.stringify({
      type:'state',seq:101,name:'Sonata',vehicleId:'sonata',lat:45,lon:-73,y:0,heading:0,speed:0,steer:0,
      gear:-1,reversing:true,braking:false,nightLevel:0,signalLeft:false,signalRight:false,signalBlink:false
    }));
    const reverseState=await reversePromise;
    assert.equal(reverseState.gear,-1,`${label}: relay changed explicit reverse gear`);
    assert.equal(reverseState.reversing,true,`${label}: relay lost reversing=true for gear -1`);

    // Simulate one incomplete/legacy frame arriving between valid R frames. The
    // receiver must preserve the previous explicit gear instead of coercing null
    // to Neutral through Number(null) === 0.
    const incompletePromise=waitForMessage(receiver,message=>message?.type==='state'&&message?.vehicleId==='sonata'&&message?.seq===102);
    sender.send(JSON.stringify({
      type:'state',seq:102,name:'Sonata',vehicleId:'sonata',lat:45,lon:-73,y:0,heading:0,speed:0,steer:0,
      reversing:true,braking:false,nightLevel:0,signalLeft:false,signalRight:false,signalBlink:false
    }));
    const incomplete=await incompletePromise;
    assert.equal(incomplete.gear,null,`${label}: missing gear must remain null at relay boundary`);
    assert.equal(incomplete.reversing,true,`${label}: legacy reversing=true must survive missing gear`);
    const preserved=normalizeMultiplayerGear(incomplete.gear,reverseState.gear);
    assert.equal(preserved,-1,`${label}: receiver did not preserve last reverse gear across incomplete frame`);
    assert.equal(reverseFromMultiplayerGear(preserved,incomplete.reversing),true,`${label}: receiver lost reverse state after incomplete frame`);

    const neutralPromise=waitForMessage(receiver,message=>message?.type==='state'&&message?.vehicleId==='sonata'&&message?.seq===103);
    sender.send(JSON.stringify({
      type:'state',seq:103,name:'Sonata',vehicleId:'sonata',lat:45,lon:-73,y:0,heading:0,speed:0,steer:0,
      gear:0,reversing:false,braking:false,nightLevel:0,signalLeft:false,signalRight:false,signalBlink:false
    }));
    const neutralState=await neutralPromise;
    assert.equal(neutralState.gear,0,`${label}: explicit Neutral did not replicate`);
    assert.equal(neutralState.reversing,false,`${label}: Neutral incorrectly reports reversing`);
  }finally{
    try{sender.close();}catch{}
    try{receiver.close();}catch{}
  }
}

// Pure receiver contract first.
assert.equal(normalizeMultiplayerGear(-1,null),-1,'explicit reverse must normalize to -1');
assert.equal(normalizeMultiplayerGear(null,-1),-1,'null packet gear must preserve prior reverse');
assert.equal(normalizeMultiplayerGear(undefined,-1),-1,'undefined packet gear must preserve prior reverse');
assert.equal(normalizeMultiplayerGear('',-1),-1,'empty packet gear must preserve prior reverse');
assert.equal(normalizeMultiplayerGear(0,-1),0,'explicit Neutral must override prior reverse');
assert.equal(normalizeMultiplayerGear(6,-1),6,'forward gear number must replicate exactly');
assert.equal(reverseFromMultiplayerGear(-1,false),true,'-1 must derive reversing=true');
assert.equal(reverseFromMultiplayerGear(0,true),false,'0 must derive reversing=false');

// Real browser/dev relay.
const browserPort=await freePort();
const browserRelay=spawn(process.execPath,['server/multiplayer-server.mjs'],{
  cwd:process.cwd(),
  env:{...process.env,WORLD_DRIVE_MP_PORT:String(browserPort)},
  stdio:['ignore','pipe','pipe']
});
let browserLogs='';
browserRelay.stdout.on('data',chunk=>{browserLogs+=String(chunk);});
browserRelay.stderr.on('data',chunk=>{browserLogs+=String(chunk);});
try{
  await assertReverseRelay(`ws://127.0.0.1:${browserPort}`,'browser-relay');
}finally{
  browserRelay.kill('SIGTERM');
}

// Real packaged Electron/Windows relay.
const electronPort=await freePort();
const runtime=createMultiplayerRuntime();
try{
  const status=await runtime.hostSession({port:electronPort});
  assert.equal(status.ok,true,`electron relay failed to start: ${status.error||'unknown'}`);
  await assertReverseRelay(`ws://127.0.0.1:${electronPort}`,'electron-relay');
}finally{
  await runtime.stop();
}

console.log('V21.31 MULTIPLAYER M4.11 REVERSE E2E QA: PASS',{
  wireContract:{reverse:-1,neutral:0,forward:'1..N'},
  receiverPreservesMissingGear:true,
  browserRelay:true,
  electronRelay:true,
  incompleteFrameDoesNotCancelReverse:true
});
