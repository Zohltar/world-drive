// World Drive Block 10 — mobile browser input owner.
// Produces normalized steering/throttle/brake state without owning vehicle physics.

export function clamp01(value){
  return Math.max(0,Math.min(1,Number(value)||0));
}

export function clampSigned(value){
  return Math.max(-1,Math.min(1,Number(value)||0));
}

export function applyDeadzone(value,deadzone=.08){
  const v=clampSigned(value);
  const dz=Math.max(0,Math.min(.45,Number(deadzone)||0));
  const a=Math.abs(v);
  if(a<=dz)return 0;
  return Math.sign(v)*((a-dz)/(1-dz));
}

export function normalizeTiltSteering({angleDeg=0,neutralDeg=0,maxTiltDeg=28,deadzone=.08,sensitivity=1}={}){
  const maxTilt=Math.max(8,Math.min(55,Number(maxTiltDeg)||28));
  const raw=clampSigned(((Number(angleDeg)||0)-(Number(neutralDeg)||0))/maxTilt);
  const dz=applyDeadzone(raw,deadzone);
  const gain=Math.max(.5,Math.min(2,Number(sensitivity)||1));
  return clampSigned(dz*gain);
}

export function landscapeTiltAngle(event={},screenAngle=0){
  const beta=Number(event.beta)||0;
  const gamma=Number(event.gamma)||0;
  const angle=((Number(screenAngle)||0)%360+360)%360;
  if(angle===90)return beta;
  if(angle===270)return -beta;
  return gamma;
}

export function mobileSecureContext(env=globalThis){
  return env?.isSecureContext===true;
}

export function mobileInputCapability(env=globalThis){
  const nav=env?.navigator||{};
  const touchPoints=Math.max(0,Number(nav.maxTouchPoints)||0);
  const hasTouch=('ontouchstart' in (env||{}))||touchPoints>0;
  const hasOrientation=typeof env?.DeviceOrientationEvent!=='undefined';
  const needsPermission=typeof env?.DeviceOrientationEvent?.requestPermission==='function';
  return {hasTouch,hasOrientation,needsPermission,touchPoints};
}

function makeButton(label,className){
  const button=document.createElement('button');
  button.type='button';
  button.className=className;
  button.textContent=label;
  button.setAttribute('aria-label',label);
  return button;
}

export function createMobileControls({
  root=document.body,
  getRuntimeState=()=>({gameStarted:false,menuOpen:false,autopilot:false}),
  onManualTakeover,
  deadzone=.08,
  sensitivity=1,
  maxTiltDeg=28,
  smoothing=.22,
  forceEnabled=false
}={}){
  const capability=mobileInputCapability(globalThis);
  const enabled=!!forceEnabled||capability.hasTouch;
  const state={
    enabled,
    active:false,
    calibrated:false,
    permission:'unknown',
    steeringSource:'none',
    steer:0,
    throttle:0,
    brake:0,
    neutralDeg:0,
    rawTiltDeg:0
  };
  if(!enabled)return Object.freeze({state,capability,update(){},requestPermission:async()=>false,recenter(){},dispose(){}});

  const overlay=document.createElement('div');
  overlay.id='worldDriveMobileControls';
  overlay.style.cssText='position:fixed;inset:0;z-index:10020;pointer-events:none;display:none;touch-action:none;user-select:none;-webkit-user-select:none;';

  const accel=makeButton('Accélérateur','world-drive-mobile-pedal world-drive-mobile-accelerator');
  const brake=makeButton('Frein','world-drive-mobile-pedal world-drive-mobile-brake');
  const recenter=makeButton('Recentrer','world-drive-mobile-recenter');
  const activate=makeButton('Activer volant','world-drive-mobile-activate-steering');
  for(const el of [accel,brake,recenter,activate]){
    el.style.pointerEvents='auto';
    el.style.touchAction='none';
    overlay.appendChild(el);
  }
  accel.style.cssText+='position:absolute;right:max(18px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));width:96px;height:96px;border-radius:48px;font:700 13px system-ui;';
  brake.style.cssText+='position:absolute;right:max(126px,calc(env(safe-area-inset-right) + 126px));bottom:max(18px,env(safe-area-inset-bottom));width:96px;height:96px;border-radius:48px;font:700 13px system-ui;';
  recenter.style.cssText+='position:absolute;left:50%;transform:translateX(-50%);bottom:max(18px,env(safe-area-inset-bottom));height:44px;padding:0 16px;border-radius:22px;font:700 12px system-ui;';
  activate.style.cssText+='position:absolute;left:50%;transform:translateX(-50%);bottom:max(72px,calc(env(safe-area-inset-bottom) + 72px));height:44px;padding:0 16px;border-radius:22px;font:700 12px system-ui;';
  root?.appendChild(overlay);

  let targetSteer=0;
  let orientationListening=false;

  function runtimeAllowsInput(){
    const runtime=getRuntimeState?.()||{};
    return !!runtime.gameStarted&&!runtime.menuOpen;
  }

  function maybeManualTakeover(){
    const runtime=getRuntimeState?.()||{};
    if(runtime.autopilot)onManualTakeover?.();
  }

  function setPedal(name,value){
    state[name]=value?1:0;
    if(value)maybeManualTakeover();
  }

  function bindHold(button,name){
    const down=e=>{e.preventDefault();button.setPointerCapture?.(e.pointerId);setPedal(name,1);};
    const up=e=>{e.preventDefault();setPedal(name,0);};
    button.addEventListener('pointerdown',down);
    button.addEventListener('pointerup',up);
    button.addEventListener('pointercancel',up);
    button.addEventListener('lostpointercapture',up);
    return ()=>{
      button.removeEventListener('pointerdown',down);
      button.removeEventListener('pointerup',up);
      button.removeEventListener('pointercancel',up);
      button.removeEventListener('lostpointercapture',up);
    };
  }

  const unbindAccel=bindHold(accel,'throttle');
  const unbindBrake=bindHold(brake,'brake');

  function orientationAngle(){
    return Number(globalThis.screen?.orientation?.angle)||Number(globalThis.orientation)||0;
  }

  function onOrientation(event){
    const angle=landscapeTiltAngle(event,orientationAngle());
    state.rawTiltDeg=angle;
    if(!state.calibrated){
      state.neutralDeg=angle;
      state.calibrated=true;
    }
    targetSteer=normalizeTiltSteering({angleDeg:angle,neutralDeg:state.neutralDeg,maxTiltDeg,deadzone,sensitivity});
    state.steeringSource='tilt';
    if(Math.abs(targetSteer)>.04)maybeManualTakeover();
  }

  function recenterNow(){
    state.neutralDeg=state.rawTiltDeg;
    state.calibrated=true;
    targetSteer=0;
    state.steer=0;
  }
  recenter.addEventListener('click',recenterNow);

  async function requestPermission(){
    if(!mobileSecureContext(globalThis)){
      state.permission='insecure';
      state.steeringSource='none';
      targetSteer=0;
      state.steer=0;
      activate.textContent='HTTPS requis pour volant';
      return false;
    }
    if(!capability.hasOrientation){
      state.permission='unavailable';
      state.steeringSource='none';
      targetSteer=0;
      state.steer=0;
      activate.textContent='Capteur indisponible';
      return false;
    }
    try{
      if(capability.needsPermission){
        const result=await globalThis.DeviceOrientationEvent.requestPermission();
        state.permission=String(result||'denied');
        if(result!=='granted'){
          state.steeringSource='none';
          targetSteer=0;
          state.steer=0;
          activate.textContent='Volant refusé';
          return false;
        }
      }else state.permission='granted';
      if(!orientationListening){
        globalThis.addEventListener('deviceorientation',onOrientation,true);
        orientationListening=true;
      }
      activate.style.display='none';
      return true;
    }catch{
      state.permission='denied';
      state.steeringSource='none';
      targetSteer=0;
      state.steer=0;
      activate.textContent='Volant refusé';
      return false;
    }
  }
  const activateSteering=e=>{e.preventDefault();void requestPermission();};
  activate.addEventListener('click',activateSteering);

  function update(){
    state.active=runtimeAllowsInput();
    overlay.style.display=state.active?'block':'none';
    if(!state.active){
      state.throttle=0;
      state.brake=0;
      targetSteer=0;
    }
    const blend=Math.max(.04,Math.min(1,Number(smoothing)||.22));
    state.steer=clampSigned(state.steer+(targetSteer-state.steer)*blend);
    if(Math.abs(state.steer)<.001)state.steer=0;
  }

  return Object.freeze({
    state,
    capability,
    update,
    requestPermission,
    recenter:recenterNow,
    dispose(){
      globalThis.removeEventListener?.('deviceorientation',onOrientation,true);
      orientationListening=false;
      recenter.removeEventListener('click',recenterNow);
      activate.removeEventListener('click',activateSteering);
      unbindAccel();unbindBrake();
      overlay.remove();
      state.throttle=0;state.brake=0;state.steer=0;targetSteer=0;
    }
  });
}
