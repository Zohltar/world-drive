// V21.29 — narrow runtime/transmission bridge.
// Carries body-relative speed plus independent engine/brake/clutch channels.

import {readTransmissionNetworkGear} from './transmission-network-state.js';

const state={
  bodyLongitudinalSpeed:NaN,
  clutchHeld:false,
  engineThrottle:0,
  serviceBrake:0,
  selectorGear:1,
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

export function publishTransmissionSelectorGear(value=1){
  const next=Number(value);
  state.selectorGear=next<0?-1:next===0?0:1;
  state.sequence++;
  return state.selectorGear;
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
  // M4.5: the exact gear published by transmission-controller is the same
  // state written to the instrument cluster. Keep the legacy selectorGear field
  // synchronized so existing lighting/network consumers see that authoritative
  // value without maintaining another copy of D/N/R state.
  const gear=Number(readTransmissionNetworkGear());
  if(Number.isFinite(gear))state.selectorGear=gear<0?-1:gear===0?0:Math.max(1,Math.floor(gear));
  return state;
}

export function resetTransmissionRuntimeState(){
  state.bodyLongitudinalSpeed=NaN;
  state.clutchHeld=false;
  state.engineThrottle=0;
  state.serviceBrake=0;
  state.selectorGear=1;
  state.clutchShockMultiplier=1;
  state.sequence++;
}
