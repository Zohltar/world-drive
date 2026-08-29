import assert from 'node:assert/strict';
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
  assert.ok(Math.abs(actual-expected)<1e-9,`${deg} deg steering speed discontinuity: ${actual} vs ${expected}`);
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
