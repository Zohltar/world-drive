import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {createMultiplayerRuntime}=require('../electron/multiplayer-runtime.cjs');
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(__dirname,'..');
const frameBuffers=new WeakMap();

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function freePort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}

async function waitForPort(port,timeoutMs=3000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const ok=await new Promise(resolve=>{
      const socket=net.createConnection({host:'127.0.0.1',port});
      const done=value=>{
        socket.removeAllListeners();
        try{socket.destroy();}catch{}
        resolve(value);
      };
      socket.once('connect',()=>done(true));
      socket.once('error',()=>done(false));
      socket.setTimeout(100,()=>done(false));
    });
    if(ok)return;
    await sleep(25);
  }
  throw new Error(`relay did not listen on ${port}`);
}

function validKey(){
  return crypto.randomBytes(16).toString('base64');
}

async function handshake(port,{
  requestPath='/',
  connection='Upgrade',
  version='13',
  key=validKey(),
  origin,
  hostHeader=`127.0.0.1:${port}`
}={}){
  const socket=net.createConnection({host:'127.0.0.1',port});
  socket.setNoDelay(true);
  await new Promise((resolve,reject)=>{
    socket.once('connect',resolve);
    socket.once('error',reject);
  });

  const headers=[
    `GET ${requestPath} HTTP/1.1`,
    `Host: ${hostHeader}`,
    'Upgrade: websocket',
    `Connection: ${connection}`,
    `Sec-WebSocket-Key: ${key}`,
    `Sec-WebSocket-Version: ${version}`
  ];
  if(origin!==undefined)headers.push(`Origin: ${origin}`);
  socket.write(headers.join('\r\n')+'\r\n\r\n');

  const response=await new Promise((resolve,reject)=>{
    let buffer=Buffer.alloc(0);
    const timer=setTimeout(()=>finish(new Error('handshake timeout')),1200);
    const onData=chunk=>{
      buffer=Buffer.concat([buffer,chunk]);
      const marker=buffer.indexOf('\r\n\r\n');
      if(marker<0)return;
      const header=buffer.subarray(0,marker+4).toString('utf8');
      const extra=buffer.subarray(marker+4);
      if(extra.length)frameBuffers.set(socket,extra);
      finish(null,header);
    };
    const onClose=()=>{
      if(buffer.length)finish(null,buffer.toString('utf8'));
      else finish(new Error('socket closed before handshake response'));
    };
    const onError=error=>finish(error);
    function finish(error,value){
      clearTimeout(timer);
      socket.off('data',onData);
      socket.off('close',onClose);
      socket.off('error',onError);
      if(error)reject(error); else resolve(value);
    }
    socket.on('data',onData);
    socket.once('close',onClose);
    socket.once('error',onError);
  });

  return {socket,response};
}

function clientFrame(payload,{opcode=0x1,fin=true,masked=true,rsv1=false}={}){
  payload=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload),'utf8');
  let headerLength=2;
  if(payload.length>=126&&payload.length<=0xffff)headerLength=4;
  else if(payload.length>0xffff)headerLength=10;
  const maskBytes=masked?4:0;
  const frame=Buffer.alloc(headerLength+maskBytes+payload.length);
  frame[0]=(fin?0x80:0)|(rsv1?0x40:0)|opcode;
  if(payload.length<126){
    frame[1]=(masked?0x80:0)|payload.length;
  }else if(payload.length<=0xffff){
    frame[1]=(masked?0x80:0)|126;
    frame.writeUInt16BE(payload.length,2);
  }else{
    frame[1]=(masked?0x80:0)|127;
    frame.writeBigUInt64BE(BigInt(payload.length),2);
  }
  let offset=headerLength;
  let mask=null;
  if(masked){
    mask=crypto.randomBytes(4);
    mask.copy(frame,offset);
    offset+=4;
  }
  for(let i=0;i<payload.length;i++){
    frame[offset+i]=masked?(payload[i]^mask[i%4]):payload[i];
  }
  return frame;
}

function parseServerFrame(buffer){
  if(buffer.length<2)return null;
  const first=buffer[0];
  const second=buffer[1];
  let length=second&0x7f;
  let offset=2;
  if(length===126){
    if(buffer.length<4)return null;
    length=buffer.readUInt16BE(2);
    offset=4;
  }else if(length===127){
    if(buffer.length<10)return null;
    const big=buffer.readBigUInt64BE(2);
    if(big>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('server frame too large');
    length=Number(big);
    offset=10;
  }
  const masked=(second&0x80)!==0;
  if(masked)throw new Error('server unexpectedly masked frame');
  if(buffer.length<offset+length)return null;
  return {
    frame:{opcode:first&0x0f,fin:(first&0x80)!==0,payload:Buffer.from(buffer.subarray(offset,offset+length))},
    rest:buffer.subarray(offset+length)
  };
}

async function readFrame(socket,timeoutMs=700){
  const deadline=Date.now()+timeoutMs;
  while(true){
    const current=frameBuffers.get(socket)||Buffer.alloc(0);
    const parsed=parseServerFrame(current);
    if(parsed){
      frameBuffers.set(socket,parsed.rest);
      return parsed.frame;
    }
    const remaining=deadline-Date.now();
    if(remaining<=0)throw new Error('frame timeout');
    const chunk=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(new Error('frame timeout')),remaining);
      const onData=data=>finish(null,data);
      const onClose=()=>finish(new Error('socket closed'));
      const onError=error=>finish(error);
      function finish(error,value){
        clearTimeout(timer);
        socket.off('data',onData);
        socket.off('close',onClose);
        socket.off('error',onError);
        if(error)reject(error); else resolve(value);
      }
      socket.once('data',onData);
      socket.once('close',onClose);
      socket.once('error',onError);
    });
    frameBuffers.set(socket,Buffer.concat([current,chunk]));
  }
}

async function readJsonUntil(socket,type,timeoutMs=1200){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const frame=await readFrame(socket,Math.max(1,deadline-Date.now()));
    if(frame.opcode!==0x1)continue;
    const message=JSON.parse(frame.payload.toString('utf8'));
    if(message.type===type)return message;
  }
  throw new Error(`did not receive ${type}`);
}

async function readOpcodeUntil(socket,opcode,timeoutMs=1200){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const frame=await readFrame(socket,Math.max(1,deadline-Date.now()));
    if(frame.opcode===opcode)return frame;
  }
  throw new Error(`did not receive opcode ${opcode}`);
}

async function waitClosed(socket,timeoutMs=1200){
  if(socket.destroyed)return;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(new Error('socket did not close')),timeoutMs);
    const onClose=()=>finish();
    const onEnd=()=>finish();
    const onError=()=>finish();
    function finish(error){
      clearTimeout(timer);
      socket.off('close',onClose);
      socket.off('end',onEnd);
      socket.off('error',onError);
      if(error)reject(error); else resolve();
    }
    socket.once('close',onClose);
    socket.once('end',onEnd);
    socket.once('error',onError);
  });
}

async function destroySocket(socket){
  if(!socket||socket.destroyed)return;
  socket.destroy();
  try{await waitClosed(socket,300);}catch{}
}

async function consumeJoin(socket){
  await readJsonUntil(socket,'welcome');
  await readJsonUntil(socket,'snapshot');
  await readJsonUntil(socket,'roster');
}

async function runRelaySuite(label,startRelay,stopRelay){
  const port=await freePort();
  await startRelay(port);
  await waitForPort(port);
  try{
    for(const [name,options,status] of [
      ['valid no-origin',{},'101 Switching Protocols'],
      ['wrong path',{requestPath:'/not-world-drive'},'404 Not Found'],
      ['missing connection',{connection:'keep-alive'},'400 Bad Request'],
      ['wrong version',{version:'12'},'426 Upgrade Required'],
      ['invalid key',{key:'not-a-websocket-key'},'400 Bad Request'],
      ['public origin',{origin:'https://evil.example'},'403 Forbidden'],
      ['loopback origin',{origin:'http://127.0.0.1:17317'},'101 Switching Protocols'],
      ['private origin',{origin:'http://192.168.1.50:5173'},'101 Switching Protocols'],
      ['same-host origin',{origin:'http://worlddrive.local:5173',hostHeader:`worlddrive.local:${port}`},'101 Switching Protocols']
    ]){
      const result=await handshake(port,options);
      assert.ok(result.response.includes(status),`${label}: ${name} expected ${status}, got ${result.response.split('\r\n')[0]}`);
      if(options.version==='12')assert.ok(result.response.includes('Sec-WebSocket-Version: 13'),`${label}: version rejection must advertise 13`);
      await destroySocket(result.socket);
    }

    // Application protocol smoke: hello/welcome/snapshot/roster and state relay,
    // including the compact shared traffic snapshot, remain unchanged.
    const a=await handshake(port);
    const b=await handshake(port);
    assert.ok(a.response.includes('101'));
    assert.ok(b.response.includes('101'));
    a.socket.write(clientFrame(JSON.stringify({type:'hello',name:'A',vehicleId:'wrx'})));
    await consumeJoin(a.socket);
    b.socket.write(clientFrame(JSON.stringify({type:'hello',name:'B',vehicleId:'sonata'})));
    await consumeJoin(b.socket);
    a.socket.write(clientFrame(JSON.stringify({
      type:'state',seq:7,name:'A',lat:100,lon:-200,y:12,heading:1,speed:22,vehicleId:'wrx',steer:.1,
      trafficState:{protocol:'traffic-mp1',sequence:3,routeLength:1234,agents:[
        {id:'t1',vehicleId:'sonata',direction:1,cum:200,speed:12,cruiseSpeed:14,laneOffset:1},
        {id:'t2',vehicleId:'wrx',direction:-1,cum:500,speed:9,cruiseSpeed:10,laneOffset:-1}
      ]}
    })));
    const relayed=await readJsonUntil(b.socket,'state');
    assert.equal(relayed.lat,90,`${label}: state sanitation changed`);
    assert.equal(relayed.lon,-180,`${label}: state sanitation changed`);
    assert.equal(relayed.trafficState?.protocol,'traffic-mp1',`${label}: traffic relay changed`);
    assert.equal(relayed.trafficState?.agents?.length,2,`${label}: traffic relay agent cap changed`);
    await destroySocket(a.socket);
    await destroySocket(b.socket);
    await sleep(20);

    // Repeated hello must not generate a second join/welcome cycle.
    const repeat=await handshake(port);
    repeat.socket.write(clientFrame(JSON.stringify({type:'hello',name:'Once',vehicleId:'wrx'})));
    await consumeJoin(repeat.socket);
    repeat.socket.write(clientFrame(JSON.stringify({type:'hello',name:'Twice',vehicleId:'wrx'})));
    let repeatedFrame=null;
    try{repeatedFrame=await readFrame(repeat.socket,140);}catch(error){
      assert.equal(error.message,'frame timeout',`${label}: repeated hello unexpectedly closed connection`);
    }
    assert.equal(repeatedFrame,null,`${label}: repeated hello emitted another server frame`);

    // Control payloads stay byte-exact.
    const ping=Buffer.from([0x00,0xff,0x31,0x7f]);
    repeat.socket.write(clientFrame(ping,{opcode:0x9}));
    const pong=await readOpcodeUntil(repeat.socket,0xA);
    assert.deepEqual(pong.payload,ping,`${label}: ping/pong payload changed`);
    await destroySocket(repeat.socket);

    // Bounded RFC-compatible text fragmentation remains accepted.
    const fragmented=await handshake(port);
    const hello=Buffer.from(JSON.stringify({type:'hello',name:'Fragment',vehicleId:'wrx'}));
    const split=Math.floor(hello.length/2);
    fragmented.socket.write(Buffer.concat([
      clientFrame(hello.subarray(0,split),{opcode:0x1,fin:false}),
      clientFrame(hello.subarray(split),{opcode:0x0,fin:true})
    ]));
    await readJsonUntil(fragmented.socket,'welcome');
    await destroySocket(fragmented.socket);

    // Unmasked, RSV, oversized and malformed JSON clients are rejected.
    for(const [name,frame] of [
      ['unmasked',clientFrame(JSON.stringify({type:'hello'}),{masked:false})],
      ['rsv',clientFrame(JSON.stringify({type:'hello'}),{rsv1:true})],
      ['oversized',clientFrame(Buffer.alloc(4097,0x61))],
      ['malformed-json',clientFrame('{')]
    ]){
      const bad=await handshake(port);
      bad.socket.write(frame);
      await waitClosed(bad.socket);
      assert.ok(bad.socket.destroyed||bad.socket.readableEnded,`${label}: ${name} client stayed connected`);
    }

    // 30 normal application messages in a burst remain safely below the 4x
    // 30 Hz policy margin; an abusive >120/s burst is disconnected.
    const normal=await handshake(port);
    normal.socket.write(clientFrame(JSON.stringify({type:'hello',name:'Normal',vehicleId:'wrx'})));
    await consumeJoin(normal.socket);
    normal.socket.write(Buffer.concat(Array.from({length:30},(_,i)=>clientFrame(JSON.stringify({type:'noop',i})))));
    const normalPing=Buffer.from('ok');
    normal.socket.write(clientFrame(normalPing,{opcode:0x9}));
    const normalPong=await readOpcodeUntil(normal.socket,0xA);
    assert.deepEqual(normalPong.payload,normalPing,`${label}: normal burst was rate-limited`);
    await destroySocket(normal.socket);

    const abusive=await handshake(port);
    abusive.socket.write(clientFrame(JSON.stringify({type:'hello',name:'Fast',vehicleId:'wrx'})));
    await consumeJoin(abusive.socket);
    abusive.socket.write(Buffer.concat(Array.from({length:121},(_,i)=>clientFrame(JSON.stringify({type:'noop',i})))));
    await waitClosed(abusive.socket);

    // Upgraded sockets, including clients that never send hello, are bounded.
    const held=[];
    try{
      for(let i=0;i<32;i++){
        const item=await handshake(port);
        assert.ok(item.response.includes('101 Switching Protocols'),`${label}: client ${i+1}/32 was unexpectedly rejected`);
        held.push(item.socket);
      }
      const overflow=await handshake(port);
      assert.ok(overflow.response.includes('503 Service Unavailable'),`${label}: 33rd client must be rejected`);
      await destroySocket(overflow.socket);
    }finally{
      await Promise.all(held.map(destroySocket));
    }
  }finally{
    await stopRelay();
  }
}

const standaloneSource=fs.readFileSync(path.join(repoRoot,'server/multiplayer-server.mjs'),'utf8');
const electronSource=fs.readFileSync(path.join(repoRoot,'electron/multiplayer-runtime.cjs'),'utf8');
const expectedConstants={
  WS_PATH:"'/'",
  WS_MAX_CLIENTS:'32',
  WS_MAX_MESSAGE_BYTES:'4096',
  WS_MAX_BUFFER_BYTES:'64*1024',
  WS_MAX_MESSAGES_PER_SECOND:'120',
  WS_HELLO_TIMEOUT_MS:'10000',
  WS_MAX_HEADER_BYTES:'8192'
};
for(const [name,value] of Object.entries(expectedConstants)){
  for(const [label,source] of [['standalone',standaloneSource],['electron',electronSource]]){
    assert.ok(source.includes(`const ${name}=${value};`),`${label}: ${name} policy drift`);
  }
}
for(const marker of [
  "req.url!==WS_PATH",
  "version!=='13'",
  '!allowedOrigin(req)',
  'clients.size>=WS_MAX_CLIENTS',
  '!masked',
  'client.fragmentedBytes>WS_MAX_MESSAGE_BYTES',
  'client.rateCount>WS_MAX_MESSAGES_PER_SECOND',
  'UTF8_DECODER.decode(payload)',
  'framePayload(payload,0xA)',
  'setTimeout(()=>{'
]){
  assert.ok(standaloneSource.includes(marker),`standalone missing hardening marker: ${marker}`);
  assert.ok(electronSource.includes(marker),`electron missing hardening marker: ${marker}`);
}

let standaloneProcess=null;
await runRelaySuite(
  'standalone',
  async port=>{
    standaloneProcess=spawn(process.execPath,[path.join(repoRoot,'server/multiplayer-server.mjs')],{
      cwd:repoRoot,
      env:{...process.env,WORLD_DRIVE_MP_PORT:String(port)},
      stdio:['ignore','pipe','pipe']
    });
    let stderr='';
    standaloneProcess.stderr.on('data',chunk=>{stderr+=chunk.toString();});
    standaloneProcess.once('exit',code=>{
      if(code&&code!==0)console.error('standalone relay exited',code,stderr);
    });
  },
  async()=>{
    if(!standaloneProcess)return;
    const processToStop=standaloneProcess;
    standaloneProcess=null;
    if(processToStop.exitCode===null){
      processToStop.kill('SIGTERM');
      await Promise.race([
        new Promise(resolve=>processToStop.once('exit',resolve)),
        sleep(500)
      ]);
      if(processToStop.exitCode===null)processToStop.kill('SIGKILL');
    }
  }
);

let electronRuntime=null;
await runRelaySuite(
  'electron',
  async port=>{
    electronRuntime=createMultiplayerRuntime();
    const status=await electronRuntime.hostSession({port});
    assert.equal(status.ok,true,`Electron relay failed to start: ${status.error||''}`);
    assert.equal(status.mode,'host');
  },
  async()=>{
    if(electronRuntime)await electronRuntime.stop();
    electronRuntime=null;
  }
);

console.log('POST-REFACTOR LAN RELAY HARDENING R1 QA: PASS',{
  relays:['standalone','electron'],
  path:'/',
  maxClients:32,
  maxMessageBytes:4096,
  maxBufferBytes:64*1024,
  maxMessagesPerSecond:120,
  helloTimeoutMs:10000,
  originPolicy:'absent or loopback/private/same-host',
  appProtocol:'preserved'
});