// World Drive - camera subsystem
// Owns Chase / 1st person / Aerial modes and right-stick free-look.
// V21.13: slope-aware chase camera + terrain collision + fixed hood camera.

export function createCameraController({
  THREE,
  camera,
  camTarget,
  car,
  bodyGroup,
  modeStatusEl,
  getHeading,
  getLookState,
  getGroundHeight
}) {
  let mode=0;
  let lookYaw=0;
  let lookPitch=0;

  const modeNames=['Chase','1st person','Aérienne'];
  const worldUp=new THREE.Vector3(0,1,0);
  const tmpQuat=new THREE.Quaternion();
  const tmpBodyOrigin=new THREE.Vector3();
  const tmpBodyForward=new THREE.Vector3();
  const tmpBodyUp=new THREE.Vector3();
  const tmpPoint=new THREE.Vector3();
  const tmpSafe=new THREE.Vector3();

  function clamp(v,min,max){
    return Math.max(min,Math.min(max,v));
  }

  function updateStatus(){
    if(modeStatusEl)modeStatusEl.textContent=modeNames[mode];
  }

  function updateLook(dt){
    const input=getLookState?.()||{};

    const reverseView=!!(input.connected&&input.reverseView);

    // 1st-person is a genuinely fixed hood camera. The right stick is ignored
    // in this mode so the camera always follows the vehicle's own direction.
    const freeLookAllowed=mode!==1;

    const targetYaw=
      freeLookAllowed&&input.connected&&!reverseView
        ?(input.lookX||0)*1.22
        :0;

    const targetPitch=
      freeLookAllowed&&input.connected
        ?-(input.lookY||0)*.58
        :0;

    const active=Math.abs(targetYaw)>.01||Math.abs(targetPitch)>.01;
    const rate=active?8.5:(mode===1?12:3.0);

    lookYaw+=(targetYaw-lookYaw)*(1-Math.exp(-dt*rate));
    lookPitch+=(targetPitch-lookPitch)*(1-Math.exp(-dt*rate));

    lookYaw=clamp(lookYaw,-1.35,1.35);
    lookPitch=clamp(lookPitch,-.46,.38);
  }

  function getBodyFrame(heading){
    const fallbackForward=new THREE.Vector3(
      Math.sin(heading),
      0,
      Math.cos(heading)
    ).normalize();

    tmpBodyOrigin.copy(car.position);
    tmpBodyForward.copy(fallbackForward);
    tmpBodyUp.copy(worldUp);

    if(bodyGroup){
      bodyGroup.getWorldPosition(tmpBodyOrigin);
      bodyGroup.getWorldQuaternion(tmpQuat);

      tmpBodyForward
        .set(0,0,1)
        .applyQuaternion(tmpQuat)
        .normalize();

      tmpBodyUp
        .set(0,1,0)
        .applyQuaternion(tmpQuat)
        .normalize();
    }

    return {
      origin:tmpBodyOrigin,
      forward:tmpBodyForward,
      up:tmpBodyUp,
      fallbackForward
    };
  }

  function groundHeightAt(x,z){
    if(typeof getGroundHeight!=='function')return -Infinity;
    const y=Number(getGroundHeight(x,z));
    return Number.isFinite(y)?y:-Infinity;
  }

  // Camera-boom collision: if terrain/road intersects the line from the car to
  // the requested camera point, shorten the boom instead of lifting the camera
  // high above the vehicle. This avoids both underground cameras and the
  // near-vertical "satellite" view on cliff roads.
  function resolveBoom(anchor,desired,clearance=.78){
    let safeT=1;
    const samples=12;

    for(let i=2;i<=samples;i++){
      const t=i/samples;
      tmpPoint.copy(anchor).lerp(desired,t);
      const floor=groundHeightAt(tmpPoint.x,tmpPoint.z);

      if(Number.isFinite(floor)&&tmpPoint.y<floor+clearance){
        safeT=Math.max(.16,(i-1)/samples);
        break;
      }
    }

    tmpSafe.copy(anchor).lerp(desired,safeT);

    const finalFloor=groundHeightAt(tmpSafe.x,tmpSafe.z);
    if(Number.isFinite(finalFloor)&&tmpSafe.y<finalFloor+clearance){
      tmpSafe.y=finalFloor+clearance;
    }

    return {
      point:tmpSafe,
      shortened:safeT<.999
    };
  }

  function clampLookPitch(from,to,maxUp=.56,maxDown=.62){
    const dx=to.x-from.x;
    const dz=to.z-from.z;
    const horizontal=Math.hypot(dx,dz);
    if(horizontal<.35)return;

    const dy=to.y-from.y;
    const maxDy=Math.tan(maxUp)*horizontal;
    const minDy=-Math.tan(maxDown)*horizontal;

    to.y=from.y+clamp(dy,minDy,maxDy);
  }

  function updateFirstPerson(reverseView,bodyFrame){
    // Mount the camera on the sprung body rather than smoothing behind it.
    // This follows pitch, roll and suspension motion like a real hood-mounted
    // camera while remaining independent from the external chase camera.
    const direction=bodyFrame.forward.clone();
    if(reverseView)direction.multiplyScalar(-1);

    const desired=bodyFrame.origin.clone()
      .addScaledVector(bodyFrame.up,1.82)
      .addScaledVector(bodyFrame.forward,1.05);

    const target=desired.clone()
      .addScaledVector(direction,24);

    camera.position.copy(desired);
    camTarget.copy(target);
    camera.up.copy(bodyFrame.up);
    camera.lookAt(camTarget);
  }

  function update(dt){
    updateLook(dt);

    const heading=getHeading?.()||0;
    const input=getLookState?.()||{};
    const reverseView=!!(input.connected&&input.reverseView);
    const bodyFrame=getBodyFrame(heading);

    if(mode===1){
      updateFirstPerson(reverseView,bodyFrame);
      return;
    }

    // External cameras keep a level horizon. Vehicle pitch is used to follow
    // steep grades, but vehicle roll does not rotate the whole player's view.
    camera.up.copy(worldUp);

    const viewYaw=lookYaw+(reverseView?Math.PI:0);
    const cosY=Math.cos(viewYaw);
    const sinY=Math.sin(viewYaw);

    const flatForward=bodyFrame.fallbackForward;
    const horizontalForward=new THREE.Vector3(
      flatForward.x*cosY + flatForward.z*sinY,
      0,
      flatForward.z*cosY - flatForward.x*sinY
    ).normalize();

    // Read the actual sprung-body pitch, then project that grade into the
    // current free-look direction. Looking sideways across a slope should not
    // inherit the full uphill/downhill pitch; reverse view correctly flips it.
    const bodyHorizontal=Math.hypot(
      bodyFrame.forward.x,
      bodyFrame.forward.z
    );

    const bodyPitch=clamp(
      Math.atan2(bodyFrame.forward.y,Math.max(.001,bodyHorizontal)),
      -.55,
      .55
    );

    const gradePitch=bodyPitch*Math.cos(viewYaw);
    const gradeCos=Math.cos(gradePitch);

    const slopeForward=new THREE.Vector3(
      horizontalForward.x*gradeCos,
      Math.sin(gradePitch),
      horizontalForward.z*gradeCos
    ).normalize();

    const pitchHeight=Math.sin(lookPitch)*8;
    let desired,target;
    let collisionAnchor;

    if(mode===0){
      // Chase follows the 3D road/vehicle pitch. On a steep downhill, the
      // camera behind the vehicle naturally rises with the road behind; on an
      // uphill it naturally descends with the road while retaining clearance.
      desired=car.position.clone()
        .addScaledVector(slopeForward,-10.5)
        .addScaledVector(worldUp,5+pitchHeight*.35);

      target=car.position.clone()
        .addScaledVector(slopeForward,8.5)
        .addScaledVector(worldUp,1.2+pitchHeight);

      collisionAnchor=car.position.clone()
        .addScaledVector(worldUp,1.65);
    }else{
      desired=car.position.clone()
        .addScaledVector(horizontalForward,-12)
        .addScaledVector(worldUp,29+pitchHeight*.55);

      target=car.position.clone()
        .addScaledVector(horizontalForward,10)
        .addScaledVector(worldUp,pitchHeight*.8);

      collisionAnchor=car.position.clone()
        .addScaledVector(worldUp,2.0);
    }

    const resolved=resolveBoom(
      collisionAnchor,
      desired,
      mode===0?.82:1.25
    );
    desired=resolved.point.clone();

    // Never let terrain collision turn Chase into an almost vertical overhead
    // camera. Keep enough forward component that the road ahead remains visible.
    if(mode===0){
      clampLookPitch(desired,target,.54,.60);
    }

    const baseRate=mode===0?7:7;
    const rate=resolved.shortened&&mode===0?13:baseRate;
    const smoothing=1-Math.exp(-dt*rate);

    camera.position.lerp(desired,smoothing);
    camTarget.lerp(target,smoothing);

    // The old smoothed camera position may itself still be inside terrain for
    // one or more frames after a sudden grade/cliff transition. Resolve that
    // actual boom too, moving it toward the car instead of teleporting upward.
    const currentSafe=resolveBoom(
      collisionAnchor,
      camera.position,
      mode===0?.72:1.0
    );

    if(currentSafe.shortened){
      camera.position.copy(currentSafe.point);
    }else{
      const floor=groundHeightAt(camera.position.x,camera.position.z);
      if(Number.isFinite(floor)&&camera.position.y<floor+(mode===0?.72:1.0)){
        camera.position.y=floor+(mode===0?.72:1.0);
      }
    }

    if(mode===0){
      clampLookPitch(camera.position,camTarget,.56,.62);
    }

    camera.lookAt(camTarget);
  }

  function cycle(){
    mode=(mode+1)%modeNames.length;
    updateStatus();
    return mode;
  }

  function setMode(nextMode){
    const n=Number(nextMode);
    if(!Number.isFinite(n))return mode;
    mode=((Math.round(n)%modeNames.length)+modeNames.length)%modeNames.length;
    updateStatus();
    return mode;
  }

  function resetLook(){
    lookYaw=0;
    lookPitch=0;
  }

  function getMode(){
    return mode;
  }

  updateStatus();

  return {update,cycle,setMode,resetLook,getMode};
}
