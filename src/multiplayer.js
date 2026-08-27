// World Drive V19.2 - curvature-aware buffered N-player LAN interpolation at 30 Hz.
// No remote physics/collisions: each peer only broadcasts presentation state.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;

function angleLerp(a,b,t){
  let d=(b-a)%(Math.PI*2);
  if(d>Math.PI)d-=Math.PI*2;
  if(d<-Math.PI)d+=Math.PI*2;
  return a+d*t;
}

function angleDeltaLocal(a,b){
  let d=(a-b)%(Math.PI*2);
  if(d>Math.PI)d-=Math.PI*2;
  if(d<-Math.PI)d+=Math.PI*2;
  return d;
}

// Route-origin-independent local tangent plane, in real metres.
// Multiplayer visuals are only drawn within ~3.2 km, where this is precise
// and avoids any dependence on each client's current route origin.
const GEO_EARTH=6378137;
const DEG_TO_RAD=Math.PI/180;
const VEHICLE_WHEELBASE=Object.freeze({
  id4:2.77,
  wrx:2.65,
  civic:2.70,
  sonata:2.80,
  i3_2017:2.57,
  f1_2010:3.15,
  countach_80:2.45,
  semi_6x4:4.10
});

function geographicOffsetMeters(
  fromLat,
  fromLon,
  toLat,
  toLon
){
  const dLat=(toLat-fromLat)*DEG_TO_RAD;

  let dLon=(toLon-fromLon)*DEG_TO_RAD;
  if(dLon>Math.PI)dLon-=Math.PI*2;
  else if(dLon<-Math.PI)dLon+=Math.PI*2;

  const midLat=(fromLat+toLat)*.5*DEG_TO_RAD;

  return {
    x:dLon*GEO_EARTH*Math.cos(midLat),
    z:-dLat*GEO_EARTH
  };
}

function offsetLatLonMeters(lat,lon,x,z){
  const cosLat=Math.max(.15,Math.cos(lat*DEG_TO_RAD));
  return {
    lat:lat-(z/GEO_EARTH)/DEG_TO_RAD,
    lon:lon+(x/(GEO_EARTH*cosLat))/DEG_TO_RAD
  };
}

function motionHeading(snapshot){
  if(Number.isFinite(snapshot?.velocityHeading))return snapshot.velocityHeading;
  const heading=Number(snapshot?.heading)||0;
  return Number(snapshot?.speed)<0?heading+Math.PI:heading;
}

function motionSpeed(snapshot){
  return Math.abs(Number(snapshot?.speed)||0);
}

function motionVector(snapshot){
  const heading=motionHeading(snapshot);
  const speed=motionSpeed(snapshot);
  return {
    x:Math.sin(heading)*speed,
    z:Math.cos(heading)*speed
  };
}

// Render remote cars slightly in the past so two real network snapshots are
// normally available to interpolate between. This absorbs LAN packet jitter
// instead of making the car chase the newest packet.
const INTERPOLATION_DELAY_MS=110;
const MAX_EXTRAPOLATION_MS=105;
const SNAPSHOT_HISTORY_MS=900;
const NETWORK_STATE_HZ=30;
const NETWORK_STATE_INTERVAL_MS=1000/NETWORK_STATE_HZ;

function finiteOr(value,fallback=0){
  return Number.isFinite(value)
    ?value
    :fallback;
}

function snapshotFromMessage(message,peer,receivedAt){
  return {
    receivedAt,
    seq:Number(message.seq)||0,
    vehicleId:message.vehicleId||peer.vehicleId||'wrx',

    lat:finiteOr(message.lat,peer.lat),
    lon:finiteOr(message.lon,peer.lon),
    y:finiteOr(message.y,peer.y),

    heading:finiteOr(message.heading,peer.heading),
    velocityHeading:finiteOr(message.velocityHeading,peer.velocityHeading),
    steer:finiteOr(message.steer,peer.steer),
    speed:finiteOr(message.speed,peer.speed),
    longitudinalAccel:finiteOr(message.longitudinalAccel,peer.longitudinalAccel),

    braking:!!message.braking,
    onRoad:
      typeof message.onRoad==='boolean'
        ?message.onRoad
        :peer.onRoad,

    skidFront:clamp(
      finiteOr(message.skidFront,peer.skidFront),
      0,
      1
    ),

    skidRear:clamp(
      finiteOr(message.skidRear,peer.skidRear),
      0,
      1
    ),

    bodyPitch:finiteOr(message.bodyPitch,peer.bodyPitch),
    bodyYaw:finiteOr(message.bodyYaw,peer.bodyYaw),
    bodyRoll:finiteOr(message.bodyRoll,peer.bodyRoll),
    bodyY:finiteOr(message.bodyY,peer.bodyY),
    wheelPitch:finiteOr(message.wheelPitch,peer.wheelPitch),
    wheelRoll:finiteOr(message.wheelRoll,peer.wheelRoll)
  };
}

function interpolateGeographic(a,b,t,spanMs){
  const spanSec=Math.max(.001,Math.min(.25,spanMs/1000));
  const delta=geographicOffsetMeters(a.lat,a.lon,b.lat,b.lon);
  const directDistance=Math.hypot(delta.x,delta.z);
  const va=motionVector(a);
  const vb=motionVector(b);

  // A packet after a teleport/reset should never create a giant Hermite arc.
  const expected=(motionSpeed(a)+motionSpeed(b))*.5*spanSec;
  const continuityLimit=Math.max(10,expected*3.5+4);
  if(directDistance>continuityLimit){
    return {
      lat:lerp(a.lat,b.lat,t),
      lon:lerp(a.lon,b.lon,t)
    };
  }

  const t2=t*t;
  const t3=t2*t;
  const h10=t3-2*t2+t;
  const h01=-2*t3+3*t2;
  const h11=t3-t2;

  const x=
    h10*va.x*spanSec+
    h01*delta.x+
    h11*vb.x*spanSec;

  const z=
    h10*va.z*spanSec+
    h01*delta.z+
    h11*vb.z*spanSec;

  return offsetLatLonMeters(a.lat,a.lon,x,z);
}

function interpolateSnapshot(a,b,t,spanMs){
  const poseT=t*t*(3-2*t);
  const geo=interpolateGeographic(a,b,t,spanMs);
  return {
    lat:geo.lat,
    lon:geo.lon,
    y:lerp(a.y,b.y,poseT),

    heading:angleLerp(a.heading,b.heading,t),
    velocityHeading:angleLerp(
      motionHeading(a),
      motionHeading(b),
      t
    ),
    steer:lerp(a.steer,b.steer,poseT),
    speed:lerp(a.speed,b.speed,t),
    longitudinalAccel:lerp(
      finiteOr(a.longitudinalAccel,0),
      finiteOr(b.longitudinalAccel,0),
      poseT
    ),
    vehicleId:b.vehicleId||a.vehicleId,

    braking:t<.5?a.braking:b.braking,
    onRoad:t<.5?a.onRoad:b.onRoad,

    skidFront:lerp(a.skidFront,b.skidFront,poseT),
    skidRear:lerp(a.skidRear,b.skidRear,poseT),

    bodyPitch:lerp(a.bodyPitch,b.bodyPitch,poseT),
    bodyYaw:angleLerp(a.bodyYaw,b.bodyYaw,poseT),
    bodyRoll:lerp(a.bodyRoll,b.bodyRoll,poseT),
    bodyY:lerp(a.bodyY,b.bodyY,poseT),
    wheelPitch:lerp(a.wheelPitch,b.wheelPitch,poseT),
    wheelRoll:lerp(a.wheelRoll,b.wheelRoll,poseT)
  };
}

function extrapolateSnapshot(snapshot,aheadMs){
  const dt=
    Math.max(
      0,
      Math.min(
        MAX_EXTRAPOLATION_MS,
        aheadMs
      )
    )/
    1000;

  if(dt<=0){
    return snapshot;
  }

  const speed0=motionSpeed(snapshot);
  const accel=clamp(
    finiteOr(snapshot.longitudinalAccel,0),
    -12,
    8
  );
  const distance=Math.max(0,speed0*dt+.5*accel*dt*dt);

  // Continue turning through a short packet gap instead of extrapolating every
  // car dead-straight. A bicycle-model yaw estimate is deliberately clamped;
  // this is prediction only and never remote physics authority.
  const wheelbase=
    VEHICLE_WHEELBASE[snapshot.vehicleId]||2.70;
  const steer=clamp(finiteOr(snapshot.steer,0),-.62,.62);
  const yawRate=clamp(
    speed0/wheelbase*Math.tan(steer),
    -2.6,
    2.6
  );

  const startTravel=motionHeading(snapshot);
  const slip=Math.abs(
    angleDeltaLocal(
      startTravel,
      finiteOr(snapshot.heading,0)
    )
  );
  const travelYawFactor=clamp(1-slip/1.10,.28,1);
  const travelMid=startTravel+yawRate*dt*travelYawFactor*.5;

  const dx=Math.sin(travelMid)*distance;
  const dz=Math.cos(travelMid)*distance;
  const geo=offsetLatLonMeters(snapshot.lat,snapshot.lon,dx,dz);

  return {
    ...snapshot,
    lat:geo.lat,
    lon:geo.lon,
    heading:finiteOr(snapshot.heading,0)+yawRate*dt,
    velocityHeading:startTravel+yawRate*dt*travelYawFactor,
    speed:
      Math.sign(Number(snapshot.speed)||1)*
      Math.max(0,speed0+accel*dt)
  };
}

function samplePeerSnapshot(peer,renderAt){
  const snapshots=peer.snapshots;

  if(!snapshots?.length){
    return null;
  }

  // Keep the snapshot immediately before renderAt plus all newer snapshots.
  while(
    snapshots.length>2&&
    snapshots[1].receivedAt<=renderAt
  ){
    snapshots.shift();
  }

  const first=snapshots[0];

  if(renderAt<=first.receivedAt){
    return first;
  }

  if(snapshots.length>=2){
    const second=snapshots[1];

    if(renderAt<=second.receivedAt){
      const span=
        Math.max(
          1,
          second.receivedAt-first.receivedAt
        );

      return interpolateSnapshot(
        first,
        second,
        clamp(
          (
            renderAt-first.receivedAt
          )/
          span,
          0,
          1
        ),
        span
      );
    }
  }

  const latest=
    snapshots[
      snapshots.length-1
    ];

  return extrapolateSnapshot(
    latest,
    renderAt-latest.receivedAt
  );
}

function makeLabelTexture(THREE,text){
  const canvas=document.createElement('canvas');
  canvas.width=512;
  canvas.height=128;
  const ctx=canvas.getContext('2d');

  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.font='700 52px system-ui, sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';

  const width=Math.min(
    480,
    Math.max(170,ctx.measureText(text).width+58)
  );
  const x=(canvas.width-width)/2;

  ctx.fillStyle='rgba(5,13,22,.84)';
  ctx.strokeStyle='rgba(228,241,255,.78)';
  ctx.lineWidth=4;
  ctx.beginPath();
  ctx.roundRect(x,20,width,88,22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle='#f6fbff';
  ctx.fillText(text,canvas.width/2,64);

  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.needsUpdate=true;
  return texture;
}

function makeWheel(THREE,radius=.34,width=.24){
  const tire=new THREE.Mesh(
    new THREE.CylinderGeometry(radius,radius,width,16),
    new THREE.MeshStandardMaterial({
      color:0x15191e,
      roughness:.90,
      metalness:.02
    })
  );
  tire.rotation.z=Math.PI/2;
  tire.castShadow=true;

  const rim=new THREE.Mesh(
    new THREE.CylinderGeometry(radius*.52,radius*.52,width+.012,12),
    new THREE.MeshStandardMaterial({
      color:0xaab2ba,
      roughness:.46,
      metalness:.70
    })
  );
  rim.rotation.z=Math.PI/2;
  tire.add(rim);

  const pivot=new THREE.Group();
  pivot.add(tire);
  return {pivot,tire,radius};
}

function createRemoteVehicleVisual(THREE,vehicleId,name){
  const root=new THREE.Group();
  root.name=`remote-${name}`;
  root.rotation.order='YXZ';

  const dark=new THREE.MeshStandardMaterial({
    color:0x121821,
    roughness:.65,
    metalness:.16
  });
  const glass=new THREE.MeshStandardMaterial({
    color:0x182d3d,
    roughness:.22,
    metalness:.15
  });

  const specs={
    id4:{color:0x3b6e91,w:1.82,l:4.58,h:.63,cabin:.68,wheelbase:2.76,r:.36},
    wrx:{color:0x2766a5,w:1.80,l:4.48,h:.48,cabin:.55,wheelbase:2.64,r:.35},
    civic:{color:0x101317,w:1.78,l:4.52,h:.47,cabin:.53,wheelbase:2.70,r:.34},
    sonata:{color:0xe9edf0,w:1.86,l:4.80,h:.48,cabin:.52,wheelbase:2.80,r:.35},
    i3_2017:{color:0xf0f1ee,w:1.78,l:4.00,h:.70,cabin:.78,wheelbase:2.57,r:.35},
    f1_2010:{color:0xc51f27,w:1.78,l:4.75,h:.20,cabin:.18,wheelbase:3.15,r:.32}
  };
  const s=specs[vehicleId]||specs.wrx;
  const bodyMat=new THREE.MeshStandardMaterial({
    color:s.color,
    roughness:.48,
    metalness:.18
  });

  const brakeBase=new THREE.Color(0x721018);
  const brakeHot=new THREE.Color(0xff2638);
  const brakeMat=new THREE.MeshBasicMaterial({color:brakeBase.clone()});
  const wheels=[];

  if(vehicleId==='f1_2010'){
    const tub=new THREE.Mesh(
      new THREE.BoxGeometry(.72,.27,3.55),
      bodyMat
    );
    tub.position.y=.46;
    tub.castShadow=true;
    root.add(tub);

    const nose=new THREE.Mesh(
      new THREE.BoxGeometry(.34,.15,1.38),
      bodyMat
    );
    nose.position.set(0,.42,2.23);
    root.add(nose);

    const cockpit=new THREE.Mesh(
      new THREE.BoxGeometry(.58,.30,.78),
      dark
    );
    cockpit.position.set(0,.67,-.25);
    root.add(cockpit);

    const frontWing=new THREE.Mesh(
      new THREE.BoxGeometry(1.78,.08,.34),
      bodyMat
    );
    frontWing.position.set(0,.24,2.48);
    root.add(frontWing);

    const rearWing=new THREE.Mesh(
      new THREE.BoxGeometry(1.58,.13,.28),
      dark
    );
    rearWing.position.set(0,.78,-2.02);
    root.add(rearWing);

    const lamp=new THREE.Mesh(
      new THREE.BoxGeometry(.18,.10,.07),
      brakeMat
    );
    lamp.position.set(0,.50,-2.08);
    root.add(lamp);

    const positions=[
      [-.77,.32,1.18,true],
      [.77,.32,1.18,true],
      [-.79,.34,-1.32,false],
      [.79,.34,-1.32,false]
    ];
    for(const [x,y,z,front] of positions){
      const wheel=makeWheel(THREE,s.r,.27);
      wheel.pivot.position.set(x,y,z);
      wheel.front=front;
      root.add(wheel.pivot);
      wheels.push(wheel);
    }
  }else{
    const body=new THREE.Mesh(
      new THREE.BoxGeometry(s.w,s.h,s.l),
      bodyMat
    );
    body.position.y=.54+s.h*.30;
    body.castShadow=true;
    root.add(body);

    const cabinLength=vehicleId==='i3_2017'?2.25:2.05;
    const cabin=new THREE.Mesh(
      new THREE.BoxGeometry(s.w*.78,s.cabin,cabinLength),
      glass
    );
    cabin.position.set(0,1.00+s.cabin*.18,-.18);
    cabin.castShadow=true;
    root.add(cabin);

    if(vehicleId==='i3_2017'){
      const blackRoof=new THREE.Mesh(
        new THREE.BoxGeometry(s.w*.74,.10,1.62),
        dark
      );
      blackRoof.position.set(0,1.46,-.25);
      root.add(blackRoof);
    }

    const rearLampGeom=new THREE.BoxGeometry(.40,.13,.06);
    for(const x of [-s.w*.30,s.w*.30]){
      const lamp=new THREE.Mesh(rearLampGeom,brakeMat);
      lamp.position.set(x,.74,-s.l*.505);
      root.add(lamp);
    }

    const halfWB=s.wheelbase*.5;
    const halfTrack=s.w*.44;
    const positions=[
      [-halfTrack,s.r,halfWB,true],
      [halfTrack,s.r,halfWB,true],
      [-halfTrack,s.r,-halfWB,false],
      [halfTrack,s.r,-halfWB,false]
    ];
    for(const [x,y,z,front] of positions){
      const wheel=makeWheel(THREE,s.r,.24);
      wheel.pivot.position.set(x,y,z);
      wheel.front=front;
      root.add(wheel.pivot);
      wheels.push(wheel);
    }
  }

  const tagMaterial=new THREE.SpriteMaterial({
    map:makeLabelTexture(THREE,name),
    transparent:true,
    depthTest:false,
    depthWrite:false
  });
  const tag=new THREE.Sprite(tagMaterial);
  tag.position.set(0,2.25,0);
  tag.scale.set(3.7,.92,1);
  tag.renderOrder=1000;
  root.add(tag);

  return {
    root,
    wheels,
    brakeMat,
    brakeBase,
    brakeHot,
    labelTexture:tagMaterial.map,
    dispose(){
      root.traverse(obj=>{
        if(obj.geometry)obj.geometry.dispose?.();
        if(obj.material){
          const mats=Array.isArray(obj.material)?obj.material:[obj.material];
          for(const mat of mats){
            if(mat.map&&mat.map!==tagMaterial.map)mat.map.dispose?.();
            mat.dispose?.();
          }
        }
      });
      tagMaterial.map.dispose?.();
    }
  };
}

export function createMultiplayerClient({
  THREE,
  scene,
  latLonToWorld,
  getWorldOffset,
  getLocalState,
  createRemoteVisual=null,
  getLocalRenderPosition=null,
  solveRemoteSupport=null,
  getHeadlightLevel=()=>0,
  onRemoteSkidFrame=null,
  onRemotePeerRemoved=null,
  statusEl=null,
  countEl=null,
  serverEl=null,
  nameInput=null,
  toggleButton=null,
  toast=()=>{}
}){
  let socket=null;
  let ownId=null;
  let nextSendAt=0;
  let manuallyClosed=false;
  let cachedName='Conducteur';
  let localSequence=0;
  let lastLocalMotion=null;
  const peers=new Map();

  const defaultUrl=()=>{
    const scheme=location.protocol==='https:'?'wss':'ws';
    return `${scheme}://${location.hostname}:8081`;
  };

  function setStatus(text,state='off'){
    if(statusEl){
      statusEl.textContent=text;
      statusEl.dataset.state=state;
    }
    if(serverEl)serverEl.textContent=defaultUrl();
    if(toggleButton){
      const connected=socket?.readyState===WebSocket.OPEN;
      const connecting=socket?.readyState===WebSocket.CONNECTING;
      toggleButton.textContent=connected?'Déconnecter':(connecting?'Connexion…':'Connecter');
      toggleButton.disabled=!!connecting;
    }
    updateCount();
  }

  function updateCount(count=null){
    if(!countEl)return;
    if(Number.isFinite(count)){
      countEl.textContent=String(count);
      return;
    }
    const connected=socket?.readyState===WebSocket.OPEN;
    countEl.textContent=String(peers.size+(connected?1:0));
  }

  function refreshName(){
    cachedName=(nameInput?.value||cachedName||'Conducteur')
      .trim()
      .slice(0,24)||'Conducteur';
    if(nameInput)nameInput.value=cachedName;
    localStorage.setItem('worlddrive_multiplayer_name',cachedName);
    return cachedName;
  }

  function replacePeerVisual(peer,vehicleId){
    if(peer.visual){
      scene.remove(peer.visual.root);
      peer.visual.dispose();
    }
    peer.vehicleId=vehicleId||'wrx';

    peer.visual=
      createRemoteVisual?.(
        peer.vehicleId,
        peer.name||'Conducteur'
      )||
      createRemoteVehicleVisual(
        THREE,
        peer.vehicleId,
        peer.name||'Conducteur'
      );

    scene.add(peer.visual.root);
  }

  function ensurePeer(message){
    if(!message.id||message.id===ownId)return null;
    let peer=peers.get(message.id);
    if(!peer){
      const initialSpeed=Number(message.speed)||0;
      const initialHeading=Number(message.heading)||0;
      peer={
        id:message.id,
        name:(message.name||'Conducteur').slice(0,24),
        vehicleId:message.vehicleId||'wrx',
        lat:Number(message.lat)||0,
        lon:Number(message.lon)||0,
        targetLat:Number(message.lat)||0,
        targetLon:Number(message.lon)||0,
        // Network Y is retained only as a compatibility fallback.
        y:Number(message.y)||0,
        targetY:Number(message.y)||0,
        renderY:null,

        heading:initialHeading,
        targetHeading:initialHeading,
        velocityHeading:Number.isFinite(message.velocityHeading)
          ?message.velocityHeading
          :(initialSpeed<0?initialHeading+Math.PI:initialHeading),
        steer:Number(message.steer)||0,
        targetSteer:Number(message.steer)||0,
        speed:initialSpeed,
        longitudinalAccel:Number(message.longitudinalAccel)||0,
        braking:!!message.braking,
        onRoad:!!message.onRoad,
        skidFront:Number(message.skidFront)||0,
        targetSkidFront:Number(message.skidFront)||0,
        skidRear:Number(message.skidRear)||0,
        targetSkidRear:Number(message.skidRear)||0,

        // V19.1 interpolation history.
        snapshots:[],
        lastSeq:0,
        bodyPitch:Number(message.bodyPitch)||0,
        targetBodyPitch:Number(message.bodyPitch)||0,
        bodyYaw:Number(message.bodyYaw)||0,
        targetBodyYaw:Number(message.bodyYaw)||0,
        bodyRoll:Number(message.bodyRoll)||0,
        targetBodyRoll:Number(message.bodyRoll)||0,
        bodyY:Number(message.bodyY)||0,
        targetBodyY:Number(message.bodyY)||0,
        wheelPitch:Number(message.wheelPitch)||0,
        targetWheelPitch:Number(message.wheelPitch)||0,
        wheelRoll:Number(message.wheelRoll)||0,
        targetWheelRoll:Number(message.wheelRoll)||0,

        lastSeen:performance.now(),
        wheelSpin:0,
        visual:null
      };
      replacePeerVisual(peer,peer.vehicleId);
      peers.set(peer.id,peer);
      updateCount();
    }
    return peer;
  }

  function applyState(message){
    const peer=ensurePeer(message);
    if(!peer)return;

    const seq=Number(message.seq)||0;
    if(
      seq>0&&
      peer.lastSeq>0&&
      seq<=peer.lastSeq
    )return;

    if(seq>0)peer.lastSeq=seq;

    const vehicleId=message.vehicleId||peer.vehicleId;
    const name=(message.name||peer.name).slice(0,24);

    if(vehicleId!==peer.vehicleId||name!==peer.name){
      peer.name=name;
      replacePeerVisual(peer,vehicleId);

      // Do not interpolate through a vehicle/model replacement.
      peer.snapshots.length=0;
      peer.renderY=null;
    }

    const receivedAt=performance.now();

    peer.snapshots.push(
      snapshotFromMessage(
        message,
        peer,
        receivedAt
      )
    );

    const historyCutoff=
      receivedAt-SNAPSHOT_HISTORY_MS;

    while(
      peer.snapshots.length>2&&
      peer.snapshots[0].receivedAt<historyCutoff
    ){
      peer.snapshots.shift();
    }

    if(Number.isFinite(message.lat))peer.targetLat=message.lat;
    if(Number.isFinite(message.lon))peer.targetLon=message.lon;
    if(Number.isFinite(message.y))peer.targetY=message.y;
    if(Number.isFinite(message.heading))peer.targetHeading=message.heading;
    if(Number.isFinite(message.velocityHeading))peer.velocityHeading=message.velocityHeading;
    if(Number.isFinite(message.steer))peer.targetSteer=message.steer;
    if(Number.isFinite(message.speed))peer.speed=message.speed;
    if(Number.isFinite(message.longitudinalAccel))peer.longitudinalAccel=message.longitudinalAccel;

    if(Number.isFinite(message.skidFront)){
      peer.targetSkidFront=Math.max(0,Math.min(1,message.skidFront));
    }

    if(Number.isFinite(message.skidRear)){
      peer.targetSkidRear=Math.max(0,Math.min(1,message.skidRear));
    }

    if(typeof message.onRoad==='boolean'){
      peer.onRoad=message.onRoad;
    }

    if(Number.isFinite(message.bodyPitch)){
      peer.targetBodyPitch=message.bodyPitch;
    }
    if(Number.isFinite(message.bodyYaw)){
      peer.targetBodyYaw=message.bodyYaw;
    }
    if(Number.isFinite(message.bodyRoll)){
      peer.targetBodyRoll=message.bodyRoll;
    }
    if(Number.isFinite(message.bodyY)){
      peer.targetBodyY=message.bodyY;
    }
    if(Number.isFinite(message.wheelPitch)){
      peer.targetWheelPitch=message.wheelPitch;
    }
    if(Number.isFinite(message.wheelRoll)){
      peer.targetWheelRoll=message.wheelRoll;
    }

    peer.braking=!!message.braking;
    peer.lastSeen=performance.now();
  }

  function removePeer(id){
    const peer=peers.get(id);
    if(!peer)return;
    if(peer.visual){
      scene.remove(peer.visual.root);
      peer.visual.dispose();
    }
    onRemotePeerRemoved?.(id);
    peers.delete(id);
    updateCount();
  }

  function clearPeers(){
    for(const id of [...peers.keys()])removePeer(id);
  }

  function send(payload){
    if(socket?.readyState!==WebSocket.OPEN)return;
    try{
      socket.send(JSON.stringify(payload));
    }catch(error){
      console.warn('Multiplayer send failed',error);
    }
  }

  function estimateLocalMotion(state,now){
    const fallbackHeading=
      Number(state.speed)<0
        ?finiteOr(state.heading,0)+Math.PI
        :finiteOr(state.heading,0);

    let velocityHeading=fallbackHeading;
    let longitudinalAccel=0;

    if(
      lastLocalMotion&&
      Number.isFinite(state.lat)&&
      Number.isFinite(state.lon)
    ){
      const dt=Math.max(.015,Math.min(.20,(now-lastLocalMotion.at)/1000));
      const delta=geographicOffsetMeters(
        lastLocalMotion.lat,
        lastLocalMotion.lon,
        state.lat,
        state.lon
      );
      const travelled=Math.hypot(delta.x,delta.z);
      if(travelled>.035){
        velocityHeading=Math.atan2(delta.x,delta.z);
      }else if(Number.isFinite(lastLocalMotion.velocityHeading)){
        velocityHeading=lastLocalMotion.velocityHeading;
      }

      longitudinalAccel=clamp(
        (
          Math.abs(Number(state.speed)||0)-
          Math.abs(lastLocalMotion.speed)
        )/dt,
        -12,
        8
      );
    }

    lastLocalMotion={
      at:now,
      lat:state.lat,
      lon:state.lon,
      speed:Number(state.speed)||0,
      velocityHeading
    };

    return {velocityHeading,longitudinalAccel};
  }

  function sendLocalState(){
    const state=getLocalState?.();
    if(!state)return;
    const now=performance.now();
    const motion=estimateLocalMotion(state,now);

    send({
      type:'state',
      seq:++localSequence,
      name:cachedName,
      lat:state.lat,
      lon:state.lon,
      y:state.y,
      heading:state.heading,
      velocityHeading:motion.velocityHeading,
      speed:state.speed,
      longitudinalAccel:motion.longitudinalAccel,
      vehicleId:state.vehicleId,
      steer:state.steer,
      braking:state.braking,
      onRoad:state.onRoad,
      skidFront:state.skidFront,
      skidRear:state.skidRear,
      bodyPitch:state.bodyPitch,
      bodyYaw:state.bodyYaw,
      bodyRoll:state.bodyRoll,
      bodyY:state.bodyY,
      wheelPitch:state.wheelPitch,
      wheelRoll:state.wheelRoll
    });
  }

  function connect(){
    if(
      socket&&
      (socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)
    )return;

    manuallyClosed=false;
    localSequence=0;
    lastLocalMotion=null;
    const url=defaultUrl();
    setStatus('Connexion…','connecting');

    try{
      socket=new WebSocket(url);
    }catch(error){
      console.warn('Multiplayer WebSocket failed',error);
      setStatus('Indisponible','error');
      return;
    }

    socket.addEventListener('open',()=>{
      send({
        type:'hello',
        name:refreshName(),
        vehicleId:getLocalState()?.vehicleId||'wrx'
      });
      setStatus('Connecté','on');
      toast('Multijoueur LAN connecté');
    });

    socket.addEventListener('message',event=>{
      let message;
      try{
        message=JSON.parse(event.data);
      }catch{
        return;
      }

      if(message.type==='welcome'){
        ownId=message.id;
        updateCount(message.count);
      }else if(message.type==='snapshot'){
        // One atomic initial roster for late joiners.
        for(const state of message.states||[]){
          applyState(state);
        }
      }else if(message.type==='refresh-state'){
        // A new player joined: send our position immediately.
        sendLocalState();
      }else if(message.type==='state'){
        applyState(message);
      }else if(message.type==='leave'){
        removePeer(message.id);
      }else if(message.type==='roster'){
        updateCount(message.count);
      }
    });

    socket.addEventListener('close',()=>{
      socket=null;
      ownId=null;
      lastLocalMotion=null;
      clearPeers();
      setStatus(manuallyClosed?'Déconnecté':'Serveur perdu',manuallyClosed?'off':'error');
      if(!manuallyClosed)toast('Connexion multijoueur perdue');
    });

    socket.addEventListener('error',()=>{
      setStatus('Erreur réseau','error');
    });
  }

  function disconnect(){
    manuallyClosed=true;
    lastLocalMotion=null;
    if(socket){
      try{socket.close(1000,'client disconnect')}catch{}
    }
    socket=null;
    ownId=null;
    clearPeers();
    setStatus('Déconnecté','off');
  }

  function toggle(){
    if(socket?.readyState===WebSocket.OPEN)disconnect();
    else connect();
  }

  function update(dt){
    const now=performance.now();

    if(socket?.readyState===WebSocket.OPEN&&now>=nextSendAt){
      nextSendAt=now+NETWORK_STATE_INTERVAL_MS; // 30 Hz state stream; rendering remains local frame-rate.
      sendLocalState();
    }

    const localState=getLocalState?.();
    const localRender=getLocalRenderPosition?.();

    // Compatibility fallback only. Normal V18C/V19 placement does not use this.
    const offset=getWorldOffset?.();
    const renderAt=
      now-
      INTERPOLATION_DELAY_MS;

    for(const peer of peers.values()){
      const sampled=
        samplePeerSnapshot(
          peer,
          renderAt
        );

      if(sampled){
        peer.lat=sampled.lat;
        peer.lon=sampled.lon;
        peer.y=sampled.y;
        peer.heading=sampled.heading;
        peer.velocityHeading=sampled.velocityHeading;
        peer.steer=sampled.steer;
        peer.speed=sampled.speed;
        peer.longitudinalAccel=sampled.longitudinalAccel;
        peer.braking=sampled.braking;
        peer.onRoad=sampled.onRoad;
        peer.skidFront=sampled.skidFront;
        peer.skidRear=sampled.skidRear;
        peer.bodyPitch=sampled.bodyPitch;
        peer.bodyYaw=sampled.bodyYaw;
        peer.bodyRoll=sampled.bodyRoll;
        peer.bodyY=sampled.bodyY;
        peer.wheelPitch=sampled.wheelPitch;
        peer.wheelRoll=sampled.wheelRoll;
      }

      let rx;
      let rz;
      let relativeD2;

      if(
        localState&&
        localRender&&
        Number.isFinite(localState.lat)&&
        Number.isFinite(localState.lon)&&
        Number.isFinite(localRender.x)&&
        Number.isFinite(localRender.z)
      ){
        const delta=geographicOffsetMeters(
          localState.lat,
          localState.lon,
          peer.lat,
          peer.lon
        );

        rx=localRender.x+delta.x;
        rz=localRender.z+delta.z;
        relativeD2=delta.x*delta.x+delta.z*delta.z;
      }else{
        // Legacy integration fallback.
        const abs=latLonToWorld(peer.lat,peer.lon);
        rx=abs.x-(offset?.x||0);
        rz=abs.z-(offset?.z||0);

        const localAbs=
          localState&&
          Number.isFinite(localState.lat)&&
          Number.isFinite(localState.lon)
            ?latLonToWorld(localState.lat,localState.lon)
            :{x:0,z:0};

        const dx=abs.x-localAbs.x;
        const dz=abs.z-localAbs.z;
        relativeD2=dx*dx+dz*dz;
      }

      const visible=relativeD2<3200*3200;

      peer.visual.root.visible=visible;

      if(!visible){
        peer.visual.setHeadlights?.(
          0,
          Infinity
        );

        onRemoteSkidFrame?.({
          id:peer.id,
          onRoad:false,
          skidFront:0,
          skidRear:0,
          contacts:[],
          distance:Infinity
        });

        continue;
      }

      // X/Z/heading are reconstructed network state. Y/contact plane are solved
      // against the RECEIVER'S own road/terrain.
      const localSupport=
        solveRemoteSupport?.({
          lat:peer.lat,
          lon:peer.lon,
          heading:peer.heading,
          visual:peer.visual
        })||
        null;

      const supportY=
        Number.isFinite(localSupport?.rootY)
          ?localSupport.rootY
          :peer.y;

      if(!Number.isFinite(peer.renderY)){
        peer.renderY=supportY;
      }else{
        const verticalInterp=
          1-Math.exp(
            -dt*18
          );

        peer.renderY=
          lerp(
            peer.renderY,
            supportY,
            verticalInterp
          );
      }

      peer.visual.root.position.set(
        rx,
        peer.renderY,
        rz
      );

      peer.visual.root.rotation.y=
        peer.heading;

      const localWheelPitch=
        Number.isFinite(localSupport?.wheelPitch)
          ?localSupport.wheelPitch
          :peer.wheelPitch;

      const localWheelRoll=
        Number.isFinite(localSupport?.wheelRoll)
          ?localSupport.wheelRoll
          :peer.wheelRoll;

      if(peer.visual.bodyGroup){
        peer.visual.bodyGroup.position.y=
          peer.bodyY;

        const pitchDelta=
          localWheelPitch-
          peer.wheelPitch;

        const rollDelta=
          localWheelRoll-
          peer.wheelRoll;

        peer.visual.bodyGroup.rotation.set(
          peer.bodyPitch-
          pitchDelta,
          peer.bodyYaw,
          peer.bodyRoll-
          rollDelta
        );
      }else{
        peer.visual.root.rotation.x=
          -localWheelPitch;

        peer.visual.root.rotation.z=
          -localWheelRoll;
      }

      for(
        let wheelIndex=0;
        wheelIndex<peer.visual.wheels.length;
        wheelIndex++
      ){
        const wheel=
          peer.visual.wheels[
            wheelIndex
          ];

        const radius=
          Number(wheel.radius)||.34;

        peer.wheelSpin-=
          peer.speed*dt/radius;

        if(wheel.tire){
          wheel.tire.rotation.x=
            peer.wheelSpin;
        }

        if(wheel.rim){
          wheel.rim.rotation.x=
            peer.wheelSpin;
        }

        const localWheelY=
          localSupport?.wheelLocalY?.[
            wheelIndex
          ];

        if(Number.isFinite(localWheelY)){
          wheel.pivot.position.y=
            localWheelY;
        }else{
          const x=
            Number.isFinite(wheel.baseX)
              ?wheel.baseX
              :wheel.pivot.position.x;

          const z=
            Number.isFinite(wheel.baseZ)
              ?wheel.baseZ
              :wheel.pivot.position.z;

          wheel.pivot.position.y=
            -Math.tan(localWheelPitch)*z-
            Math.tan(localWheelRoll)*x;
        }

        wheel.pivot.rotation.y=
          wheel.front
            ?peer.steer
            :0;

        wheel.pivot.rotation.z=
          -localWheelRoll;
      }

      const brake=peer.braking?1:0;

      if(peer.visual.setBraking){
        peer.visual.setBraking(brake);
      }else{
        peer.visual.brakeMat.color
          .copy(peer.visual.brakeBase)
          .lerp(peer.visual.brakeHot,brake);
      }

      const peerDistance=Math.sqrt(relativeD2);

      peer.visual.setHeadlights?.(
        getHeadlightLevel(),
        peerDistance
      );

      onRemoteSkidFrame?.({
        id:peer.id,
        onRoad:peer.onRoad,
        skidFront:peer.skidFront,
        skidRear:peer.skidRear,
        contacts:localSupport?.wheelContacts||[],
        distance:peerDistance
      });
    }
  }

  function getPeers(){
    return [...peers.values()].map(peer=>({
      id:peer.id,
      name:peer.name,
      lat:peer.lat,
      lon:peer.lon,
      vehicleId:peer.vehicleId,
      speed:peer.speed,
      velocityHeading:peer.velocityHeading,
      longitudinalAccel:peer.longitudinalAccel
    }));
  }

  if(nameInput){
    nameInput.value=
      localStorage.getItem('worlddrive_multiplayer_name')||
      nameInput.value||
      'Conducteur';
    refreshName();
    nameInput.addEventListener('change',refreshName);
  }

  toggleButton?.addEventListener('click',toggle);
  addEventListener('beforeunload',()=>disconnect(),{once:true});
  setStatus('Déconnecté','off');

  return {
    connect,
    disconnect,
    toggle,
    update,
    getPeers,
    isConnected:()=>socket?.readyState===WebSocket.OPEN
  };
}
