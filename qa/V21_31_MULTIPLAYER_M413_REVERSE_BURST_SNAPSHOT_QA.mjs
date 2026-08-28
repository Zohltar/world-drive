import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {createMultiplayerRuntime}=require('../electron/multiplayer-runtime.cjs');

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
    ws.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('WebSocket open error'));},{once:true});
  });
}
function waitForMessage(ws,predicate,timeoutMs=3000){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{ws.removeEventListener('message',onMessage);reject(new Error('WebSocket message timeout'));},timeoutMs);
    const onMessage=event=>{
      let message;try{message=JSON.parse(String(event.data));}catch{return;}
      if(!predicate(message))return;
      clearTimeout(timeout);ws.removeEventListener('message',onMessage);resolve(message);
    };
    ws.addEventListener('message',onMessage);
  });
}
async function connect(url,name,vehicleId,{captureSnapshot=false}={}){
  const ws=new WebSocket(url);await waitForOpen(ws);
  const welcome=waitForMessage(ws,m=>m?.type==='welcome');
  const snapshot=captureSnapshot?waitForMessage(ws,m=>m?.type==='snapshot'):null;
  ws.send(JSON.stringify({type:'hello',name,vehicleId}));
  await welcome;
  return{ws,snapshot:snapshot?await snapshot:null};
}
function packet(seq,gear,{vehicleId='sonata'}={}){
  return{
    type:'state',seq,name:'Stress',vehicleId,
    lat:45.5,lon:-73.4,y:0,heading:.2,speed:gear===-1?-1.2:0,steer:.15,
    gear,reversing:gear===-1,
    braking:seq%3===0,
    nightLevel:seq%7===0?1:0,
    signalLeft:seq%5===0,
    signalRight:seq%11===0,
    signalBlink:seq%2===0,
    onRoad:true,skidFront:0,skidRear:0,
    bodyPitch:0,bodyYaw:0,bodyRoll:0,bodyY:0,wheelPitch:0,wheelRoll:0
  };
}

async function runRelay(url,label){
  const senderInfo=await connect(url,`${label}-sender`,'sonata');
  const sender=senderInfo.ws;
  const held=packet(700,-1);
  sender.send(JSON.stringify(held));
  await wait(40);

  // A late observer must immediately receive the sender's current R state in
  // the relay snapshot, before any fresh 30 Hz state packet is required.
  const late=await connect(url,`${label}-late`,'wrx',{captureSnapshot:true});
  const snapshotState=(late.snapshot?.states||[]).find(s=>s?.vehicleId==='sonata'&&s?.seq===700);
  assert(snapshotState,`${label}: late join snapshot omitted active Sonata state`);
  assert.equal(snapshotState.gear,-1,`${label}: late join snapshot lost reverse gear`);
  assert.equal(snapshotState.reversing,true,`${label}: late join snapshot lost reversing=true`);
  assert.equal(snapshotState.braking,held.braking,`${label}: late join snapshot brake drift`);

  const observer2=(await connect(url,`${label}-observer2`,'wrx')).ws;
  const receivedA=[];
  const receivedB=[];
  const collectA=e=>{try{const m=JSON.parse(String(e.data));if(m?.type==='state'&&m?.vehicleId==='sonata'&&m.seq>=800)receivedA.push(m);}catch{}};
  const collectB=e=>{try{const m=JSON.parse(String(e.data));if(m?.type==='state'&&m?.vehicleId==='sonata'&&m.seq>=800)receivedB.push(m);}catch{}};
  late.ws.addEventListener('message',collectA);
  observer2.addEventListener('message',collectB);

  const gears=[-1,1,0,-1,3,0,1,-1];
  const burstCount=320;
  for(let i=0;i<burstCount;i++){
    const seq=800+i;
    sender.send(JSON.stringify(packet(seq,gears[i%gears.length])));
  }

  const finalSeq=800+burstCount-1;
  const deadline=Date.now()+4000;
  while(Date.now()<deadline){
    if(receivedA.some(m=>m.seq===finalSeq)&&receivedB.some(m=>m.seq===finalSeq))break;
    await wait(10);
  }
  late.ws.removeEventListener('message',collectA);
  observer2.removeEventListener('message',collectB);

  for(const [name,list] of [['late',receivedA],['observer2',receivedB]]){
    assert(list.length>0,`${label}/${name}: burst produced no received states`);
    const final=list.find(m=>m.seq===finalSeq);
    assert(final,`${label}/${name}: final burst packet ${finalSeq} missing`);
    for(const m of list){
      const expectedGear=gears[(m.seq-800)%gears.length];
      assert.equal(m.gear,expectedGear,`${label}/${name}: gear drift at seq ${m.seq}`);
      assert.equal(m.reversing,expectedGear===-1,`${label}/${name}: reverse drift at seq ${m.seq}`);
      assert.equal(m.braking,m.seq%3===0,`${label}/${name}: brake drift at seq ${m.seq}`);
      assert.equal(m.signalLeft,m.seq%5===0,`${label}/${name}: left signal drift at seq ${m.seq}`);
      assert.equal(m.signalRight,m.seq%11===0,`${label}/${name}: right signal drift at seq ${m.seq}`);
      assert.equal(m.signalBlink,m.seq%2===0,`${label}/${name}: blink phase drift at seq ${m.seq}`);
    }
  }

  try{sender.close();}catch{}
  try{late.ws.close();}catch{}
  try{observer2.close();}catch{}
  return{label,lateJoinReverseSnapshot:true,burstCount,observers:2,received:[receivedA.length,receivedB.length]};
}

const reports=[];
const browserPort=await freePort();
const browser=spawn(process.execPath,['server/multiplayer-server.mjs'],{
  cwd:process.cwd(),env:{...process.env,WORLD_DRIVE_MP_PORT:String(browserPort)},stdio:['ignore','pipe','pipe']
});
try{reports.push(await runRelay(`ws://127.0.0.1:${browserPort}`,'browser'));}
finally{browser.kill('SIGTERM');}

const electronPort=await freePort();
const runtime=createMultiplayerRuntime();
try{
  const status=await runtime.hostSession({port:electronPort});
  assert.equal(status.ok,true,`electron relay start failed: ${status.error||'unknown'}`);
  reports.push(await runRelay(`ws://127.0.0.1:${electronPort}`,'electron'));
}finally{await runtime.stop();}

console.log('V21.31 MULTIPLAYER M4.13 REVERSE SNAPSHOT/BURST QA: PASS',reports);
