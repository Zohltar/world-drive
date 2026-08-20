import {laneKeepAssistCommand, clampDynamics} from '../src/vehicle-dynamics.js';
import fs from 'node:fs';

const fail=(m)=>{throw new Error(m)};
const mainSource=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
if(mainSource.includes('else if(steeringNeutral)'))fail('legacy manual heading/position lane assist is still present');
if(!mainSource.includes('input:assistedTurn'))fail('physical steering assist is not feeding the steering rack');
if(!mainSource.includes('const laneOffset=1.65'))fail('right-hand lane target offset missing');

const angleDelta=(target,current)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));

function laneTarget({x=0,z=0,routeHeading=0,laneOffset=1.65,lookAhead=20,routeDirection=1}={}){
  const travelHeading=routeHeading+(routeDirection<0?Math.PI:0);
  const tx=Math.sin(travelHeading)*lookAhead;
  const tz=Math.cos(travelHeading)*lookAhead;
  const rightX=Math.cos(travelHeading);
  const rightZ=-Math.sin(travelHeading);
  return {x:tx+rightX*laneOffset,z:tz+rightZ*laneOffset,travelHeading};
}

function assistFromPose({x=0,z=0,heading=0,routeHeading=0,routeDirection=1,speed=20,manual=0,frontSlip=0,rearSlip=0,hand=false,airborne=false}={}){
  const lookAhead=Math.max(10,Math.min(36,9+Math.abs(speed)*.72));
  const t=laneTarget({routeHeading,laneOffset:1.65,lookAhead,routeDirection});
  const desired=Math.atan2(t.x-x,t.z-z);
  const err=angleDelta(desired,heading);
  const out=laneKeepAssistCommand({
    speedAbs:Math.abs(speed),headingError:err,manualInput:manual,
    frontSlipAmount:frontSlip,rearSlipAmount:rearSlip,
    handbrake:hand,airborne
  });
  return {...out,err,target:t,combined:clampDynamics(manual+out.input,-1,1)};
}

// Right-hand traffic geometry: northbound uses +X lane, southbound uses -X lane.
const north=assistFromPose({heading:0,routeHeading:0,routeDirection:1,speed:20});
if(!(north.target.x>1.6&&north.input>0))fail(`northbound should steer into +X/right lane: x=${north.target.x}, input=${north.input}`);
const south=assistFromPose({heading:Math.PI,routeHeading:0,routeDirection:-1,speed:20});
if(!(south.target.x<-1.6&&south.input>0))fail(`southbound should steer into -X/right lane: x=${south.target.x}, input=${south.input}`);

// Once sitting in the right lane and aligned, assist should become almost zero.
const settled=assistFromPose({x:1.65,z:0,heading:0,routeHeading:0,routeDirection:1,speed:20});
if(Math.abs(settled.input)>.005)fail(`settled right lane should be neutral: ${settled.input}`);

// If the vehicle is too far right, it should steer left back toward lane centre.
const tooFarRight=assistFromPose({x:3.5,z:0,heading:0,routeHeading:0,routeDirection:1,speed:20});
if(!(tooFarRight.input<0))fail(`too far right should receive left correction: ${tooFarRight.input}`);

// Driver always wins: meaningful manual input must fade the assistance out.
const driver=assistFromPose({heading:0,routeHeading:0,routeDirection:1,speed:20,manual:-.35});
if(Math.abs(driver.input)>1e-9)fail(`assist must be zero with decisive driver input: ${driver.input}`);

// No magical recovery when grip is gone / handbrake / airborne.
const sliding=assistFromPose({heading:0,routeHeading:0,routeDirection:1,speed:20,rearSlip:.55});
if(Math.abs(sliding.input)>1e-9)fail(`assist must fade out during real slide: ${sliding.input}`);
const hand=assistFromPose({heading:0,routeHeading:0,routeDirection:1,speed:20,hand:true});
if(Math.abs(hand.input)>1e-9)fail(`assist must be off with handbrake: ${hand.input}`);
const air=assistFromPose({heading:0,routeHeading:0,routeDirection:1,speed:20,airborne:true});
if(Math.abs(air.input)>1e-9)fail(`assist must be off airborne: ${air.input}`);

// Assist contribution remains deliberately modest at road/highway speed.
for(const kmh of [30,60,100,150]){
  const r=assistFromPose({heading:0,routeHeading:0,routeDirection:1,speed:kmh/3.6});
  if(Math.abs(r.input)>.300001)fail(`${kmh} km/h assist exceeded 30% steering: ${r.input}`);
}

console.log('V21.21.18 LANE ASSIST QA: PASS');
console.log(`northbound target x=${north.target.x.toFixed(2)} m, assist=${north.input.toFixed(3)}`);
console.log(`southbound target x=${south.target.x.toFixed(2)} m, assist=${south.input.toFixed(3)}`);
console.log(`settled lane assist=${settled.input.toFixed(4)}, too-far-right assist=${tooFarRight.input.toFixed(3)}`);
console.log('driver/slip/handbrake/airborne authority checks: PASS');
