'use strict';

const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const os = require('node:os');

const MAGIC='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function clamp(v,a,b){
  return Math.max(a,Math.min(b,v));
}

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function cleanName(value){
  return String(value||'Conducteur')
    .replace(/[\u0000-\u001f\u007f]/g,'')
    .trim()
    .slice(0,24)||'Conducteur';
}

function sanitizePort(value,fallback=8081){
  const port=Math.floor(Number(value));
  if(!Number.isFinite(port)||port<1||port>65535)return fallback;
  return port;
}

function sanitizeRemoteHost(value){
  let host=String(value||'').trim();
  host=host.replace(/^wss?:\/\//i,'');
  host=host.split('/')[0].trim();

  // Bracketed IPv6 is intentionally not enabled yet. Keeping the first Windows
  // LAN implementation IPv4/hostname-only avoids ambiguous host:port parsing.
  if(!host||host.length>253||host.includes('[')||host.includes(']')){
    throw new Error('Adresse hôte invalide. Utilise une IPv4 ou un nom de PC.');
  }

  // Strip one trailing :port if the renderer passed it accidentally; the IPC
  // port argument remains authoritative.
  const colonCount=(host.match(/:/g)||[]).length;
  if(colonCount===1){
    const match=host.match(/^(.*):(\d{1,5})$/);
    if(match)host=match[1];
  }

  if(!/^[A-Za-z0-9._-]+$/.test(host)){
    throw new Error('Adresse hôte invalide. Utilise une IPv4 ou un nom de PC.');
  }

  return host;
}

function getLanIPv4Addresses(){
  const found=[];
  const interfaces=os.networkInterfaces();

  for(const entries of Object.values(interfaces)){
    for(const item of entries||[]){
      if(!item||item.internal)continue;
      const family=typeof item.family==='string'?item.family:String(item.family);
      if(family!=='IPv4'&&family!=='4')continue;
      if(!found.includes(item.address))found.push(item.address);
    }
  }

  const isPrivate=address=>
    /^10\./.test(address)||
    /^192\.168\./.test(address)||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address);

  return found.sort((a,b)=>Number(isPrivate(b))-Number(isPrivate(a)));
}

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

function createRelayService({port=8081,host='0.0.0.0'}={}){
  port=sanitizePort(port,8081);
  const clients=new Map();
  const rawSockets=new Set();
  let nextId=1;
  let server=null;

  function send(client,message){
    if(!client||client.socket.destroyed)return;
    try{
      client.socket.write(frameText(JSON.stringify(message)));
    }catch(error){
      console.warn('World Drive multiplayer send failed',client.id,error?.message||error);
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
    broadcast({type:'roster',count:activeClientCount()});
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

      // Keep the packaged Electron relay on the exact same M2/M2.4 state
      // contract as server/multiplayer-server.mjs.
      velocityHeading:finite(message.velocityHeading,message.heading),
      longitudinalAccel:clamp(finite(message.longitudinalAccel),-20,15),

      speed:clamp(finite(message.speed),-100,150),
      vehicleId:String(message.vehicleId||client.vehicleId||'wrx').slice(0,32),
      steer:clamp(finite(message.steer),-1.2,1.2),
      braking:!!message.braking,
      reversing:!!message.reversing,
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
      wheelRoll:clamp(finite(message.wheelRoll),-1.2,1.2)
    };
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

      const states=[];
      for(const other of clients.values()){
        if(other.id===client.id||!other.hello||!other.lastState)continue;
        states.push(other.lastState);
      }
      send(client,{type:'snapshot',states});

      broadcast({type:'refresh-state',joinedId:client.id},client.id);
      broadcastRoster();
      console.log(`[World Drive MP join] ${client.id} ${client.name}`);
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

      const payload=Buffer.from(client.buffer.subarray(offset,offset+length));
      client.buffer=client.buffer.subarray(offset+length);

      if(mask){
        for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];
      }

      if(opcode===0x8){
        try{client.socket.end(frameText('',0x8));}catch{}
        return;
      }

      if(opcode===0x9){
        try{client.socket.write(frameText(payload.toString('utf8'),0xA));}catch{}
        continue;
      }

      if(opcode!==0x1)continue;

      try{
        handleMessage(client,JSON.parse(payload.toString('utf8')));
      }catch{
        // Malformed client frames are ignored rather than taking down the relay.
      }
    }
  }

  async function start(){
    if(server)return;

    server=http.createServer((req,res)=>{
      res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});
      res.end(`World Drive multiplayer relay\nPlayers: ${activeClientCount()}\n`);
    });

    server.on('connection',socket=>{
      rawSockets.add(socket);
      socket.on('close',()=>rawSockets.delete(socket));
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
        console.log(`[World Drive MP leave] ${client.id} ${client.name}`);
      };

      socket.on('close',cleanup);
      socket.on('end',cleanup);
      socket.on('error',cleanup);
    });

    await new Promise((resolve,reject)=>{
      const onError=error=>{
        server?.off('listening',onListening);
        reject(error);
      };
      const onListening=()=>{
        server?.off('error',onError);
        resolve();
      };
      server.once('error',onError);
      server.once('listening',onListening);
      server.listen(port,host);
    });
  }

  async function stop(){
    if(!server)return;

    for(const client of clients.values()){
      try{client.socket.destroy();}catch{}
    }
    clients.clear();

    for(const socket of rawSockets){
      try{socket.destroy();}catch{}
    }
    rawSockets.clear();

    const closing=server;
    server=null;
    await new Promise(resolve=>{
      try{closing.close(()=>resolve());}catch{resolve();}
    });
  }

  return {
    start,
    stop,
    getPort:()=>port,
    getPlayerCount:()=>activeClientCount()
  };
}

function createProxyService({remoteHost,remotePort=8081,localPort=8081}={}){
  remoteHost=sanitizeRemoteHost(remoteHost);
  remotePort=sanitizePort(remotePort,8081);
  localPort=sanitizePort(localPort,8081);

  let server=null;
  const sockets=new Set();

  async function start(){
    if(server)return;

    server=net.createServer(localSocket=>{
      sockets.add(localSocket);
      localSocket.setNoDelay(true);

      const remoteSocket=net.createConnection({
        host:remoteHost,
        port:remotePort
      });
      sockets.add(remoteSocket);
      remoteSocket.setNoDelay(true);

      const cleanup=()=>{
        sockets.delete(localSocket);
        sockets.delete(remoteSocket);
      };

      localSocket.on('close',cleanup);
      remoteSocket.on('close',cleanup);
      localSocket.on('error',()=>{
        try{remoteSocket.destroy();}catch{}
      });
      remoteSocket.on('error',()=>{
        try{localSocket.destroy();}catch{}
      });

      localSocket.pipe(remoteSocket);
      remoteSocket.pipe(localSocket);
    });

    await new Promise((resolve,reject)=>{
      const onError=error=>{
        server?.off('listening',onListening);
        reject(error);
      };
      const onListening=()=>{
        server?.off('error',onError);
        resolve();
      };
      server.once('error',onError);
      server.once('listening',onListening);
      server.listen(localPort,'127.0.0.1');
    });
  }

  async function stop(){
    for(const socket of sockets){
      try{socket.destroy();}catch{}
    }
    sockets.clear();

    if(!server)return;
    const closing=server;
    server=null;
    await new Promise(resolve=>{
      try{closing.close(()=>resolve());}catch{resolve();}
    });
  }

  return {
    start,
    stop,
    getRemoteHost:()=>remoteHost,
    getRemotePort:()=>remotePort,
    getLocalPort:()=>localPort
  };
}

function createMultiplayerRuntime(){
  let mode='off';
  let service=null;
  let port=8081;
  let remoteHost=null;
  let remotePort=null;
  let lastError=null;

  async function stop(){
    if(service){
      try{await service.stop();}catch(error){
        console.warn('World Drive multiplayer stop failed',error);
      }
    }
    service=null;
    mode='off';
    remoteHost=null;
    remotePort=null;
    lastError=null;
    return status();
  }

  function status(){
    const addresses=getLanIPv4Addresses();
    return {
      ok:!lastError,
      mode,
      port,
      remoteHost,
      remotePort,
      localUrl:`ws://127.0.0.1:${port}`,
      lanAddresses:addresses,
      lanUrls:mode==='host'?addresses.map(address=>`ws://${address}:${port}`):[],
      playerCount:mode==='host'&&service?.getPlayerCount?service.getPlayerCount():null,
      error:lastError?String(lastError.message||lastError):null
    };
  }

  async function hostSession(options={}){
    await stop();
    port=sanitizePort(options.port,8081);

    try{
      service=createRelayService({port,host:'0.0.0.0'});
      await service.start();
      mode='host';
      lastError=null;
      return status();
    }catch(error){
      service=null;
      mode='off';
      lastError=error;
      const result=status();
      result.ok=false;
      return result;
    }
  }

  async function joinSession(options={}){
    await stop();

    try{
      remoteHost=sanitizeRemoteHost(options.host);
      remotePort=sanitizePort(options.port,8081);
      port=sanitizePort(options.localPort,8081);
      service=createProxyService({
        remoteHost,
        remotePort,
        localPort:port
      });
      await service.start();
      mode='join';
      lastError=null;
      return status();
    }catch(error){
      service=null;
      mode='off';
      lastError=error;
      const result=status();
      result.ok=false;
      return result;
    }
  }

  return {
    hostSession,
    joinSession,
    stop,
    status
  };
}

module.exports={
  createMultiplayerRuntime,
  getLanIPv4Addresses,
  sanitizeRemoteHost,
  sanitizePort
};
