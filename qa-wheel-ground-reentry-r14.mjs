import assert from 'node:assert/strict';
import {createWheelGroundSupport} from './src/wheel-ground-support.js';

const roadRoll=.045;
const tanRoll=Math.tan(roadRoll);
const roadSurfaceAt=(x,z)=>{
  const lateral=-x;
  return {
    y:10+tanRoll*lateral,
    lateral,
    angle:0,
    pitch:0,
    roll:roadRoll,
    px:0,
    pz:z
  };
};
const terrainAbs=(x,z)=>8.35+.025*x+.015*Math.sin(z*.2);

const support=createWheelGroundSupport({
  roadSurfaceAt,
  terrainAbs,
  roadHalfWidth:8.5
});

function roadCenterYForVehicle(x,z){
  const lateral=-x;
  return 10+tanRoll*lateral+.10;
}
function frameAt(z=0){
  return {y:10,angle:0,pitch:0,roll:roadRoll,px:0,pz:z};
}
function setFastAtVehicle(x,z=0,active=true){
  support.setFastWheelRoadSupport(
    active,
    frameAt(z),
    roadCenterYForVehicle(x,z),
    x,
    z
  );
}

// R14 contract 1: the fast local plane must be anchored to the ROAD centre,
// not to the vehicle. This is the core regression that used to promote every
// wheel to road height the instant the car centre crossed nr.d < 8.5 m.
setFastAtVehicle(-8.4,0,true);
assert.ok(Math.abs(support.support.centerX)<1e-12,'fast support must use road projected X centre');
assert.ok(Math.abs(support.support.centerZ)<1e-12,'fast support must use road projected Z centre');
assert.ok(Math.abs(support.support.centerY-10.10)<1e-10,'fast support must preserve asphalt surface offset at road centre');

// R14 contract 2: toggling roadContact authority at the SAME physical wheel
// position must not change support height. Before/after values should be the
// same blended road/terrain surface, otherwise the toggle itself is an impulse.
for(const x of [-9.0,-8.51,-8.49,-8.0,-6.8,-5.4,-4.5]){
  support.setFastWheelRoadSupport(false,null,NaN,0,0);
  const fallback=support.groundHeightForWheel(x,0,true);
  setFastAtVehicle(-8.49,0,true);
  const fast=support.groundHeightForWheel(x,0,true);
  assert.ok(
    Math.abs(fast-fallback)<1e-9,
    `fast/fallback support mismatch at lateral ${(-x).toFixed(2)} m: ${fast} vs ${fallback}`
  );
}

// R14 contract 3: the outer 8.5 m boundary is continuous. A large road/terrain
// height difference may create a slope, but never a one-frame geometric step.
support.setFastWheelRoadSupport(false,null,NaN,0,0);
const justInside=support.groundHeightForWheel(-8.499,0,true);
const justOutside=support.groundHeightForWheel(-8.501,0,true);
assert.ok(
  Math.abs(justInside-justOutside)<.01,
  `road/terrain support still has an edge step: ${justInside} -> ${justOutside}`
);

// The solid road core remains exactly on the road plane, while the legacy outer
// corridor has already fully transitioned to terrain.
const core=support.groundHeightForWheel(-5.4,0,true);
const expectedCore=10+tanRoll*5.4+.10;
assert.ok(Math.abs(core-expectedCore)<1e-10,'road core support changed');
const outer=support.groundHeightForWheel(-8.5,0,true);
assert.ok(Math.abs(outer-terrainAbs(-8.5,0))<1e-10,'outer support must be terrain owned');

// R14 contract 4: emulate a low-speed diagonal re-entry at 1.2 m/s lateral.
// The old binary support step could imply tens of m/s of vertical ground speed.
// The blended shoulder must keep the support velocity in a suspension-scale
// range while roadContact switches on at 8.5 m.
const dt=1/60;
const lateralSpeed=1.2;
let centerLateral=9.4;
let previousAvg=null;
let maxSupportVy=0;
let toggleJump=0;
let previousRoadContact=false;
for(let frame=0;frame<260;frame++){
  const carX=-centerLateral;
  const roadContact=centerLateral<8.5;
  if(roadContact){
    setFastAtVehicle(carX,0,true);
  }else{
    support.setFastWheelRoadSupport(false,null,NaN,0,0);
  }
  const leftX=carX-.78;
  const rightX=carX+.78;
  const avg=(
    support.groundHeightForWheel(leftX,0,true)+
    support.groundHeightForWheel(rightX,0,true)
  )*.5;
  if(previousAvg!==null){
    const vy=(avg-previousAvg)/dt;
    maxSupportVy=Math.max(maxSupportVy,Math.abs(vy));
    if(roadContact!==previousRoadContact)toggleJump=Math.abs(avg-previousAvg);
  }
  previousAvg=avg;
  previousRoadContact=roadContact;
  centerLateral-=lateralSpeed*dt;
}
assert.ok(maxSupportVy<2.0,`low-speed re-entry support velocity is still impulsive: ${maxSupportVy.toFixed(3)} m/s`);
assert.ok(toggleJump<.035,`roadContact toggle still creates a vertical step: ${toggleJump.toFixed(4)} m`);

console.log('GRIP R14 ROAD / TERRAIN VERTICAL REENTRY QA: PASS',{
  supportCoreHalfWidth:support.support.coreHalfWidth,
  supportOuterHalfWidth:support.support.halfWidth,
  boundaryDeltaM:+Math.abs(justInside-justOutside).toFixed(5),
  maxLowSpeedSupportVy:+maxSupportVy.toFixed(3),
  roadContactToggleDeltaM:+toggleJump.toFixed(5)
});
