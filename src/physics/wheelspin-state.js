// World Drive Cleanup B6 — authoritative persistent clutch/wheelspin state.
//
// The transmission/runtime owns clutch timing. This module owns only the
// persistent driven-wheel spin level that results when a clutch release exceeds
// available road traction. Tire-utilization math remains stateless elsewhere.

function clamp(value,min,max){
  return Math.max(min,Math.min(max,Number(value)||0));
}

export function drivenWheelSlipLevels(drivetrain='AWD',level=0){
  const s=clamp(level,0,1);
  if(drivetrain==='FWD')return [0,s,0,s];
  if(drivetrain==='RWD')return [s,0,s,0];
  return [s*.72,s*.72,s*.72,s*.72];
}

export function wheelspinDynamicGripFactor(drivetrain='AWD',level=0,vehicleClass='passenger'){
  const s=clamp(level,0,1);
  if(vehicleClass==='tractor')return 1-.05*s;
  if(drivetrain==='FWD')return 1-.22*s;
  if(drivetrain==='RWD')return 1-.18*s;
  return 1-.10*s;
}

export function wheelspinHoldDurationSec(drivetrain='AWD',vehicleClass='passenger'){
  if(vehicleClass==='tractor')return .18;
  if(drivetrain==='FWD')return .62;
  if(drivetrain==='RWD')return .48;
  return .24;
}

export function createWheelspinState(){
  let level=0;
  let holdSec=0;

  function reset(){
    level=0;
    holdSec=0;
  }

  function snapshot(drivetrain='AWD',vehicleClass='passenger'){
    return {
      level,
      holdSec,
      drivetrain,
      vehicleClass,
      gripFactor:wheelspinDynamicGripFactor(drivetrain,level,vehicleClass),
      wheels:drivenWheelSlipLevels(drivetrain,level)
    };
  }

  function advance({
    dt=1/60,
    releaseMultiplier=1,
    engineThrottle=0,
    tractionResult=null,
    drivetrain='AWD',
    vehicleClass='passenger'
  }={}){
    const step=Math.max(.001,Math.min(.05,Number(dt)||1/60));
    const request=Math.abs(Number(tractionResult?.requested)||0);
    const limit=Math.max(.01,Math.abs(Number(tractionResult?.limit)||0));
    const overRatio=request/limit;
    const clutchBreakaway=
      Number(releaseMultiplier)>1.05&&
      Number(engineThrottle)>.35&&
      !!tractionResult?.limited&&
      overRatio>1.03;

    if(clutchBreakaway){
      const seed=clamp((overRatio-1.02)/.72,0,1);
      level=Math.max(level,.42+.58*seed);
      holdSec=Math.max(holdSec,wheelspinHoldDurationSec(drivetrain,vehicleClass));
    }else if(holdSec>0){
      holdSec=Math.max(0,holdSec-step);
      level*=Math.pow(Number(engineThrottle)>.55?.995:.975,step*60);
    }else if(level>0){
      level*=Math.exp(-step*(Number(engineThrottle)>.55?3.3:8.5));
      if(level<.01)level=0;
    }

    return {
      ...snapshot(drivetrain,vehicleClass),
      clutchBreakaway,
      overRatio
    };
  }

  return Object.freeze({
    reset,
    advance,
    snapshot,
    get level(){return level;},
    get holdSec(){return holdSec;}
  });
}
