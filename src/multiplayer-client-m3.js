import {readTransmissionRuntimeState} from './transmission-runtime-bridge.js';
import {getMultiplayerVehicleSpec} from './multiplayer-vehicle-registry.js';

// Multiplayer M4.1 client: presentation-only N-player LAN replication at 30 Hz.
// Network state is normalized once, then the remote visual adapter feeds the
// exact same authored controller used by a local vehicle. Transmission gear is
// explicit protocol data; reverse lamps derive from gear < 0 on the receiver.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const GEO_EARTH=6378137;
const DEG_TO_RAD=Math.PI/180;
const INTERPOLATION_DELAY_MS=110;
const MAX_EXTRAPOLATION_MS=105;
const SNAPSHOT_HISTORY_MS=900;
const NETWORK_STATE_HZ=30;
const NETWORK_STATE_INTERVAL_MS=1000/NETWORK_STATE_HZ;
const TURN_SIGNAL_ACTIVATION_RAD=.318;
const TURN_SIGNAL_NEUTRAL_RAD=.045;
const TURN_SIGNAL_PERIOD_SEC=1.05;
const TURN_SIGNAL_ON_SEC=.58;

function finite(value,fallback=0){return Number.isFinite(Number(value))?Number(value):fallback;}
function boolOr(value,fallback=false){return typeof value==='boolean'?value:!!fallback;}
function angleDelta(a,b){return Math.atan2(Math.sin((Number(a)||0)-(Number(b)||0)),Math.cos((Number(a)||0)-(Number(b)||0)));}
function angleLerp(a,b,t){return (Number(a)||0)+angleDelta(b,a)*t;}
function normalizeGear(value,fallback=null){
  const n=Number(value);
  if(Number.isFinite(n))return n<0?-1:n===0?0:Math.max(1,Math.floor(n));
  const f=Number(fallback);
  if(Number.isFinite(f))return f<0?-1:f===0?0:Math.max(1,Math.floor(f));
  return null;
}
function reverseFromGear(gear,fallback=false){
  return gear!==null&&Number.isFinite(Number(gear))?Number(gear)<0:!!fallback;
}

function geographicOffsetMeters(fromLat,fromLon,toLat,toLon){
  const dLat=(toLat-fromLat)*DEG_TO_RAD;
  let dLon=(toLon-fromLon)*DEG_TO_RAD;if(dLon>Math.PI)dLon-=Math.PI*2;else if(dLon<-Math.PI)dLon+=Math.PI*2;
  const midLat=(fromLat+toLat)*.5*DEG_TO_RAD;
  return {x:dLon*GEO_EARTH*Math.cos(midLat),z:-dLat*GEO_EARTH};
}
function offsetLatLonMeters(lat,lon,x,z){
  const cosLat=Math.max(.15,Math.cos(lat*DEG_TO_RAD));
  return {lat:lat-(z/GEO_EARTH)/DEG_TO_RAD,lon:lon+(x/(GEO_EARTH*cosLat))/DEG_TO_RAD};
}
function motionHeading(snapshot){
  if(Number.isFinite(snapshot?.velocityHeading))return snapshot.velocityHeading;
  const heading=finite(snapshot?.heading,0);return finite(snapshot?.speed,0)<0?heading+Math.PI:heading;
}
function motionSpeed(snapshot){return Math.abs(finite(snapshot?.speed,0));}
function motionVector(snapshot){const h=motionHeading(snapshot),v=motionSpeed(snapshot);return{x:Math.sin(h)*v,z:Math.cos(h)*v};}

function snapshotFromMessage(message,peer,receivedAt){
  const gear=normalizeGear(message.gear,peer.gear);
  return {
    receivedAt,
    seq:Math.max(0,Math.floor(finite(message.seq,0))),
    vehicleId:message.vehicleId||peer.vehicleId||'wrx',
    lat:finite(message.lat,peer.lat),lon:finite(message.lon,peer.lon),y:finite(message.y,peer.y),
    heading:finite(message.heading,peer.heading),velocityHeading:finite(message.velocityHeading,peer.velocityHeading),
    steer:finite(message.steer,peer.steer),speed:finite(message.speed,peer.speed),longitudinalAccel:finite(message.longitudinalAccel,peer.longitudinalAccel),
    gear,
    braking:boolOr(message.braking,peer.braking),reversing:reverseFromGear(gear,boolOr(message.reversing,peer.reversing)),
    nightLevel:Number.isFinite(Number(message.nightLevel))?clamp(Number(message.nightLevel),0,1):peer.nightLevel,
    signalLeft:boolOr(message.signalLeft,peer.signalLeft),signalRight:boolOr(message.signalRight,peer.signalRight),signalBlink:boolOr(message.signalBlink,peer.signalBlink),
    lightingProtocol:message.lightingProtocol==='m2.4'?'m2.4':peer.lightingProtocol,
    onRoad:boolOr(message.onRoad,peer.onRoad),skidFront:clamp(finite(message.skidFront,peer.skidFront),0,1),skidRear:clamp(finite(message.skidRear,peer.skidRear),0,1),
    bodyPitch:finite(message.bodyPitch,peer.bodyPitch),bodyYaw:finite(message.bodyYaw,peer.bodyYaw),bodyRoll:finite(message.bodyRoll,peer.bodyRoll),bodyY:finite(message.bodyY,peer.bodyY),
    wheelPitch:finite(message.wheelPitch,peer.wheelPitch),wheelRoll:finite(message.wheelRoll,peer.wheelRoll)
  };
}

function interpolateGeographic(a,b,t,spanMs){
  const spanSec=Math.max(.001,Math.min(.25,spanMs/1000)),delta=geographicOffsetMeters(a.lat,a.lon,b.lat,b.lon),direct=Math.hypot(delta.x,delta.z),va=motionVector(a),vb=motionVector(b);
  const expected=(motionSpeed(a)+motionSpeed(b))*.5*spanSec,continuityLimit=Math.max(10,expected*3.5+4);
  if(direct>continuityLimit)return{lat:lerp(a.lat,b.lat,t),lon:lerp(a.lon,b.lon,t)};
  const t2=t*t,t3=t2*t,h10=t3-2*t2+t,h01=-2*t3+3*t2,h11=t3-t2;
  return offsetLatLonMeters(a.lat,a.lon,h10*va.x*spanSec+h01*delta.x+h11*vb.x*spanSec,h10*va.z*spanSec+h01*delta.z+h11*vb.z*spanSec);
}
function interpolateSnapshot(a,b,t,spanMs){
  const poseT=t*t*(3-2*t),geo=interpolateGeographic(a,b,t,spanMs),discrete=t<.5?a:b;
  return {
    ...discrete,
    lat:geo.lat,lon:geo.lon,y:lerp(a.y,b.y,poseT),heading:angleLerp(a.heading,b.heading,t),velocityHeading:angleLerp(motionHeading(a),motionHeading(b),t),
    steer:lerp(a.steer,b.steer,poseT),speed:lerp(a.speed,b.speed,t),longitudinalAccel:lerp(finite(a.longitudinalAccel,0),finite(b.longitudinalAccel,0),poseT),
    vehicleId:b.vehicleId||a.vehicleId,nightLevel:lerp(finite(a.nightLevel,0),finite(b.nightLevel,0),poseT),
    skidFront:lerp(a.skidFront,b.skidFront,poseT),skidRear:lerp(a.skidRear,b.skidRear,poseT),
    bodyPitch:lerp(a.bodyPitch,b.bodyPitch,poseT),bodyYaw:angleLerp(a.bodyYaw,b.bodyYaw,poseT),bodyRoll:lerp(a.bodyRoll,b.bodyRoll,poseT),bodyY:lerp(a.bodyY,b.bodyY,poseT),
    wheelPitch:lerp(a.wheelPitch,b.wheelPitch,poseT),wheelRoll:lerp(a.wheelRoll,b.wheelRoll,poseT)
  };
}
function extrapolateSnapshot(snapshot,aheadMs){
  const dt=Math.max(0,Math.min(MAX_EXTRAPOLATION_MS,aheadMs))/1000;if(dt<=0)return snapshot;
  const speed0=motionSpeed(snapshot),accel=clamp(finite(snapshot.longitudinalAccel,0),-12,8),distance=Math.max(0,speed0*dt+.5*accel*dt*dt);
  const wheelbase=Math.max(.5,finite(getMultiplayerVehicleSpec(snapshot.vehicleId).physics.wheelbase,2.70));
  const steer=clamp(finite(snapshot.steer,0),-.62,.62),yawRate=clamp(speed0/wheelbase*Math.tan(steer),-2.6,2.6);
  const startTravel=motionHeading(snapshot),slip=Math.abs(angleDelta(startTravel,finite(snapshot.heading,0))),travelFactor=clamp(1-slip/1.10,.28,1),travelMid=startTravel+yawRate*dt*travelFactor*.5;
  const geo=offsetLatLonMeters(snapshot.lat,snapshot.lon,Math.sin(travelMid)*distance,Math.cos(travelMid)*distance);
  return {...snapshot,lat:geo.lat,lon:geo.lon,heading:finite(snapshot.heading,0)+yawRate*dt,velocityHeading:startTravel+yawRate*dt*travelFactor,speed:Math.sign(finite(snapshot.speed,1)||1)*Math.max(0,speed0+accel*dt)};
}
function samplePeer(peer,renderAt){
  const list=peer.snapshots;if(!list.length)return null;
  while(list.length>2&&list[1].receivedAt<=renderAt)list.shift();
  const a=list[0];if(renderAt<=a.receivedAt)return a;
  if(list.length>=2){const b=list[1];if(renderAt<=b.receivedAt){const span=Math.max(1,b.receivedAt-a.receivedAt);return interpolateSnapshot(a,b,clamp((renderAt-a.receivedAt)/span,0,1),span);}}
  const latest=list[list.length-1];return extrapolateSnapshot(latest,renderAt-latest.receivedAt);
}

export function createMultiplayerClient({
  scene,latLonToWorld,getWorldOffset,getLocalState,createRemoteVisual,getLocalRenderPosition,solveRemoteSupport,getHeadlightLevel=()=>0,
  onRemoteSkidFrame=null,onRemotePeerRemoved=null,statusEl=null,countEl=null,serverEl=null,nameInput=null,toggleButton=null,toast=()=>{}
}={}){
  let socket=null,ownId=null,nextSendAt=0,manuallyClosed=false,cachedName='Conducteur',localSequence=0,lastLocalMotion=null;
  let localSignalLeft=false,localSignalRight=false,localSignalTimer=0,localSignalLastAt=performance.now();
  const peers=new Map();
  const defaultUrl=()=>`${location.protocol==='https:'?'wss':'ws'}://${location.hostname}:8081`;

  function updateCount(count=null){
    if(!countEl)return;if(Number.isFinite(count)){countEl.textContent=String(count);return;}
    countEl.textContent=String(peers.size+(socket?.readyState===WebSocket.OPEN?1:0));
  }
  function setStatus(text,state='off'){
    if(statusEl){statusEl.textContent=text;statusEl.dataset.state=state;}if(serverEl)serverEl.textContent=defaultUrl();
    if(toggleButton){const connected=socket?.readyState===WebSocket.OPEN,connecting=socket?.readyState===WebSocket.CONNECTING;toggleButton.textContent=connected?'Déconnecter':(connecting?'Connexion…':'Connecter');toggleButton.disabled=!!connecting;}
    updateCount();
  }
  function refreshName(){cachedName=(nameInput?.value||cachedName||'Conducteur').trim().slice(0,24)||'Conducteur';if(nameInput)nameInput.value=cachedName;localStorage.setItem('worlddrive_multiplayer_name',cachedName);return cachedName;}
  function resetSignals(){localSignalLeft=false;localSignalRight=false;localSignalTimer=0;localSignalLastAt=performance.now();}
  function localLightingState(state,now){
    const runtime=readTransmissionRuntimeState?.()||{};
    // M4.1: gear is explicit protocol state. Prefer a future caller-provided
    // full gear number, otherwise use the authoritative local D/N/R selector.
    const gear=normalizeGear(state.gear,runtime.selectorGear);
    const braking=Number.isFinite(Number(runtime.serviceBrake))
      ?(Number(runtime.serviceBrake)||0)>.04
      :!!state.braking;
    const reversing=reverseFromGear(gear,boolOr(state.reversing,finite(state.speed,0)<-.08));
    const nightLevel=Number.isFinite(Number(state.nightLevel))?clamp(Number(state.nightLevel),0,1):clamp(Number(getHeadlightLevel?.())||0,0,1);

    if(typeof state.signalLeft==='boolean'&&typeof state.signalRight==='boolean'&&typeof state.signalBlink==='boolean'){
      return {gear,braking,reversing,nightLevel,signalLeft:state.signalLeft,signalRight:state.signalRight,signalBlink:state.signalBlink,lightingProtocol:'m2.4'};
    }

    const dt=Math.max(.001,Math.min(.05,(now-localSignalLastAt)/1000));localSignalLastAt=now;
    const steer=finite(state.steer,0),abs=Math.abs(steer),stopped=Math.abs(finite(state.speed,0))<.35;
    if(abs<=TURN_SIGNAL_NEUTRAL_RAD){localSignalLeft=false;localSignalRight=false;localSignalTimer=0;}
    else if(!localSignalLeft&&!localSignalRight&&stopped&&abs>=TURN_SIGNAL_ACTIVATION_RAD){localSignalLeft=steer<0;localSignalRight=steer>0;localSignalTimer=0;}
    if(localSignalLeft||localSignalRight)localSignalTimer+=dt;
    return {gear,braking,reversing,nightLevel,signalLeft:localSignalLeft,signalRight:localSignalRight,signalBlink:(localSignalLeft||localSignalRight)&&((localSignalTimer%TURN_SIGNAL_PERIOD_SEC)<TURN_SIGNAL_ON_SEC),lightingProtocol:'m2.4'};
  }

  function replaceVisual(peer,vehicleId){
    if(peer.visual){scene.remove(peer.visual.root);peer.visual.dispose?.();}
    peer.vehicleId=vehicleId||'wrx';
    peer.visual=createRemoteVisual?.(peer.vehicleId,peer.name||'Conducteur')||null;
    if(!peer.visual?.root){console.warn(`Remote visual unavailable for ${peer.vehicleId}`);peer.visual=null;return;}
    scene.add(peer.visual.root);
  }
  function ensurePeer(message){
    if(!message.id||message.id===ownId)return null;
    let peer=peers.get(message.id);if(peer)return peer;
    const speed=finite(message.speed,0),heading=finite(message.heading,0),gear=normalizeGear(message.gear,null);
    peer={
      id:message.id,name:String(message.name||'Conducteur').slice(0,24),vehicleId:message.vehicleId||'wrx',lat:finite(message.lat,0),lon:finite(message.lon,0),y:finite(message.y,0),renderY:null,
      heading,velocityHeading:Number.isFinite(Number(message.velocityHeading))?Number(message.velocityHeading):(speed<0?heading+Math.PI:heading),steer:finite(message.steer,0),speed,longitudinalAccel:finite(message.longitudinalAccel,0),
      gear,
      braking:!!message.braking,reversing:reverseFromGear(gear,boolOr(message.reversing,speed<-.08)),nightLevel:Number.isFinite(Number(message.nightLevel))?clamp(Number(message.nightLevel),0,1):NaN,
      signalLeft:!!message.signalLeft,signalRight:!!message.signalRight,signalBlink:!!message.signalBlink,lightingProtocol:message.lightingProtocol==='m2.4'?'m2.4':null,
      onRoad:!!message.onRoad,skidFront:clamp(finite(message.skidFront,0),0,1),skidRear:clamp(finite(message.skidRear,0),0,1),
      bodyPitch:finite(message.bodyPitch,0),bodyYaw:finite(message.bodyYaw,0),bodyRoll:finite(message.bodyRoll,0),bodyY:finite(message.bodyY,0),wheelPitch:finite(message.wheelPitch,0),wheelRoll:finite(message.wheelRoll,0),
      snapshots:[],lastSeq:0,lastSeen:performance.now(),wheelSpin:0,visual:null
    };
    replaceVisual(peer,peer.vehicleId);peers.set(peer.id,peer);updateCount();return peer;
  }
  function applyState(message){
    const peer=ensurePeer(message);if(!peer)return;
    const seq=Math.max(0,Math.floor(finite(message.seq,0)));if(seq>0&&peer.lastSeq>0&&seq<=peer.lastSeq)return;if(seq>0)peer.lastSeq=seq;
    const vehicleId=message.vehicleId||peer.vehicleId,name=String(message.name||peer.name).slice(0,24);
    if(vehicleId!==peer.vehicleId||name!==peer.name){peer.name=name;replaceVisual(peer,vehicleId);peer.snapshots.length=0;peer.renderY=null;}
    const receivedAt=performance.now();peer.snapshots.push(snapshotFromMessage(message,peer,receivedAt));
    while(peer.snapshots.length>2&&peer.snapshots[0].receivedAt<receivedAt-SNAPSHOT_HISTORY_MS)peer.snapshots.shift();
    peer.lastSeen=receivedAt;
  }
  function removePeer(id){const peer=peers.get(id);if(!peer)return;if(peer.visual){scene.remove(peer.visual.root);peer.visual.dispose?.();}onRemotePeerRemoved?.(id);peers.delete(id);updateCount();}
  function clearPeers(){for(const id of [...peers.keys()])removePeer(id);}
  function send(payload){if(socket?.readyState!==WebSocket.OPEN)return;try{socket.send(JSON.stringify(payload));}catch(error){console.warn('Multiplayer send failed',error);}}

  function estimateLocalMotion(state,now){
    const fallback=finite(state.speed,0)<0?finite(state.heading,0)+Math.PI:finite(state.heading,0);let velocityHeading=fallback,longitudinalAccel=0;
    if(lastLocalMotion&&Number.isFinite(Number(state.lat))&&Number.isFinite(Number(state.lon))){
      const dt=Math.max(.015,Math.min(.20,(now-lastLocalMotion.at)/1000)),delta=geographicOffsetMeters(lastLocalMotion.lat,lastLocalMotion.lon,state.lat,state.lon),travelled=Math.hypot(delta.x,delta.z);
      if(travelled>.035)velocityHeading=Math.atan2(delta.x,delta.z);else if(Number.isFinite(lastLocalMotion.velocityHeading))velocityHeading=lastLocalMotion.velocityHeading;
      longitudinalAccel=clamp((Math.abs(finite(state.speed,0))-Math.abs(lastLocalMotion.speed))/dt,-12,8);
    }
    lastLocalMotion={at:now,lat:state.lat,lon:state.lon,speed:finite(state.speed,0),velocityHeading};return{velocityHeading,longitudinalAccel};
  }
  function sendLocalState(){
    const state=getLocalState?.();if(!state)return;const now=performance.now(),motion=estimateLocalMotion(state,now),lighting=localLightingState(state,now);
    send({type:'state',seq:++localSequence,name:cachedName,lat:state.lat,lon:state.lon,y:state.y,heading:state.heading,velocityHeading:motion.velocityHeading,speed:state.speed,longitudinalAccel:motion.longitudinalAccel,vehicleId:state.vehicleId,steer:state.steer,
      gear:lighting.gear,
      braking:lighting.braking,reversing:lighting.reversing,nightLevel:lighting.nightLevel,signalLeft:lighting.signalLeft,signalRight:lighting.signalRight,signalBlink:lighting.signalBlink,lightingProtocol:lighting.lightingProtocol,
      onRoad:state.onRoad,skidFront:state.skidFront,skidRear:state.skidRear,bodyPitch:state.bodyPitch,bodyYaw:state.bodyYaw,bodyRoll:state.bodyRoll,bodyY:state.bodyY,wheelPitch:state.wheelPitch,wheelRoll:state.wheelRoll});
  }

  function connect(){
    if(socket&&(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING))return;
    manuallyClosed=false;localSequence=0;lastLocalMotion=null;resetSignals();setStatus('Connexion…','connecting');
    try{socket=new WebSocket(defaultUrl());}catch(error){console.warn('Multiplayer WebSocket failed',error);setStatus('Indisponible','error');return;}
    socket.addEventListener('open',()=>{send({type:'hello',name:refreshName(),vehicleId:getLocalState?.()?.vehicleId||'wrx'});setStatus('Connecté','on');toast('Multijoueur LAN connecté');});
    socket.addEventListener('message',event=>{
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(message.type==='welcome'){ownId=message.id;updateCount(message.count);}
      else if(message.type==='snapshot'){for(const state of message.states||[])applyState(state);}
      else if(message.type==='refresh-state')sendLocalState();
      else if(message.type==='state')applyState(message);
      else if(message.type==='leave')removePeer(message.id);
      else if(message.type==='roster')updateCount(message.count);
    });
    socket.addEventListener('close',()=>{socket=null;ownId=null;lastLocalMotion=null;resetSignals();clearPeers();setStatus(manuallyClosed?'Déconnecté':'Serveur perdu',manuallyClosed?'off':'error');if(!manuallyClosed)toast('Connexion multijoueur perdue');});
    socket.addEventListener('error',()=>setStatus('Erreur réseau','error'));
  }
  function disconnect(){manuallyClosed=true;lastLocalMotion=null;resetSignals();if(socket)try{socket.close(1000,'client disconnect');}catch{}socket=null;ownId=null;clearPeers();setStatus('Déconnecté','off');}
  function toggle(){if(socket?.readyState===WebSocket.OPEN)disconnect();else connect();}

  function update(dt){
    const now=performance.now();if(socket?.readyState===WebSocket.OPEN&&now>=nextSendAt){nextSendAt=now+NETWORK_STATE_INTERVAL_MS;sendLocalState();}
    const localState=getLocalState?.(),localRender=getLocalRenderPosition?.(),offset=getWorldOffset?.(),renderAt=now-INTERPOLATION_DELAY_MS;
    for(const peer of peers.values()){
      const sampled=samplePeer(peer,renderAt);if(sampled)Object.assign(peer,sampled);
      if(!peer.visual?.root)continue;
      const peerAbs=latLonToWorld(peer.lat,peer.lon);
      let rx,rz,relativeD2;
      if(localState&&localRender&&Number.isFinite(Number(localState.lat))&&Number.isFinite(Number(localState.lon))&&Number.isFinite(Number(localRender.x))&&Number.isFinite(Number(localRender.z))){
        const delta=geographicOffsetMeters(localState.lat,localState.lon,peer.lat,peer.lon);rx=localRender.x+delta.x;rz=localRender.z+delta.z;relativeD2=delta.x*delta.x+delta.z*delta.z;
      }else{
        rx=peerAbs.x-(offset?.x||0);rz=peerAbs.z-(offset?.z||0);
        const localAbs=localState&&Number.isFinite(Number(localState.lat))&&Number.isFinite(Number(localState.lon))?latLonToWorld(localState.lat,localState.lon):{x:0,z:0};
        const dx=peerAbs.x-localAbs.x,dz=peerAbs.z-localAbs.z;relativeD2=dx*dx+dz*dz;
      }
      const visible=relativeD2<3200*3200;peer.visual.root.visible=visible;
      if(!visible){
        peer.visual.setRemoteVisible?.(false,{absX:peerAbs.x,absZ:peerAbs.z,heading:peer.heading,renderX:rx,renderZ:rz});
        peer.visual.setLighting?.({braking:false,reversing:false,nightLevel:0,signalLeft:false,signalRight:false,signalBlink:false,distance:Infinity});
        onRemoteSkidFrame?.({id:peer.id,onRoad:false,skidFront:0,skidRear:0,contacts:[],distance:Infinity});continue;
      }

      const support=solveRemoteSupport?.({lat:peer.lat,lon:peer.lon,heading:peer.heading,visual:peer.visual})||null;
      const supportY=Number.isFinite(support?.rootY)?support.rootY:peer.y;
      if(!Number.isFinite(peer.renderY))peer.renderY=supportY;else peer.renderY=lerp(peer.renderY,supportY,1-Math.exp(-dt*18));
      peer.visual.root.position.set(rx,peer.renderY,rz);peer.visual.root.rotation.y=peer.heading;
      const wheelPitch=Number.isFinite(support?.wheelPitch)?support.wheelPitch:peer.wheelPitch,wheelRoll=Number.isFinite(support?.wheelRoll)?support.wheelRoll:peer.wheelRoll;
      if(peer.visual.bodyGroup){
        peer.visual.bodyGroup.position.y=peer.bodyY;
        peer.visual.bodyGroup.rotation.set(peer.bodyPitch-(wheelPitch-peer.wheelPitch),peer.bodyYaw,peer.bodyRoll-(wheelRoll-peer.wheelRoll));
      }else{peer.visual.root.rotation.x=-wheelPitch;peer.visual.root.rotation.z=-wheelRoll;}

      for(let i=0;i<(peer.visual.wheels||[]).length;i++){
        const wheel=peer.visual.wheels[i],radius=Math.max(.1,finite(wheel.radius,.34));peer.wheelSpin-=peer.speed*dt/radius;
        if(wheel.tire)wheel.tire.rotation.x=peer.wheelSpin;if(wheel.rim)wheel.rim.rotation.x=peer.wheelSpin;
        const localY=support?.wheelLocalY?.[i];
        if(Number.isFinite(localY))wheel.pivot.position.y=localY;
        else{const x=Number.isFinite(wheel.baseX)?wheel.baseX:wheel.pivot.position.x,z=Number.isFinite(wheel.baseZ)?wheel.baseZ:wheel.pivot.position.z;wheel.pivot.position.y=-Math.tan(wheelPitch)*z-Math.tan(wheelRoll)*x;}
        wheel.pivot.rotation.y=wheel.front?peer.steer:0;wheel.pivot.rotation.z=-wheelRoll;
      }

      const distance=Math.sqrt(relativeD2),night=Number.isFinite(peer.nightLevel)?clamp(peer.nightLevel,0,1):clamp(Number(getHeadlightLevel?.())||0,0,1);
      const correctionX=Number(peer.visual.presentationCorrectionX)||0,correctionZ=Number(peer.visual.presentationCorrectionZ)||0;
      const remoteReversing=reverseFromGear(peer.gear,peer.reversing);
      const remoteState={
        absX:peerAbs.x,absZ:peerAbs.z,
        renderX:rx+correctionX,renderZ:rz+correctionZ,
        heading:peer.heading,speed:peer.speed,steerAngle:peer.steer,
        gear:peer.gear,
        braking:!!peer.braking,reversing:remoteReversing,nightLevel:night,
        signalLeft:!!peer.signalLeft,signalRight:!!peer.signalRight,signalBlink:!!peer.signalBlink,
        distance
      };
      peer.visual.setRemoteVisible?.(true,remoteState);
      peer.visual.setLighting?.(remoteState);
      peer.visual.updateRemoteVehicle?.(dt,remoteState);
      onRemoteSkidFrame?.({id:peer.id,onRoad:peer.onRoad,skidFront:peer.skidFront,skidRear:peer.skidRear,contacts:support?.wheelContacts||[],distance});
    }
  }

  function getPeers(){return [...peers.values()].map(peer=>({id:peer.id,name:peer.name,lat:peer.lat,lon:peer.lon,vehicleId:peer.vehicleId,speed:peer.speed,velocityHeading:peer.velocityHeading,longitudinalAccel:peer.longitudinalAccel,gear:peer.gear,braking:peer.braking,reversing:reverseFromGear(peer.gear,peer.reversing),nightLevel:peer.nightLevel,signalLeft:peer.signalLeft,signalRight:peer.signalRight,signalBlink:peer.signalBlink,lightingProtocol:peer.lightingProtocol}));}

  if(nameInput){nameInput.value=localStorage.getItem('worlddrive_multiplayer_name')||nameInput.value||'Conducteur';refreshName();nameInput.addEventListener('change',refreshName);}
  toggleButton?.addEventListener('click',toggle);addEventListener('beforeunload',()=>disconnect(),{once:true});setStatus('Déconnecté','off');
  return {connect,disconnect,toggle,update,getPeers,isConnected:()=>socket?.readyState===WebSocket.OPEN};
}

export const MULTIPLAYER_M3_DIAGNOSTICS=Object.freeze({networkHz:NETWORK_STATE_HZ,interpolationDelayMs:INTERPOLATION_DELAY_MS,maxExtrapolationMs:MAX_EXTRAPOLATION_MS,metrics:'multiplayer-vehicle-registry',visuals:'local-controller-adapter',reverseSource:'network-gear'});
