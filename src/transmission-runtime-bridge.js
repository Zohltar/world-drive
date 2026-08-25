// V21.29 — narrow runtime/transmission bridge.
// Carries body-relative speed plus independent engine/brake/clutch channels.

const state={
  bodyLongitudinalSpeed:NaN,
  clutchHeld:false,
  engineThrottle:0,
  serviceBrake:0,
  clutchShockMultiplier:1,
  sequence:0
};

export function publishTransmissionRuntimeState({
  bodyLongitudinalSpeed=NaN,
  clutchHeld=false,
  engineThrottle=0,
  serviceBrake=0
}={}){
  const body=Number(bodyLongitudinalSpeed);
  state.bodyLongitudinalSpeed=Number.isFinite(body)?body:NaN;
  state.clutchHeld=!!clutchHeld;
  state.engineThrottle=Math.max(0,Math.min(1,Number(engineThrottle)||0));
  state.serviceBrake=Math.max(0,Math.min(1,Number(serviceBrake)||0));
  state.sequence++;
  return state.sequence;
}

export function publishClutchShockMultiplier(value=1){
  const next=Number(value);
  state.clutchShockMultiplier=Number.isFinite(next)
    ?Math.max(1,Math.min(4,next))
    :1;
  return state.clutchShockMultiplier;
}

export function consumeClutchShockMultiplier(){
  const value=Math.max(1,Number(state.clutchShockMultiplier)||1);
  state.clutchShockMultiplier=1;
  return value;
}

export function readTransmissionRuntimeState(){return state;}

export function resetTransmissionRuntimeState(){
  state.bodyLongitudinalSpeed=NaN;
  state.clutchHeld=false;
  state.engineThrottle=0;
  state.serviceBrake=0;
  state.clutchShockMultiplier=1;
  state.sequence++;
}
