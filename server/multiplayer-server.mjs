// World Drive V18K - dependency-free N-player LAN WebSocket relay.
// This server intentionally does NOT simulate vehicles or collisions.

import http from 'node:http';
import crypto from 'node:crypto';

const HOST='0.0.0.0';
const PORT=Number(process.env.WORLD_DRIVE_MP_PORT||8081);
const MAGIC='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const WS_PATH='/';
const WS_MAX_CLIENTS=32;
const WS_MAX_MESSAGE_BYTES=4096;
const WS_MAX_BUFFER_BYTES=64*1024;
const WS_MAX_MESSAGES_PER_SECOND=120;
const WS_HELLO_TIMEOUT_MS=10000;
const WS_MAX_HEADER_BYTES=8192;
const UTF8_DECODER=new TextDecoder('utf-8',{fatal:true});
const clients=new Map();
let nextId=1;

function framePayload(payload,opcode=0x1){
  payload=Buffer.isBuffer(payload)?payload:Buffer.from(payload||'');
  let header;

  if(payload.length<126){
    header=Buffer.alloc(2);
    header[1]=payload.length;
  }else if(payload.length<=0xffff){
    header=Buffer.alloc(4);
    header[1]=126;
    header.writeUInt16BE(payload.length,2);
  }else{
    header=Buffer.alloc(10);
    header[1]=127;
    header.writeBigUInt64BE(BigInt(payload.length),2);
  }

  header[0]=0x80|opcode;
  return Buffer.concat([header,payload]);
}

function frameText(text,opcode=0x1){
  return framePayload(Buffer.from(text,'utf8'),opcode);
}

function send(client,message){
  if(client.socket.destroyed)return;
  try{
    client.socket.write(frameText(JSON.stringify(message)));
  }catch(error){
    console.warn('Send failed',client.id,error.message);
  }
}

function broadcast(message,exceptId=null){
  for(const client of clients.values()){
    if(client.id===exceptId)continue;
    send(client,message);
  }
}

function activeClientCount(){
  let count=0;
  for(const client of clients.values()){
    if(client.hello)count++;
  }
  return count;
}

function broadcastRoster(){
  broadcast({
    type:'roster',
    count:activeClientCount()
  });
}

function cleanName(value){
  return String(value||'Conducteur')
    .replace(/[\u0000-\u001f\u007f]/g,'')
    .trim()
    .slice(0,24)||'Conducteur';
}

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function normalizeGear(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  if(!Number.isFinite(n))return null;
  return n<0?-1:n===0?0:Math.max(1,Math.floor(n));
}

function clamp(v,a,b){
  return Math.max(a,Math.min(b,v));
}

function safeTrafficState(value){
  if(!value||typeof value!=='object'||value.protocol!=='traffic-mp1')return null;
  const agents=Array.isArray(value.agents)?value.agents.slice(0,2):[];
  return {
    protocol:'traffic-mp1',
    sequence:Math.max(0,Math.floor(finite(value.sequence))),
    routeLength:clamp(finite(value.routeLength),0,10000000),
    agents:agents.map(agent=>{
      if(!agent||typeof agent!=='object')return null;
      const direction=finite(agent.direction,1)<0?-1:1;
      const id=String(agent.id||agent.networkId||'').slice(0,48);
      const vehicleId=String(agent.vehicleId||'sonata').slice(0,32);
      if(!id||!vehicleId)return null;
      return {
        id,
        vehicleId,
        kind:direction>0?'ahead':'oncoming',
        direction,
        cum:clamp(finite(agent.cum),0,10000000),
        speed:clamp(finite(agent.speed),0,60),
        cruiseSpeed:clamp(finite(agent.cruiseSpeed,agent.speed),0,60),
        laneOffset:clamp(finite(agent.laneOffset),-4,4)
      };
    }).filter(Boolean)
  };
}

function safeState(client,message){
  const gear=normalizeGear(message.gear);
  return {
    type:'state',
    id:client.id,
    seq:Math.max(0,Math.floor(finite(message.seq))),
    serverTime:Date.now(),
    name:client.name,
    lat:clamp(finite(message.lat),-90,90),
    lon:clamp(finite(message.lon),-180,180),
    y:clamp(finite(message.y),-500,10000),
    heading:finite(message.heading),

    velocityHeading:finite(message.velocityHeading,message.heading),
    longitudinalAccel:clamp(finite(message.longitudinalAccel),-20,15),

    speed:clamp(finite(message.speed),-100,150),
    vehicleId:String(message.vehicleId||client.vehicleId||'wrx').slice(0,32),
    steer:clamp(finite(message.steer),-1.2,1.2),

    gear,
    braking:!!message.braking,
    reversing:gear!==null?gear===-1:!!message.reversing,

    nightLevel:clamp(finite(message.nightLevel),0,1),
    signalLeft:!!message.signalLeft,
    signalRight:!!message.signalRight,
    signalBlink:!!message.signalBlink,
    lightingProtocol:message.lightingProtocol==='m2.4'?'m2.4':null,

    onRoad:!!message.onRoad,
    skidFront:clamp(finite(message.skidFront),0,1),
    skidRear:clamp(finite(message.skidRear),0,1),

    bodyPitch:clamp(finite(message.bodyPitch),-1.2,1.2),
    bodyYaw:clamp(finite(message.bodyYaw),-.35,.35),
    bodyRoll:clamp(finite(message.bodyRoll),-1.2,1.2),
    bodyY:clamp(finite(message.bodyY),-2,2),
    wheelPitch:clamp(finite(message.wheelPitch),-1.2,1.2),
    wheelRoll:clamp(finite(message.wheelRoll),-1.2,1.2),

    // Traffic MP1 is still presentation-only. The relay sanitizes and forwards
    // the elected client's compact one-dimensional route snapshot; it never
    // advances civil cars itself.
    trafficState:safeTrafficState(message.trafficState)
  };
}

function handleMessage(client,message){
  if(!message||typeof message!=='object'||Array.isArray(message))return;

  if(message.type==='hello'){
    if(client.hello)return;
    client.name=cleanName(message.name);
    client.vehicleId=String(message.vehicleId||'wrx').slice(0,32);
    client.hello=true;
    if(client.helloTimer){
      clearTimeout(client.helloTimer);
      client.helloTimer=null;
    }

    send(client,{
      type:'welcome',
      id:client.id,
      count:activeClientCount()
    });

    const states=[];
    for(const other of clients.values()){
      if(
        other.id===client.id||
        !other.hello||
        !other.lastState
      )continue;
      states.push(other.lastState);
    }

    send(client,{
      type:'snapshot',
      states
    });

    broadcast(
      {type:'refresh-state',joinedId:client.id},
      client.id
    );

    broadcastRoster();
    console.log(`[join] ${client.id} ${client.name}`);
    return;
  }

  if(message.type==='state'){
    if(!client.hello)return;
    client.name=cleanName(message.name||client.name);
    client.vehicleId=String(message.vehicleId||client.vehicleId||'wrx').slice(0,32);
    client.lastState=safeState(client,message);
    broadcast(client.lastState,client.id);
  }
}

function destroyClient(client){
  try{client.socket.destroy();}catch{}
}

function acceptApplicationMessage(client,payload){
  const now=Date.now();
  if(now-client.rateWindowStart>=1000){
    client.rateWindowStart=now;
    client.rateCount=0;
  }
  client.rateCount++;
  if(client.rateCount>WS_MAX_MESSAGES_PER_SECOND){
    destroyClient(client);
    return false;
  }

  let text;
  try{
    text=UTF8_DECODER.decode(payload);
  }catch{
    destroyClient(client);
    return false;
  }

  let message;
  try{
    message=JSON.parse(text);
  }catch{
    destroyClient(client);
    return false;
  }

  handleMessage(client,message);
  return true;
}

function parseFrames(client,chunk){
  if(client.buffer.length+chunk.length>WS_MAX_BUFFER_BYTES){
    destroyClient(client);
    return;
  }
  client.buffer=Buffer.concat([client.buffer,chunk]);

  while(client.buffer.length>=2){
    const first=client.buffer[0];
    const second=client.buffer[1];
    const fin=(first&0x80)!==0;
    const rsv=first&0x70;
    const opcode=first&0x0f;
    const masked=(second&0x80)!==0;
    const control=opcode>=0x8;
    let length=second&0x7f;
    let offset=2;

    if(rsv!==0||!masked||![0x0,0x1,0x8,0x9,0xA].includes(opcode)){
      destroyClient(client);
      return;
    }
    if(control&&!fin){
      destroyClient(client);
      return;
    }

    if(length===126){
      if(client.buffer.length<4)return;
      length=client.buffer.readUInt16BE(2);
      offset=4;
    }else if(length===127){
      if(client.buffer.length<10)return;
      const big=client.buffer.readBigUInt64BE(2);
      if(big>BigInt(WS_MAX_BUFFER_BYTES)){
        destroyClient(client);
        return;
      }
      length=Number(big);
      offset=10;
    }

    if(control&&length>125){
      destroyClient(client);
      return;
    }
    if(!control&&length>WS_MAX_MESSAGE_BYTES){
      destroyClient(client);
      return;
    }
    if(client.buffer.length<offset+4)return;

    const mask=client.buffer.subarray(offset,offset+4);
    offset+=4;
    if(client.buffer.length<offset+length)return;

    const payload=Buffer.from(client.buffer.subarray(offset,offset+length));
    client.buffer=client.buffer.subarray(offset+length);
    for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];

    if(opcode===0x8){
      try{client.socket.end(framePayload(payload,0x8));}catch{destroyClient(client);}
      return;
    }
    if(opcode===0x9){
      try{client.socket.write(framePayload(payload,0xA));}catch{destroyClient(client);}
      continue;
    }
    if(opcode===0xA)continue;

    if(opcode===0x1){
      if(client.fragmentedText){
        destroyClient(client);
        return;
      }
      if(fin){
        if(!acceptApplicationMessage(client,payload))return;
        continue;
      }
      client.fragmentedText=[payload];
      client.fragmentedBytes=payload.length;
      continue;
    }

    if(!client.fragmentedText){
      destroyClient(client);
      return;
    }
    client.fragmentedBytes+=payload.length;
    if(client.fragmentedBytes>WS_MAX_MESSAGE_BYTES){
      destroyClient(client);
      return;
    }
    client.fragmentedText.push(payload);
    if(fin){
      const messagePayload=Buffer.concat(client.fragmentedText,client.fragmentedBytes);
      client.fragmentedText=null;
      client.fragmentedBytes=0;
      if(!acceptApplicationMessage(client,messagePayload))return;
    }
  }
}

function hasUpgradeToken(value){
  return String(value||'')
    .split(',')
    .some(token=>token.trim().toLowerCase()==='upgrade');
}

function validWebSocketKey(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9+/]{22}==$/.test(value))return false;
  try{return Buffer.from(value,'base64').length===16;}catch{return false;}
}

function hostNameFromHeader(value){
  const text=String(value||'').trim();
  if(!text)return '';
  try{return new URL(`http://${text}`).hostname.toLowerCase();}catch{return '';}
}

function isLoopbackHost(hostname){
  return hostname==='localhost'||hostname==='::1'||/^127(?:\.|$)/.test(hostname);
}

function isPrivateIPv4(hostname){
  return /^10\./.test(hostname)||
    /^192\.168\./.test(hostname)||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname);
}

function allowedOrigin(req){
  const origin=req.headers.origin;
  if(origin===undefined)return true;
  try{
    const parsed=new URL(String(origin));
    if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')return false;
    const originHost=parsed.hostname.toLowerCase();
    const requestHost=hostNameFromHeader(req.headers.host);
    return isLoopbackHost(originHost)||
      isPrivateIPv4(originHost)||
      (!!requestHost&&originHost===requestHost);
  }catch{
    return false;
  }
}

function rejectUpgrade(socket,status='400 Bad Request',extraHeaders=''){
  try{
    socket.end(
      `HTTP/1.1 ${status}\r\n`+
      extraHeaders+
      'Connection: close\r\n'+
      'Content-Length: 0\r\n\r\n'
    );
  }catch{
    try{socket.destroy();}catch{}
  }
}

const server=http.createServer({maxHeaderSize:WS_MAX_HEADER_BYTES},(req,res)=>{
  res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});
  res.end(
    `World Drive multiplayer relay\nPlayers: ${activeClientCount()}\n`
  );
});

server.on('upgrade',(req,socket)=>{
  const key=req.headers['sec-websocket-key'];
  const upgrade=String(req.headers.upgrade||'').toLowerCase();
  const version=String(req.headers['sec-websocket-version']||'');

  if(req.method!=='GET'||upgrade!=='websocket'||!hasUpgradeToken(req.headers.connection)||!validWebSocketKey(key)){
    rejectUpgrade(socket);
    return;
  }
  if(req.url!==WS_PATH){
    rejectUpgrade(socket,'404 Not Found');
    return;
  }
  if(version!=='13'){
    rejectUpgrade(socket,'426 Upgrade Required','Sec-WebSocket-Version: 13\r\n');
    return;
  }
  if(!allowedOrigin(req)){
    rejectUpgrade(socket,'403 Forbidden');
    return;
  }
  if(clients.size>=WS_MAX_CLIENTS){
    rejectUpgrade(socket,'503 Service Unavailable');
    return;
  }

  const accept=crypto
    .createHash('sha1')
    .update(key+MAGIC)
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n'+
    'Upgrade: websocket\r\n'+
    'Connection: Upgrade\r\n'+
    `Sec-WebSocket-Accept: ${accept}\r\n`+
    '\r\n'
  );

  const client={
    id:`p${nextId++}`,
    socket,
    buffer:Buffer.alloc(0),
    name:'Conducteur',
    vehicleId:'wrx',
    hello:false,
    lastState:null,
    fragmentedText:null,
    fragmentedBytes:0,
    rateWindowStart:Date.now(),
    rateCount:0,
    helloTimer:null
  };
  clients.set(client.id,client);

  client.helloTimer=setTimeout(()=>{
    if(!client.hello)destroyClient(client);
  },WS_HELLO_TIMEOUT_MS);
  client.helloTimer.unref?.();

  socket.on('data',chunk=>parseFrames(client,chunk));

  const cleanup=()=>{
    if(!clients.has(client.id))return;
    clients.delete(client.id);
    if(client.helloTimer){
      clearTimeout(client.helloTimer);
      client.helloTimer=null;
    }
    if(!client.hello)return;
    broadcast({type:'leave',id:client.id});
    broadcastRoster();
    console.log(`[leave] ${client.id} ${client.name}`);
  };

  socket.on('close',cleanup);
  socket.on('end',cleanup);
  socket.on('error',cleanup);
});

server.listen(PORT,HOST,()=>{
  console.log('World Drive V18K multiplayer');
  console.log(`WebSocket: ws://0.0.0.0:${PORT}`);
  console.log('LAN only by default; no accounts and no collision simulation.');
});