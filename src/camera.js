// World Drive - camera subsystem
// Owns Chase / Hood / Aerial modes and right-stick free-look.

export function createCameraController({
  THREE,
  camera,
  camTarget,
  car,
  modeStatusEl,
  getHeading,
  getLookState
}) {
  let mode=0;
  let lookYaw=0;
  let lookPitch=0;

  const modeNames=['Chase','Capot','Aérienne'];

  function updateStatus(){
    if(modeStatusEl)modeStatusEl.textContent=modeNames[mode];
  }

  function updateLook(dt){
    const input=getLookState?.()||{};
    const targetYaw=input.connected ? (input.lookX||0)*1.22 : 0;
    const targetPitch=input.connected ? -(input.lookY||0)*.58 : 0;

    const active=Math.abs(targetYaw)>.01||Math.abs(targetPitch)>.01;
    const rate=active?8.5:3.0;

    lookYaw+=(targetYaw-lookYaw)*(1-Math.exp(-dt*rate));
    lookPitch+=(targetPitch-lookPitch)*(1-Math.exp(-dt*rate));

    lookYaw=Math.max(-1.35,Math.min(1.35,lookYaw));
    lookPitch=Math.max(-.46,Math.min(.38,lookPitch));
  }

  function update(dt){
    updateLook(dt);

    const heading=getHeading?.()||0;
    const baseForward=new THREE.Vector3(
      Math.sin(heading),
      0,
      Math.cos(heading)
    );

    const cosY=Math.cos(lookYaw);
    const sinY=Math.sin(lookYaw);
    const forward=new THREE.Vector3(
      baseForward.x*cosY + baseForward.z*sinY,
      0,
      baseForward.z*cosY - baseForward.x*sinY
    ).normalize();

    const pitchHeight=Math.sin(lookPitch)*8;
    let desired,target;

    if(mode===0){
      desired=car.position.clone()
        .addScaledVector(forward,-10.5)
        .add(new THREE.Vector3(0,5+pitchHeight*.35,0));
      target=car.position.clone()
        .addScaledVector(forward,8)
        .add(new THREE.Vector3(0,1.2+pitchHeight,0));
    }else if(mode===1){
      desired=car.position.clone()
        .addScaledVector(forward,1.1)
        .add(new THREE.Vector3(0,1.55+pitchHeight*.16,0));
      target=car.position.clone()
        .addScaledVector(forward,20)
        .add(new THREE.Vector3(0,1.2+pitchHeight,0));
    }else{
      desired=car.position.clone()
        .addScaledVector(forward,-12)
        .add(new THREE.Vector3(0,29+pitchHeight*.55,0));
      target=car.position.clone()
        .addScaledVector(forward,10)
        .add(new THREE.Vector3(0,pitchHeight*.8,0));
    }

    const smoothing=1-Math.exp(-dt*(mode===1?12:7));
    camera.position.lerp(desired,smoothing);
    camTarget.lerp(target,smoothing);
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
