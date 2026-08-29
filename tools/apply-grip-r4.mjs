import fs from 'node:fs';

function replaceOnce(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`Grip R4 missing anchor: ${label}`);
  if(source.indexOf(needle,first+needle.length)>=0)throw new Error(`Grip R4 ambiguous anchor: ${label}`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}

const runtimePath='src/driving-runtime-base.js';
let s=fs.readFileSync(runtimePath,'utf8').replace(/\r\n/g,'\n');

s=replaceOnce(s,
`export function bodyRelativeSteeringSpeed({speed=0,heading=0,velocityHeading=0,handbrake=false}={}){
  const v=Number(speed)||0;
  const speedAbs=Math.abs(v);
  if(speedAbs<1e-8)return 0;
  if(handbrake)return Math.sign(v||1)*speedAbs;
  const bodyLong=bodyRelativeLongitudinalSpeed({speed:v,heading,velocityHeading});
  const projectionDeadband=speedAbs*.06;
  const direction=Math.abs(bodyLong)>projectionDeadband
    ?Math.sign(bodyLong)
    :Math.sign(v||1);
  return direction*speedAbs;
}`,
`export function bodyRelativeSteeringSpeed({speed=0,heading=0,velocityHeading=0,handbrake=false}={}){
  const v=Number(speed)||0;
  const speedAbs=Math.abs(v);
  if(speedAbs<1e-8)return 0;
  if(handbrake)return Math.sign(v||1)*speedAbs;

  // Grip R4 — use the actual longitudinal velocity seen by the chassis instead
  // of snapping the full speed magnitude from +v to -v around 90 degrees.
  // The bicycle steering model therefore fades continuously to zero as travel
  // becomes sideways, then naturally becomes reverse steering beyond 90 deg.
  return bodyRelativeLongitudinalSpeed({speed:v,heading,velocityHeading});
}`,
'continuous body-relative steering speed');

s=replaceOnce(s,
`export function postSpinSteeringAuthority({rearSlipAmount=0,heading=0,velocityHeading=0,handbrake=false}={}){
  if(handbrake)return 1;
  const slip=Math.max(0,Math.min(1,Number(rearSlipAmount)||0));
  const sideslip=travelAxisSideslip({heading,velocityHeading});
  const extremeSideslip=smoothstep01((sideslip-.70)/.70);
  const rearSlipGate=smoothstep01((slip-.18)/.55);
  const suppression=extremeSideslip*rearSlipGate;
  return 1-.72*suppression;
}`,
`export function postSpinSteeringAuthority(){
  // Grip R4 — steering input itself is never artificially removed in a spin.
  // Tire force and body-relative contact velocity decide how much authority the
  // front axle can physically produce. The old 28% valley around 90 degrees was
  // a numerical anti-spin aid and created a perceptible rotation wall.
  return 1;
}

export function driftKinematicCoupling({sideslipRad=0,forceCoupledSlide=0}={}){
  const sideslip=Math.max(0,Math.min(Math.PI*.5,Math.abs(Number(sideslipRad)||0)));
  const slide=Math.max(0,Math.min(1,Number(forceCoupledSlide)||0));
  // Bicycle-model yaw is valid near the no-slip region, but it must stop acting
  // like stability control once the chassis is far from its momentum vector.
  // Near 90 degrees only 6% of the kinematic yaw target remains; angular inertia
  // and measured tire-force imbalance dominate instead.
  const sideT=smoothstep01((sideslip-.30)/.85);
  const forceT=smoothstep01((slide-.12)/.68);
  return 1-.94*Math.max(sideT,forceT);
}`,
'remove post-spin authority valley');

s=replaceOnce(s,
`    const yawResponse=yawResponseRate({vehicle:VEHICLE,speedAbs,airborne:airborneNow});
    const yawReleaseBoost=Math.abs(yawRate)<Math.abs(dynamicYawRate)?1.35:1;
    const frictionYawLoss=physicsClamp(Math.abs(frictionYawAccel)/4.5,0,1);
    const forceCoupledSlide=physicsClamp(Math.max(frictionYawLoss,rearLateralForceLoss),0,1);
    const yawGripResponseScale=Math.max(.34,1-forceCoupledSlide*.66);
    dynamicYawRate+=frictionYawAccel*dt;
    dynamicYawRate+=(yawRate-dynamicYawRate)*(1-Math.exp(-dt*yawResponse*yawReleaseBoost*yawGripResponseScale));`,
`    const yawResponse=yawResponseRate({vehicle:VEHICLE,speedAbs,airborne:airborneNow});
    const frictionYawLoss=physicsClamp(Math.abs(frictionYawAccel)/4.5,0,1);
    const forceCoupledSlide=physicsClamp(Math.max(frictionYawLoss,rearLateralForceLoss),0,1);
    const driftKinematicScale=driftKinematicCoupling({
      sideslipRad:currentSideslip,
      forceCoupledSlide
    });
    // Keep the familiar fast settling only while the car is close to the
    // bicycle-model regime. During a real drift, do not numerically brake yaw
    // just because the steady-state target is smaller or changes sign.
    const yawReleaseBoost=
      driftKinematicScale>.82&&Math.abs(yawRate)<Math.abs(dynamicYawRate)
        ?1.35
        :1;
    const yawGripResponseScale=driftKinematicScale;
    dynamicYawRate+=frictionYawAccel*dt;
    dynamicYawRate+=(yawRate-dynamicYawRate)*(1-Math.exp(-dt*yawResponse*yawReleaseBoost*yawGripResponseScale));`,
'fade kinematic yaw during drift');

s=replaceOnce(s,
`      let attemptedTrajectoryDelta=0;
      if(!airborneNow&&speedAbs>4&&forceCoupledSlide>.10){
        const signedSpeedForCurvature=Math.abs(speed)>.5?speed:Math.sign(speed||1)*.5;
        const forceTrajectoryYawRate=netLateralAccel/signedSpeedForCurvature;
        attemptedTrajectoryDelta+=forceTrajectoryYawRate*dt;
        const slideAlignmentRate=.65+(1-forceCoupledSlide)*3.20;
        attemptedTrajectoryDelta+=angleDelta(momentumTargetHeading,velocityHeading)*(1-Math.exp(-dt*slideAlignmentRate));
      }else{`,
`      let attemptedTrajectoryDelta=0;
      const forceDominatedDrift=
        !airborneNow&&
        speedAbs>4&&
        (forceCoupledSlide>.10||driftKinematicScale<.88);
      if(forceDominatedDrift){
        const signedSpeedForCurvature=Math.abs(speed)>.5?speed:Math.sign(speed||1)*.5;
        const forceTrajectoryYawRate=netLateralAccel/signedSpeedForCurvature;
        // Grip R4 — in a drift the momentum vector can only rotate because tire
        // forces bend it. Remove the old synthetic alignment toward the nearest
        // body axis, whose target switched at 90 degrees.
        attemptedTrajectoryDelta+=forceTrajectoryYawRate*dt;
      }else{`,
'remove synthetic drift momentum alignment');

fs.writeFileSync(runtimePath,s,'utf8');

fs.writeFileSync('qa-grip-drift-r4.mjs',`import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  bodyRelativeSteeringSpeed,
  postSpinSteeringAuthority,
  travelAxisSideslip,
  driftKinematicCoupling
} from './src/driving-runtime.js';

const DEG=Math.PI/180;
const speed=20;
const sample=deg=>bodyRelativeSteeringSpeed({
  speed,heading:deg*DEG,velocityHeading:0,handbrake:false
});

for(const deg of [0,30,60,80,89,90,91,100,120,150,180]){
  const actual=sample(deg);
  const expected=speed*Math.cos(deg*DEG);
  assert.ok(Math.abs(actual-expected)<1e-9,\`${'${deg}'} deg steering speed discontinuity: ${'${actual}'} vs ${'${expected}'}\`);
}
assert.ok(sample(89)>0&&Math.abs(sample(89))<.4,'89 deg should approach zero from forward side');
assert.ok(Math.abs(sample(90))<1e-9,'90 deg must pass continuously through zero');
assert.ok(sample(91)<0&&Math.abs(sample(91))<.4,'91 deg should leave zero on reverse side');
assert.equal(bodyRelativeSteeringSpeed({speed:-20,heading:0,velocityHeading:0}),-20,'true reverse must remain reverse');
assert.equal(bodyRelativeSteeringSpeed({speed:20,heading:Math.PI,velocityHeading:0}),-20,'post-180 travel must become true body-relative reverse');
assert.equal(bodyRelativeSteeringSpeed({speed:20,heading:Math.PI/2,velocityHeading:0,handbrake:true}),20,'held handbrake must preserve spin-direction yaw request');

for(const angle of [0,45,80,90,100,135,180]){
  for(const rearSlipAmount of [0,.4,.8,1]){
    const authority=postSpinSteeringAuthority({rearSlipAmount,heading:angle*DEG,velocityHeading:0,handbrake:false});
    assert.equal(authority,1,'steering command must not have an artificial 90-degree authority valley');
  }
}

const coupling=[];
for(const angle of [0,10,20,30,45,60,75,90,120,150,180]){
  const sideslip=travelAxisSideslip({heading:angle*DEG,velocityHeading:0});
  coupling.push({angle,value:driftKinematicCoupling({sideslipRad:sideslip,forceCoupledSlide:.05})});
}
assert.ok(coupling.find(x=>x.angle===0).value>.999,'aligned travel must keep normal yaw response');
assert.ok(coupling.find(x=>x.angle===20).value>.94,'ordinary cornering must remain nearly unchanged');
assert.ok(coupling.find(x=>x.angle===90).value<.07,'90-degree drift must be inertia/force dominated');
assert.ok(coupling.find(x=>x.angle===180).value>.999,'aligned post-180 reverse must recover normal yaw response');
assert.ok(driftKinematicCoupling({sideslipRad:0,forceCoupledSlide:1})<.07,'full tire slide must suppress kinematic yaw damping');

const source=fs.readFileSync('src/driving-runtime-base.js','utf8');
assert.ok(!source.includes('projectionDeadband=speedAbs*.06'),'legacy 90-degree steering sign deadband still present');
assert.ok(!source.includes('return 1-.72*suppression'),'legacy post-spin 28% authority valley still present');
assert.ok(!source.includes('Math.max(.34,1-forceCoupledSlide*.66)'),'legacy minimum 34% yaw-target pull still present');
assert.ok(!source.includes('const slideAlignmentRate=.65+(1-forceCoupledSlide)*3.20'),'legacy synthetic drift alignment still present');

console.log('PASS Grip R4 legacy anti-spin cleanup',{coupling});
`,'utf8');

console.log('Grip R4 patch applied');
