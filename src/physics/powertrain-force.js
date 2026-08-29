// Power R1 — physical combustion powertrain force model.
// Converts crankshaft torque through the selected gear, final drive and
// drivetrain efficiency into tractive force at the tire contact patch.

function finite(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function clamp(value,min,max){
  return Math.max(min,Math.min(max,value));
}

function smoothstep01(value){
  const t=clamp(finite(value,0),0,1);
  return t*t*(3-2*t);
}

export function interpolateTorqueNm(curve=[],rpm=0){
  const points=Array.isArray(curve)
    ?curve
      .map(point=>Array.isArray(point)?[finite(point[0],NaN),finite(point[1],NaN)]:null)
      .filter(point=>point&&Number.isFinite(point[0])&&Number.isFinite(point[1])&&point[0]>=0&&point[1]>=0)
      .sort((a,b)=>a[0]-b[0])
    :[];
  if(!points.length)return 0;
  const r=Math.max(0,finite(rpm,0));
  if(r<=points[0][0])return points[0][1];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(r<=b[0]){
      const span=Math.max(1e-6,b[0]-a[0]);
      const t=(r-a[0])/span;
      return a[1]+(b[1]-a[1])*t;
    }
  }
  return points[points.length-1][1];
}

export function torqueDrivenAcceleration({
  vehicle={},
  profile={},
  gear=1,
  rpm=0,
  throttle=0,
  speedAbs=0
}={}){
  if(profile?.powertrainModel!=='torque')return {active:false,acceleration:0};

  const ratios=Array.isArray(profile.gearRatios)?profile.gearRatios.map(Number):[];
  const selected=Math.max(1,Math.min(ratios.length,Math.floor(finite(gear,1))));
  const gearRatio=finite(ratios[selected-1],0);
  const finalDrive=Math.max(.1,finite(profile.finalDriveRatio,0));
  const radius=Math.max(.12,finite(profile.driveWheelRadiusM,0));
  const efficiency=clamp(finite(profile.drivetrainEfficiency,.85),.50,.98);
  const mass=Math.max(250,finite(vehicle.massKg,1500));
  const pedal=clamp(finite(throttle,0),0,1);

  if(!gearRatio||!finalDrive||!radius||pedal<=0){
    return {active:true,acceleration:0,torqueNm:0,wheelForceN:0,effectiveRpm:finite(rpm,0),gear:selected};
  }

  const idle=Math.max(500,finite(profile.idleRpm,850));
  const launchRpm=Math.max(idle,finite(profile.launchClutchRpm,idle));
  const launchFadeSpeed=Math.max(.5,finite(profile.launchClutchFadeMps,5.5));
  const speed=Math.max(0,Math.abs(finite(speedAbs,0)));
  const launchBlend=selected===1
    ?1-smoothstep01(speed/launchFadeSpeed)
    :0;
  const launchFloor=idle+(launchRpm-idle)*launchBlend*Math.sqrt(pedal);
  const effectiveRpm=Math.max(idle,finite(rpm,idle),launchFloor);

  const torqueNm=interpolateTorqueNm(profile.torqueCurveNm,effectiveRpm);
  const wheelTorqueNm=torqueNm*gearRatio*finalDrive*efficiency*pedal;
  const wheelForceN=wheelTorqueNm/radius;
  const acceleration=wheelForceN/mass;

  return {
    active:true,
    acceleration,
    torqueNm,
    wheelTorqueNm,
    wheelForceN,
    effectiveRpm,
    gear:selected,
    gearRatio,
    finalDrive,
    efficiency
  };
}
