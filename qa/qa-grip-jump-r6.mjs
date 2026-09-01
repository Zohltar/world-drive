import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  horizontalTravelDirection,
  crestLaunchDecision,
  airborneLandingDecision
} from '../src/physics/airborne-dynamics.js';

const DEG=Math.PI/180;

// Crest probing must follow real momentum, not the direction the nose points.
{
  const d=horizontalTravelDirection({speed:20,heading:0,velocityHeading:90*DEG});
  assert.ok(Math.abs(d.x-1)<1e-9,`sideways momentum X ${d.x}`);
  assert.ok(Math.abs(d.z)<1e-9,`sideways momentum Z ${d.z}`);
  assert.equal(d.speedAbs,20);
}

// Signed reverse must reverse the actual travel vector without changing the
// momentum parameter convention used by the driving runtime.
{
  const d=horizontalTravelDirection({speed:-12,heading:0,velocityHeading:0});
  assert.ok(Math.abs(d.x)<1e-9);
  assert.ok(Math.abs(d.z+1)<1e-9,`reverse travel Z ${d.z}`);
}

function parabolaCrest({speed,k}){
  const predictionTime=.075;
  const futureDistance=Math.abs(speed)*predictionTime;
  const probe=Math.max(.35,Math.min(1.8,Math.abs(speed)*.035));
  const y=s=>-k*s*s;
  const supportVerticalVelocity=(y(probe)-y(-probe))/(2*probe)*Math.abs(speed);
  return crestLaunchDecision({
    speedAbs:Math.abs(speed),
    supportOriginY:y(0),
    futureSupportY:y(futureDistance),
    supportVerticalVelocity,
    predictionTime,
    downwardAccel:9.80665
  });
}

// No legacy 27 km/h cliff: if terrain falls away faster than gravity can follow,
// a vehicle travelling only 18 km/h can genuinely lose contact.
const lowSpeedSharp=parabolaCrest({speed:5,k:.40});
assert.equal(lowSpeedSharp.canLaunch,true,JSON.stringify(lowSpeedSharp));

// A broad/mild crest at the same speed remains supported.
const lowSpeedMild=parabolaCrest({speed:5,k:.08});
assert.equal(lowSpeedMild.canLaunch,false,JSON.stringify(lowSpeedMild));

// Stationary/noise regime must not invent a launch.
const stationary=crestLaunchDecision({
  speedAbs:.1,supportOriginY:0,futureSupportY:-1,supportVerticalVelocity:0
});
assert.equal(stationary.canLaunch,false);

// Landing is based on geometric crossing plus relative downward motion; there
// is no fixed airborne-time lockout or +0.8 m/s contact fudge.
assert.equal(airborneLandingDecision({nextY:9.99,supportY:10,verticalVelocity:-2,supportVerticalVelocity:-.3}),true);
assert.equal(airborneLandingDecision({nextY:9.99,supportY:10,verticalVelocity:1,supportVerticalVelocity:0}),false);
assert.equal(airborneLandingDecision({nextY:10.1,supportY:10,verticalVelocity:-2,supportVerticalVelocity:0}),false);

// Integration contract: B5 owns local chassis yaw authority. Airborne yaw must
// therefore remain free of kinematic steering attraction in yaw-authority.js,
// while presentation must still receive velocityHeading for crest/air travel.
const runtime=fs.readFileSync(new URL('../src/driving-runtime-base.js',import.meta.url),'utf8');
const yawAuthority=fs.readFileSync(new URL('../src/physics/yaw-authority.js',import.meta.url),'utf8');
const presentation=fs.readFileSync(new URL('../src/vehicles/vehicle-presentation-v21.29.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(runtime,/advanceYawAuthority\(\{/,'runtime no longer delegates local yaw authority to B5 owner');
assert.match(
  yawAuthority,
  /const yawGripResponseScale=airborne[\s\S]*?\?0[\s\S]*?:driftKinematicScale/,
  'airborne yaw must keep zero kinematic steering response even with later drift-force blends'
);
assert.match(presentation,/horizontalTravelDirection\(\{speed,heading,velocityHeading\}\)/,'crest launch does not use actual travel direction');
assert.doesNotMatch(presentation,/Math\.abs\(speed\)<=7\.5/,'legacy 7.5 m\/s launch threshold remains');
assert.doesNotMatch(presentation,/airborneTime>\.025/,'legacy airborne-time landing lockout remains');
assert.doesNotMatch(presentation,/verticalVelocity<=filteredSupportVelocity\+\.8/,'legacy landing velocity fudge remains');
assert.doesNotMatch(presentation,/airAttitudeRate/,'airborne body support plane still follows terrain');
assert.match(main,/getDrivingState:\(\)=>\(\{[\s\S]*?velocityHeading,/,'vehicle presentation does not receive velocityHeading');

console.log('GRIP R6 AIRBORNE DYNAMICS QA: PASS',{
  lowSpeedSharp,
  lowSpeedMild,
  travelHeadingUsesMomentum:true,
  airborneYawConserved:true,
  terrainAttitudeFollowRemoved:true
});
