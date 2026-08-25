import { createVehiclePresentation as createBaseVehiclePresentation } from './vehicle-presentation-v21.29.js';
import { antiRollCalibration } from './vehicle-dynamics.js';

function clamp(v,min,max){return Math.max(min,Math.min(max,Number(v)||0));}
function smoothstep01(v){const t=clamp(v,0,1);return t*t*(3-2*t);}

export function createVehiclePresentation(args={}){
  const base=createBaseVehiclePresentation(args);
  const activeVehicleWheels=typeof args.activeVehicleWheels==='function'?args.activeVehicleWheels:()=>[];
  const getDrivingState=typeof args.getDrivingState==='function'?args.getDrivingState:()=>({});

  function updateSuspensionVisuals(dt,onRoad,currentSteerAngle){
    base.updateSuspensionVisuals(dt,onRoad,currentSteerAngle);
    if(base.airborne)return;

    const state=getDrivingState()||{};
    const vehicle=state.VEHICLE||{};
    const speed=Number(state.speed)||0;
    const wheelbase=Math.max(1.2,Number(vehicle.wheelbase)||2.7);
    const yawRate=(speed/wheelbase)*Math.tan(Number(currentSteerAngle)||0);
    const lateralAccel=speed*yawRate;
    const lateralG=Math.abs(lateralAccel)/9.80665;
    const loadT=smoothstep01((lateralG-.24)/.66);
    if(loadT<.002)return;

    const calibration=antiRollCalibration(vehicle);
    const vehicleClass=String(vehicle.vehicleClass||'passenger');
    const classScale=vehicleClass==='tractor'?.45:vehicleClass==='racecar'?.78:1;
    const coupling=clamp(calibration.strength*loadT*.34*classScale,0,.28);
    if(coupling<.002)return;

    const wheels=activeVehicleWheels();
    const contacts=Array.isArray(base.wheelContacts)?base.wheelContacts:[];
    const byAxle=new Map();
    for(let i=0;i<wheels.length;i++){
      const w=wheels[i];
      if(!w?.pivot)continue;
      const axleIndex=Number.isInteger(w.axleIndex)?w.axleIndex:(w.front?0:1);
      let pair=byAxle.get(axleIndex);
      if(!pair){pair={left:null,right:null};byAxle.set(axleIndex,pair);}
      const side=w.side||(Number(w.pivot.position.x)<0?'left':'right');
      pair[side]={wheel:w,index:i,contact:contacts[i]};
    }

    for(const pair of byAxle.values()){
      if(!pair.left||!pair.right)continue;
      const ly=Number(pair.left.wheel.pivot.position.y)||0;
      const ry=Number(pair.right.wheel.pivot.position.y)||0;
      const lg=Number(pair.left.contact?.ground);
      const rg=Number(pair.right.contact?.ground);
      const terrainDelta=Number.isFinite(lg)&&Number.isFinite(rg)?Math.abs(lg-rg):0;
      const terrainProtection=1-smoothstep01((terrainDelta-.025)/.11);
      const k=coupling*terrainProtection;
      if(k<.002)continue;
      const mean=(ly+ry)*.5;
      const nextL=ly+(mean-ly)*k;
      const nextR=ry+(mean-ry)*k;
      pair.left.wheel.pivot.position.y=nextL;
      pair.right.wheel.pivot.position.y=nextR;

      const lc=pair.left.contact,rc=pair.right.contact;
      if(lc&&rc){
        const lComp=Math.max(0,Number(lc.suspensionCompression)||0);
        const rComp=Math.max(0,Number(rc.suspensionCompression)||0);
        const cMean=(lComp+rComp)*.5;
        lc.suspensionCompression=lComp+(cMean-lComp)*k;
        rc.suspensionCompression=rComp+(cMean-rComp)*k;
      }
    }
  }

  return {
    ...base,
    updateSuspensionVisuals,
    get wheelPlaneRoll(){return base.wheelPlaneRoll;},
    get wheelPlanePitch(){return base.wheelPlanePitch;},
    get wheelContacts(){return base.wheelContacts;},
    get airborne(){return base.airborne;},
    get verticalVelocity(){return base.verticalVelocity;}
  };
}
