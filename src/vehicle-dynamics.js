// World Drive V21.30 — roll-stiffness wrapper over frozen V21.29 dynamics.
// Keeps all validated V21.29 clutch/brake/drift behavior, then applies a small
// load-sensitivity correction that redistributes lateral grip according to the
// effective front/rear roll-stiffness balance.

export * from './vehicle-dynamics-v21.29.js';
import {
  clampDynamics,
  smoothstep01,
  vehicleLayout,
  estimateWheelGripUsage as baseEstimateWheelGripUsage
} from './vehicle-dynamics-v21.29.js';

function safeNumber(value,fallback){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

export function antiRollCalibration(vehicle={}){
  const layout=vehicleLayout(vehicle);
  const frontWeight=clampDynamics(safeNumber(layout.frontWeightBias,.55),.30,.75);
  const drivetrain=String(layout.drivetrain||'AWD');
  const response=Math.max(4,safeNumber(vehicle?.suspensionResponse,14));
  const cg=Math.max(.2,safeNumber(vehicle?.cgHeight,.5));
  const vehicleClass=String(vehicle?.vehicleClass||'passenger');

  if(vehicleClass==='tractor')return {strength:.24,frontBalance:frontWeight};
  if(vehicleClass==='racecar')return {strength:.90,frontBalance:clampDynamics(frontWeight+.015,.38,.62)};
  if(drivetrain==='FWD'){
    return {
      strength:clampDynamics(.46+(response-12)*.035,.46,.68),
      frontBalance:clampDynamics(frontWeight+.045,.50,.70)
    };
  }
  if(drivetrain==='RWD'){
    return {
      strength:clampDynamics(.52+(response-13)*.035,.50,.76),
      frontBalance:clampDynamics(frontWeight+.025,.38,.62)
    };
  }
  const sporty=smoothstep01((response-14)/5)*(1-smoothstep01((cg-.50)/.12));
  const frontBalance=frontWeight+.025*(1-sporty)-.035*sporty;
  return {
    strength:clampDynamics(.46+(response-13)*.04,.46,.76),
    frontBalance:clampDynamics(frontBalance,.40,.66)
  };
}

export function antiRollAxleGripScales({vehicle={},signedLatAccel=0}={}){
  const layout=vehicleLayout(vehicle);
  const calibration=antiRollCalibration(vehicle);
  const frontWeight=clampDynamics(safeNumber(layout.frontWeightBias,.55),.30,.75);
  const lateralG=Math.abs(safeNumber(signedLatAccel,0))/9.80665;
  // Below ~0.28 g the driver should not feel an artificial handling modifier.
  // Near the tire limit, roll-couple distribution matters because tire load
  // sensitivity means the axle carrying more lateral transfer loses capacity.
  const loadT=smoothstep01((lateralG-.28)/.62);
  const imbalance=clampDynamics((calibration.frontBalance-frontWeight)*2.4,-.22,.22);
  const strength=calibration.strength*loadT;

  const frontPenalty=Math.max(0,imbalance)*.38*strength;
  const rearPenalty=Math.max(0,-imbalance)*.38*strength;
  const frontRelief=Math.max(0,-imbalance)*.16*strength;
  const rearRelief=Math.max(0,imbalance)*.16*strength;

  return {
    front:clampDynamics(1-frontPenalty+frontRelief,.94,1.025),
    rear:clampDynamics(1-rearPenalty+rearRelief,.94,1.025),
    lateralG,loadT,
    strength:calibration.strength,
    frontBalance:calibration.frontBalance,
    frontWeight,
    imbalance
  };
}

const vehicleShadowCache=new WeakMap();
function shadowVehicleForAntiRoll(vehicle,scales){
  if(!vehicle||typeof vehicle!=='object')return vehicle;
  let shadow=vehicleShadowCache.get(vehicle);
  if(!shadow){shadow=Object.create(vehicle);vehicleShadowCache.set(vehicle,shadow);}
  const frontBase=Math.max(.72,safeNumber(vehicle.frontTireGripScale,1));
  const rearBase=Math.max(.72,safeNumber(vehicle.rearTireGripScale,1));
  shadow.frontTireGripScale=frontBase*scales.front;
  shadow.rearTireGripScale=rearBase*scales.rear;
  shadow._layoutRevision=safeNumber(vehicle._layoutRevision,0);
  return shadow;
}

export function estimateWheelGripUsage(args={},out=null){
  const scales=antiRollAxleGripScales({vehicle:args?.vehicle||{},signedLatAccel:args?.signedLatAccel});
  const active=scales.loadT>.001&&Math.abs(scales.imbalance)>.001;
  const vehicle=active?shadowVehicleForAntiRoll(args?.vehicle||{},scales):args?.vehicle;
  const result=baseEstimateWheelGripUsage({...args,vehicle},out);
  result.antiRollFrontGripScale=scales.front;
  result.antiRollRearGripScale=scales.rear;
  result.antiRollFrontBalance=scales.frontBalance;
  result.antiRollStrength=scales.strength;
  result.antiRollLateralG=scales.lateralG;
  return result;
}
