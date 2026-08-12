// World Drive V20.0 — pooled skid-mark renderer.
// Local rubber is driven by independent per-wheel adhesion loss; multiplayer
// keeps the compact front/rear aggregate state.
export function createSkidMarkSystem({
  THREE,
  scene,
  getWorldOffset,
  getRoadSurface,
  maxSegments=7200
}){
  const MIN_SEGMENT=.12;
  const MAX_SEGMENT=3.0;
  const REMOTE_DRAW_DISTANCE=520;

  // V19.0: recent rubber is protected from circular-pool recycling.
  // If every slot is still younger than this, new marks are temporarily
  // skipped instead of erasing marks in front of the player.
  const MIN_RECYCLE_AGE_MS=20000;

  const geometry=new THREE.PlaneGeometry(1,1);
  geometry.rotateX(-Math.PI/2);

  const material=new THREE.MeshBasicMaterial({
    color:0xffffff,
    transparent:true,
    opacity:.34,
    depthWrite:false,
    depthTest:true,
    vertexColors:true,
    toneMapped:false,
    polygonOffset:true,
    polygonOffsetFactor:-2,
    polygonOffsetUnits:-3,
    side:THREE.DoubleSide
  });

  const mesh=new THREE.InstancedMesh(geometry,material,maxSegments);
  mesh.name='skid-marks';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled=false;
  mesh.renderOrder=4;
  scene.add(mesh);

  const slots=Array.from({length:maxSegments},()=>({
    active:false,
    absX:0,
    absZ:0,
    y:0,
    width:.2,
    length:0,
    shade:.05,
    bornAt:0,
    quaternion:new THREE.Quaternion()
  }));

  const tracks=new Map();
  const dummy=new THREE.Object3D();
  const basis=new THREE.Matrix4();
  const up=new THREE.Vector3();
  const forward=new THREE.Vector3();
  const right=new THREE.Vector3();
  const correctedForward=new THREE.Vector3();
  const color=new THREE.Color();

  let nextSlot=0;
  let lastOffsetX=NaN;
  let lastOffsetZ=NaN;
  let localState={
    front:0,
    rear:0,
    wheels:[0,0,0,0],
    onRoad:false
  };

  // Legacy axle timers remain for remote/fallback behavior.
  let lateralSquealTime=0;
  let brakingSlipTime=0;

  // V20.0 local tire timers: every wheel earns its own rubber independently.
  const wheelSlipTime=[0,0,0,0];

  const LATERAL_MARK_DELAY=.70;
  const BRAKE_MARK_DELAY=.38;

  function smoothstep01(value){
    const t=Math.max(0,Math.min(1,Number(value)||0));
    return t*t*(3-2*t);
  }

  function currentOffset(){
    const o=getWorldOffset?.()||{x:0,z:0};
    return {x:Number(o.x)||0,z:Number(o.z)||0};
  }

  function hide(index){
    dummy.position.set(0,-10000,0);
    dummy.quaternion.identity();
    dummy.scale.set(0,0,0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index,dummy.matrix);
    color.setRGB(0,0,0);
    mesh.setColorAt(index,color);
  }

  for(let i=0;i<maxSegments;i++)hide(i);
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;

  function roadNormal(absX,absZ){
    const surface=getRoadSurface?.(absX,absZ);

    if(!surface){
      up.set(0,1,0);
      return {up,y:null};
    }

    const a=Number(surface.angle)||0;
    const pitch=Number(surface.pitch)||0;
    const roll=Number(surface.roll)||0;

    const f=new THREE.Vector3(
      Math.sin(a),
      Math.tan(pitch),
      Math.cos(a)
    ).normalize();

    const left=new THREE.Vector3(
      -Math.cos(a),
      Math.tan(roll),
      Math.sin(a)
    ).normalize();

    up.crossVectors(left,f).normalize();
    if(up.y<0)up.multiplyScalar(-1);

    return {
      up,
      y:Number.isFinite(surface.y)?surface.y:null
    };
  }

  function write(index){
    const slot=slots[index];
    if(!slot.active){
      hide(index);
      return;
    }

    const o=currentOffset();

    dummy.position.set(
      slot.absX-o.x,
      slot.y,
      slot.absZ-o.z
    );

    dummy.quaternion.copy(slot.quaternion);
    dummy.scale.set(slot.width,1,slot.length);
    dummy.updateMatrix();
    mesh.setMatrixAt(index,dummy.matrix);

    color.setRGB(slot.shade,slot.shade,slot.shade);
    mesh.setColorAt(index,color);
  }

  function refreshForFloatingOrigin(){
    const o=currentOffset();
    if(o.x===lastOffsetX&&o.z===lastOffsetZ)return;

    lastOffsetX=o.x;
    lastOffsetZ=o.z;

    for(let i=0;i<slots.length;i++){
      if(slots[i].active)write(i);
    }

    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }

  function acquireWritableSlot(){
    const now=performance.now();

    for(let attempt=0;attempt<maxSegments;attempt++){
      const index=nextSlot;
      const slot=slots[index];

      nextSlot=
        (nextSlot+1)%
        maxSegments;

      if(
        !slot.active||
        now-slot.bornAt>=MIN_RECYCLE_AGE_MS
      ){
        return {
          index,
          now
        };
      }
    }

    return null;
  }

  function placeSegment(start,end,intensity,tireWidth){
    const dx=end.absX-start.absX;
    const dz=end.absZ-start.absZ;
    const length=Math.hypot(dx,dz);

    if(length<MIN_SEGMENT||length>MAX_SEGMENT)return false;

    const midX=(start.absX+end.absX)*.5;
    const midZ=(start.absZ+end.absZ)*.5;
    const road=roadNormal(midX,midZ);

    const y=
      Number.isFinite(road.y)
        ?road.y+.016
        :(start.ground+end.ground)*.5+.016;

    forward.set(
      dx,
      end.ground-start.ground,
      dz
    );

    // Make the path tangent to the actual banked/graded road surface.
    forward.addScaledVector(
      road.up,
      -forward.dot(road.up)
    );

    if(forward.lengthSq()<1e-8)return false;
    forward.normalize();

    right.crossVectors(road.up,forward).normalize();
    correctedForward.crossVectors(right,road.up).normalize();
    basis.makeBasis(right,road.up,correctedForward);

    const writable=
      acquireWritableSlot();

    // Capacity saturated with recent marks: consume this path sample without
    // drawing it. This preserves existing rubber instead of popping it away.
    if(!writable){
      return true;
    }

    const slot=
      slots[
        writable.index
      ];

    slot.active=true;
    slot.bornAt=writable.now;
    slot.absX=midX;
    slot.absZ=midZ;
    slot.y=y;
    slot.length=length;

    slot.width=
      Math.max(.11,Math.min(.38,Number(tireWidth)||.22))*
      (.72+intensity*.24);

    slot.quaternion.setFromRotationMatrix(basis);

    // Darker as slip increases; opacity remains modest so it blends into roads.
    slot.shade=.025+(1-intensity)*.075;

    write(writable.index);

    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    return true;
  }

  function resetSource(sourceId){
    const prefix=`${sourceId}:`;
    for(const key of [...tracks.keys()]){
      if(key.startsWith(prefix))tracks.delete(key);
    }
  }

  function updateSource(sourceId,contacts,{
    front=0,
    rear=0,
    wheels=null,
    onRoad=false,
    distance=0
  }={}){
    refreshForFloatingOrigin();

    if(Number.isFinite(distance)&&distance>REMOTE_DRAW_DISTANCE){
      resetSource(sourceId);
      return;
    }

    if(!onRoad||!Array.isArray(contacts)||contacts.length!==4){
      resetSource(sourceId);
      return;
    }

    for(let index=0;index<contacts.length;index++){
      const c=contacts[index];
      const absX=Number(c?.absX);
      const absZ=Number(c?.absZ);
      const ground=Number(c?.ground);

      if(
        !Number.isFinite(absX)||
        !Number.isFinite(absZ)||
        !Number.isFinite(ground)
      )continue;

      const wheelIntensity=
        Array.isArray(wheels)&&
        Number.isFinite(
          Number(wheels[index])
        )
          ?Number(wheels[index])
          :(
             c.front
               ?front
               :rear
           );

      const intensity=
        smoothstep01(
          wheelIntensity
        );

      const key=`${sourceId}:${index}`;
      let track=tracks.get(key);

      if(!track){
        track={absX,absZ,ground,skidding:false};
        tracks.set(key,track);
        continue;
      }

      const travel=Math.hypot(
        absX-track.absX,
        absZ-track.absZ
      );

      if(intensity<.055||travel>MAX_SEGMENT){
        track.absX=absX;
        track.absZ=absZ;
        track.ground=ground;
        track.skidding=false;
        continue;
      }

      // Establish a clean starting point on the first true-skid frame.
      if(!track.skidding){
        track.absX=absX;
        track.absZ=absZ;
        track.ground=ground;
        track.skidding=true;
        continue;
      }

      if(travel>=MIN_SEGMENT){
        const placed=placeSegment(
          track,
          {absX,absZ,ground},
          intensity,
          c.width
        );

        if(placed){
          track.absX=absX;
          track.absZ=absZ;
          track.ground=ground;
        }
      }
    }
  }

  function computeSlip({
    onRoad,
    speed,
    steerAngle,
    lateralGripUsage,
    wheelGripUsage,
    longitudinalAccel,
    handbrake,
    vehicle,
    dt=0
  }){
    if(!onRoad||Math.abs(speed)<3.4){
      lateralSquealTime=0;
      brakingSlipTime=0;

      for(let i=0;i<4;i++){
        wheelSlipTime[i]=0;
      }

      return {
        front:0,
        rear:0,
        wheels:[0,0,0,0],
        onRoad:!!onRoad
      };
    }

    // V20.0: if the physics supplied four independent friction-circle values,
    // use them directly. No steering-angle reconstruction is needed.
    if(
      Array.isArray(
        wheelGripUsage
      )&&
      wheelGripUsage.length===4
    ){
      const safeDt=
        Math.max(
          0,
          Math.min(
            .05,
            Number(dt)||0
          )
        );

      const speedGate=
        smoothstep01(
          (
            Math.abs(speed)*3.6-
            12
          )/
          18
        );

      const wheels=
        wheelGripUsage.map(
          (usage,index)=>{
            const raw=
              smoothstep01(
                (
                  Math.max(
                    0,
                    Number(usage)||0
                  )-
                  1.06
                )/
                .26
              );

            const rear=
              index===0||
              index===2;

            // Handbrake remains an immediate rear-wheel event.
            if(handbrake&&rear){
              wheelSlipTime[index]=
                Math.max(
                  wheelSlipTime[index],
                  .50
                );

              return Math.max(
                raw,
                speedGate
              );
            }

            if(raw>.001){
              wheelSlipTime[index]+=
                safeDt;
            }else{
              wheelSlipTime[index]=0;
            }

            // Because this signal already comes from an actual friction-circle
            // calculation, the visual delay can be shorter than old G-based
            // heuristics while still avoiding one-frame rubber flashes.
            const delay=
              raw>.72
                ?.30
                :.52;

            return wheelSlipTime[index]>=delay
              ?raw
              :0;
          }
        );

      return {
        front:
          Math.max(
            wheels[1]||0,
            wheels[3]||0
          ),
        rear:
          Math.max(
            wheels[0]||0,
            wheels[2]||0
          ),
        wheels,
        onRoad:true
      };
    }

    const gripUsage=
      Math.max(
        0,
        Number(lateralGripUsage)||0
      );

    // Match the audible tire threshold exactly.
    const lateralSqueal=
      smoothstep01(
        (gripUsage-.98)/.17
      );

    if(lateralSqueal>.001){
      lateralSquealTime+=
        Math.max(
          0,
          Math.min(
            .05,
            Number(dt)||0
          )
        );
    }else{
      lateralSquealTime=0;
    }

    // Rubber appears only after roughly 0.7 s of uninterrupted tire squeal.
    const lateralSlip=
      lateralSquealTime>=LATERAL_MARK_DELAY
        ?lateralSqueal
        :0;

    const brakingG=Math.max(
      0,
      -(Number(longitudinalAccel)||0)/9.81
    );

    const brakeCapabilityG=Math.max(
      .70,
      (Number(vehicle?.brake)||9.8)/9.81
    );

    const brakeStart=Math.max(.48,brakeCapabilityG*.62);
    const brakeFull=Math.max(brakeStart+.24,brakeCapabilityG*.92);

    const rawBrakeSlip=smoothstep01(
      (brakingG-brakeStart)/
      Math.max(.01,brakeFull-brakeStart)
    );

    // Hard braking can squeal immediately, but visible rubber should require
    // a brief sustained lock/scrub. This keeps short ABS-like brake spikes
    // from painting the road instantly.
    if(rawBrakeSlip>.001){
      brakingSlipTime+=
        Math.max(
          0,
          Math.min(
            .05,
            Number(dt)||0
          )
        );
    }else{
      brakingSlipTime=0;
    }

    const brakeSlip=
      brakingSlipTime>=BRAKE_MARK_DELAY
        ?rawBrakeSlip
        :0;

    const speedGate=smoothstep01(
      (Math.abs(speed)*3.6-12)/18
    );

    const handbrakeSlip=handbrake?speedGate:0;

    const front=
      Math.max(
        lateralSlip*.72,
        brakeSlip
      );

    const rear=
      Math.max(
        lateralSlip,
        brakeSlip*.72,
        handbrakeSlip
      );

    return {
      front,
      rear,
      wheels:[
        rear,
        front,
        rear,
        front
      ],
      onRoad:true
    };
  }

  function updateLocal(args){
    localState=computeSlip(args);
    updateSource('local',args.contacts,localState);
    return localState;
  }

  function updateRemote({
    peerId,
    contacts,
    front,
    rear,
    onRoad,
    distance
  }){
    if(!peerId)return;

    updateSource(
      `remote:${peerId}`,
      contacts,
      {front,rear,onRoad,distance}
    );
  }

  function clear(){
    tracks.clear();
    nextSlot=0;
    lateralSquealTime=0;
    brakingSlipTime=0;

    for(let i=0;i<4;i++){
      wheelSlipTime[i]=0;
    }

    for(let i=0;i<slots.length;i++){
      slots[i].active=false;
      slots[i].bornAt=0;
      hide(i);
    }

    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }

  return {
    updateLocal,
    updateRemote,
    resetSource,
    clear,
    get localState(){
      return {...localState};
    }
  };
}
