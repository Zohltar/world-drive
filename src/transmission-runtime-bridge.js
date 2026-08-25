// V21.29 — narrow runtime/transmission bridge.
// main.js still exposes the legacy 3-argument updateTransmission facade.
// Keep the new body-relative speed and clutch state out of that legacy API by
// sharing them explicitly between the driving runtime and transmission module.

const state={
  bodyLongitudinalSpeed:NaN,
  clutchHeld:false,
  engineThrottle:0,
  clutchShockMultiplier:1,
  sequence:0
};

export function publishTransmissionRuntimeState({
  bodyLongitudinalSpeed=NaN,
  clutchHeld=false,
  engineThrottle=0
}={}){
  const body=Number(bodyLongitudinalSpeed);
  state.bodyLongitudinalSpeed=Number.isFinite(body)?body:NaN;
  state.clutchHeld=!!clutchHeld;
  state.engineThrottle=Number(engineThrottle)||0;
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

export function readTransmissionRuntimeState(){
  return state;
}

export function resetTransmissionRuntimeState(){
  state.bodyLongitudinalSpeed=NaN;
  state.clutchHeld=false;
  state.engineThrottle=0;
  state.clutchShockMultiplier=1;
  state.sequence++;
}
