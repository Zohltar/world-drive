import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createManeuverState,
  advanceHandbrakeRearSlipState,
  advanceJTurnLatchedState,
  jTurnEntryEligible,
  jTurnExitEligible
} from '../src/physics/maneuver-state.js';

const state=createManeuverState();
const hb1=state.advanceRearHandbrakeSlip({handbrake:true,airborne:false,speedAbs:20,sideslipRad:.2,dt:1/60});
const hb1Expected=advanceHandbrakeRearSlipState({previous:0,handbrake:true,airborne:false,speedAbs:20,sideslipRad:.2,dt:1/60});
assert.equal(hb1,hb1Expected,'controller must preserve first rear-handbrake slip step exactly');
const hb2=state.advanceRearHandbrakeSlip({handbrake:false,airborne:false,speedAbs:20,sideslipRad:.45,dt:1/60});
const hb2Expected=advanceHandbrakeRearSlipState({previous:hb1Expected,handbrake:false,airborne:false,speedAbs:20,sideslipRad:.45,dt:1/60});
assert.equal(hb2,hb2Expected,'controller must preserve rear-handbrake release step exactly');

const entryArgs={bodyLongitudinalSpeed:-12,speedAbs:12,steerAngle:.30,handbrake:false,airborne:false,onPavement:true,sideslipRad:0};
assert.equal(jTurnEntryEligible(entryArgs),true,'reverse J-turn entry sample must remain eligible');
const latched1=state.advanceJTurn(entryArgs);
assert.equal(latched1,advanceJTurnLatchedState({active:false,...entryArgs}),'controller J-turn entry must match pure transition');
const sidewaysArgs={bodyLongitudinalSpeed:0,speedAbs:12,steerAngle:.30,handbrake:false,airborne:false,onPavement:true,sideslipRad:Math.PI/2};
assert.equal(jTurnEntryEligible(sidewaysArgs),false,'90-degree region must not be a new entry');
assert.equal(jTurnExitEligible(sidewaysArgs),false,'90-degree region must not be an exit');
const latched90=state.advanceJTurn(sidewaysArgs);
assert.equal(latched90,true,'controller must preserve J-turn latch through 90 degrees');
const exitArgs={bodyLongitudinalSpeed:12,speedAbs:12,steerAngle:.30,handbrake:false,airborne:false,onPavement:true,sideslipRad:.02};
assert.equal(jTurnExitEligible(exitArgs),true,'forward realignment sample must be an exit');
assert.equal(state.advanceJTurn(exitArgs),false,'controller must release J-turn latch on the same exit condition');
const snap=state.snapshot();
assert.equal(snap.rearHandbrakeSlipState,hb2,'snapshot must expose owned rear-handbrake slip state');
assert.equal(snap.jTurnLatchedActive,false,'snapshot must expose owned J-turn latch state');

const runtimeSource=fs.readFileSync('src/driving-runtime-base.js','utf8');
const maneuverSource=fs.readFileSync('src/physics/maneuver-state.js','utf8');
assert.ok(runtimeSource.includes("from './physics/maneuver-state.js'"),'runtime must import maneuver-state module');
assert.ok(runtimeSource.includes('const maneuverState=createManeuverState();'),'runtime must instantiate one maneuver-state owner');
assert.ok(!runtimeSource.includes('let rearHandbrakeSlipState=0'),'runtime must not own rear handbrake slip memory');
assert.ok(!runtimeSource.includes('let jTurnLatchedActive=false'),'runtime must not own J-turn latch memory');
for(const name of ['jTurnEntryEligible','jTurnExitEligible','advanceJTurnLatchedState','advanceHandbrakeRearSlipState']){
  assert.ok(!runtimeSource.includes(`export function ${name}`),`runtime must not define maneuver helper ${name}`);
  assert.ok(maneuverSource.includes(`export function ${name}`),`maneuver-state must define helper ${name}`);
}
for(const forbidden of ['estimateWheelGripUsage','createPerWheelShadowSolver','lateralDynamicsEnvelope','yawResponseRate','driftTireForceAuthority']){
  assert.ok(!maneuverSource.includes(forbidden),`maneuver-state must not take ownership of tire/yaw physics: ${forbidden}`);
}
console.log('CLEANUP B3 MANEUVER STATE OWNERSHIP QA: PASS',{hb1,hb2,latched90});
