// World Drive V18J - dependency-free N-player LAN WebSocket relay.
// This server intentionally does NOT simulate vehicles or collisions.

import http from 'node:http';
import crypto from 'node:crypto';

const HOST='0.0.0.0';
const PORT=Number(process.env.WORLD_DRIVE_MP_PORT||8081);
const MAGIC='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients=new Map();
let nextId=1;

function frameText(text,opcode=0x1){
  const payload=Buffer.from(text,'utf8');
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

function safeState(client,message){
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
    speed:clamp(finite(message.speed),-100,150),
    vehicleId:String(message.vehicleId||client.vehicleId||'wrx').slice(0,32),
    steer:clamp(finite(message.steer),-1.2,1.2),
    braking:!!message.braking,

    // Skid geometry is never networked: just normalized visual slip state.
    onRoad:!!message.onRoad,
    skidFront:clamp(finite(message.skidFront),0,1),
    skidRear:clamp(finite(message.skidRear),0,1),

    // Presentation-only pose. The relay still performs no vehicle physics.
    bodyPitch:clamp(finite(message.bodyPitch),-1.2,1.2),
    bodyYaw:clamp(finite(message.bodyYaw),-.35,.35),
    bodyRoll:clamp(finite(message.bodyRoll),-1.2,1.2),
    bodyY:clamp(finite(message.bodyY),-2,2),
    wheelPitch:clamp(finite(message.wheelPitch),-1.2,1.2),
    wheelRoll:clamp(finite(message.wheelRoll),-1.2,1.2)
  };
}

function clamp(v,a,b){
  return Math.max(a,Math.min(b,v));
}

function handleMessage(client,message){
  if(!message||typeof message!=='object')return;

  if(message.type==='hello'){
    client.name=cleanName(message.name);
    client.vehicleId=String(message.vehicleId||'wrx').slice(0,32);
    client.hello=true;

    send(client,{
      type:'welcome',
      id:client.id,
      count:activeClientCount()
    });

    // Atomic snapshot: every existing driver's state remains keyed by peer id.
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

    // Force fresh states from existing drivers for the late joiner.
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

function parseFrames(client,chunk){
  client.buffer=Buffer.concat([client.buffer,chunk]);

  while(client.buffer.length>=2){
    const first=client.buffer[0];
    const second=client.buffer[1];
    const opcode=first&0x0f;
    const masked=(second&0x80)!==0;
    let length=second&0x7f;
    let offset=2;

    if(length===126){
      if(client.buffer.length<4)return;
      length=client.buffer.readUInt16BE(2);
      offset=4;
    }else if(length===127){
      if(client.buffer.length<10)return;
      const big=client.buffer.readBigUInt64BE(2);
      if(big>BigInt(1024*1024)){
        client.socket.destroy();
        return;
      }
      length=Number(big);
      offset=10;
    }

    let mask=null;
    if(masked){
      if(client.buffer.length<offset+4)return;
      mask=client.buffer.subarray(offset,offset+4);
      offset+=4;
    }

    if(client.buffer.length<offset+length)return;

    const payload=Buffer.from(
      client.buffer.subarray(offset,offset+length)
    );
    client.buffer=client.buffer.subarray(offset+length);

    if(mask){
      for(let i=0;i<payload.length;i++){
        payload[i]^=mask[i%4];
      }
    }

    if(opcode===0x8){
      client.socket.end(frameText('',0x8));
      return;
    }

    if(opcode===0x9){
      client.socket.write(frameText(payload.toString('utf8'),0xA));
      continue;
    }

    if(opcode!==0x1)continue;

    try{
      handleMessage(client,JSON.parse(payload.toString('utf8')));
    }catch{
      // Ignore malformed client messages.
    }
  }
}

const server=http.createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});
  res.end(
    `World Drive multiplayer relay\nPlayers: ${activeClientCount()}\n`
  );
});

server.on('upgrade',(req,socket)=>{
  const key=req.headers['sec-websocket-key'];
  const upgrade=String(req.headers.upgrade||'').toLowerCase();

  if(!key||upgrade!=='websocket'){
    socket.destroy();
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
    lastState:null
  };
  clients.set(client.id,client);

  socket.on('data',chunk=>parseFrames(client,chunk));

  const cleanup=()=>{
    if(!clients.has(client.id))return;
    clients.delete(client.id);
    broadcast({type:'leave',id:client.id});
    broadcastRoster();
    console.log(`[leave] ${client.id} ${client.name}`);
  };

  socket.on('close',cleanup);
  socket.on('end',cleanup);
  socket.on('error',cleanup);
});

server.listen(PORT,HOST,()=>{
  console.log('World Drive V18J multiplayer');
  console.log(`WebSocket: ws://0.0.0.0:${PORT}`);
  console.log('LAN only by default; no accounts and no collision simulation.');
});
