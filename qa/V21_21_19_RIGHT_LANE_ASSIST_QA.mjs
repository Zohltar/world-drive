import {laneKeepAssistCommand, clampDynamics} from '../src/vehicle-dynamics.js';
import fs from 'node:fs';

const fail=(m)=>{throw new Error(m)};
const mainSource=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
if(mainSource.includes('const rightX=Math.cos(targetHeading)'))fail('old left-lane normal still present');
if(!mainSource.includes('const rightX=-Math.cos(targetHeading)'))fail('correct right-hand X normal missing');
if(!mainSource.includes('const rightZ=Math.sin(targetHeading)'))fail('correct right-hand Z normal missing');
if(mainSource.includes('else if(steeringNeutral)'))fail('legacy magical manual lane recovery is still present');
if(!mainSource.includes('input:assistedTurn'))fail('physical steering assist is not feeding the steering rack');

const angleDelta=(target,current)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));

function laneTarget({x=0,z=0,routeHeading=0,laneOffset=1.65,lookAhead=20,routeDirection=1}={}){
  const travelHeading=routeHeading+(routeDirection<0?Math.PI:0);
  const tx=x+Math.sin(travelHeading)*lookAhead;
  const tz=z+Math.cos(travelHeading)*lookAhead;
  // World Drive geographic map: +X east, -Z north.
  const rightX=-Math.cos(travelHeading);
  const rightZ=Math.sin(travelHeading);
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

// Real-world cardinal directions with World Drive's llToXZ mapping:
// north=-Z (heading PI), east=+X (PI/2), south=+Z (0), west=-X (-PI/2).
const north=laneTarget({routeHeading:Math.PI});
if(!(north.x>1.60&&north.z<0))fail(`northbound right lane must be east/+X: ${JSON.stringify(north)}`);
const south=laneTarget({routeHeading:0});
if(!(south.x<-1.60&&south.z>0))fail(`southbound right lane must be west/-X: ${JSON.stringify(south)}`);
const east=laneTarget({routeHeading:Math.PI/2});
if(!(east.x>0&&east.z>1.60))fail(`eastbound right lane must be south/+Z: ${JSON.stringify(east)}`);
const west=laneTarget({routeHeading:-Math.PI/2});
if(!(west.x<0&&west.z<-1.60))fail(`westbound right lane must be north/-Z: ${JSON.stringify(west)}`);

// Same physical route, reverse traversal: right side must flip automatically.
const reverseNorth=laneTarget({routeHeading:0,routeDirection:-1});
if(!(reverseNorth.x>1.60))fail(`reverse/northbound right lane must be +X: ${JSON.stringify(reverseNorth)}`);

// Verify steering request points toward the corrected right-lane target.
const northAssist=assistFromPose({heading:Math.PI,routeHeading:Math.PI,speed:20});
if(Math.abs(northAssist.input)<.01)fail('northbound centered-road pose should request steering toward right lane');
const settledNorth=assistFromPose({x:1.65,z:0,heading:Math.PI,routeHeading:Math.PI,speed:20});
if(Math.abs(settledNorth.input)>.005)fail(`settled northbound right lane should be neutral: ${settledNorth.input}`);

// Driver always wins; assist still disappears during genuine slip/air/handbrake.
const driver=assistFromPose({heading:Math.PI,routeHeading:Math.PI,speed:20,manual:.35});
if(Math.abs(driver.input)>1e-9)fail(`assist must be zero with decisive driver input: ${driver.input}`);
const sliding=assistFromPose({heading:Math.PI,routeHeading:Math.PI,speed:20,rearSlip:.55});
if(Math.abs(sliding.input)>1e-9)fail(`assist must fade out during real slide: ${sliding.input}`);
const hand=assistFromPose({heading:Math.PI,routeHeading:Math.PI,speed:20,hand:true});
if(Math.abs(hand.input)>1e-9)fail(`assist must be off with handbrake: ${hand.input}`);
const air=assistFromPose({heading:Math.PI,routeHeading:Math.PI,speed:20,airborne:true});
if(Math.abs(air.input)>1e-9)fail(`assist must be off airborne: ${air.input}`);

console.log('V21.21.19 RIGHT-LANE ASSIST QA: PASS');
console.log(`north right-lane x=${north.x.toFixed(2)} (east/+X)`);
console.log(`south right-lane x=${south.x.toFixed(2)} (west/-X)`);
console.log(`east right-lane z=${east.z.toFixed(2)} (south/+Z)`);
console.log(`west right-lane z=${west.z.toFixed(2)} (north/-Z)`);
console.log(`settled north assist=${settledNorth.input.toFixed(4)}`);
