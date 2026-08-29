import assert from "node:assert/strict";
import {advanceHandbrakeRearSlipState,rearContactPatchSideslip} from "./src/driving-runtime-base.js";
import {estimateWheelGripUsage} from "./src/vehicle-dynamics-base.js";

function evolve({state=0,handbrake=false,speedAbs=20,sideslipRad=0,seconds=.1,dt=.01}={}){let v=state;for(let t=0;t<seconds-1e-9;t+=dt)v=advanceHandbrakeRearSlipState({previous:v,handbrake,airborne:false,speedAbs,sideslipRad,dt});return v;}
const engaged=evolve({handbrake:true,seconds:.12});
assert.ok(engaged>.88);
const oneFrameRelease=advanceHandbrakeRearSlipState({previous:1,handbrake:false,speedAbs:20,sideslipRad:.45,dt:1/60});
assert.ok(oneFrameRelease>.90);
const partialRelease=evolve({state:1,handbrake:false,sideslipRad:.45,seconds:.20});
assert.ok(partialRelease>.35&&partialRelease<.80);
const settled=evolve({state:1,handbrake:false,sideslipRad:0,seconds:1.5});
assert.ok(settled<.01);
const vehicle={massKg:1500,wheelbase:2.65,trackWidth:1.56,frontWeightBias:.58,cgHeight:.52,drivetrain:"AWD",frontTireGripScale:1,rearTireGripScale:1,absEnabled:true,handbrakeSlidingMuRatio:.72};
function grip(s,b){return estimateWheelGripUsage({requestedLatAccel:6,signedLatAccel:6,latLimit:8,longitudinalAccel:0,propulsionAccel:0,serviceBrakeAccel:0,surfaceMu:1,throttle:0,handbrake:s>.99,handbrakeSlipState:s,sideslipRad:b,airborne:false,vehicle,speedAbs:20,dt:.016,contacts:[],previousUsage:[0,0,0,0]},{});}
const rolling=grip(0,0),locked20=grip(1,20*Math.PI/180),locked45=grip(1,45*Math.PI/180);
assert.ok(rolling.rearLateralForceScale>.90);
assert.ok(locked20.rearLateralForceScale>.10&&locked20.rearLateralForceScale<.38);
assert.ok(locked20.rearLateralForceScale<rolling.rearLateralForceScale-.10);
assert.ok(locked45.rearLateralForceScale>locked20.rearLateralForceScale+.12&&locked45.rearLateralForceScale<.72);
assert.equal(locked20.handbrakeSlidingMuRatio,.72);
const body20=20*Math.PI/180;
const rearBeta=rearContactPatchSideslip({speed:20,heading:0,velocityHeading:body20,yawRate:1,wheelbase:2.65,frontWeightBias:.58});
assert.ok(Math.abs(rearBeta)<body20-.04,`rear contact patch should see less sideslip while yawing into the turn: ${rearBeta}`);
console.log("PASS Grip R2",{engaged,oneFrameRelease,partialRelease,settled,rollingRear:rolling.rearLateralForceScale,locked20Rear:locked20.rearLateralForceScale,locked45Rear:locked45.rearLateralForceScale});
