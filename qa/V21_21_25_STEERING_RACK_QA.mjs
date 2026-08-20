import assert from 'node:assert/strict';
import {createVehicleSystem} from '../src/vehicle-system.js';
import {
  steeringCommand,
  advanceSteeringRack,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage,
  yawResponseRate,
  GRAVITY
} from '../src/vehicle-dynamics.js';

const ids=['id4','wrx','civic','sonata','f1_2010','countach_80','i3_2017'];
for(const id of ids){
  const sys=createVehicleSystem({initialId:id});
  const v=sys.physics;
  assert.ok(v.steeringCenterToFullTimeSec>0,`${id}: missing finite steering travel time`);
  assert.ok(v.steeringReturnToCenterTimeSec>0,`${id}: missing return time`);
  const cmd=steeringCommand({vehicle:v,speedAbs:20,input:1});
  assert.ok(cmd.inputSlewRate>0,`${id}: missing input slew rate`);
  assert.ok(cmd.returnSlewRate>0,`${id}: missing return slew rate`);
}

const f1=createVehicleSystem({initialId:'f1_2010'}).physics;
assert.equal(f1.steeringGripEnvelopeFraction,0.82,'F1 should use more of its high-speed tire/aero envelope');
assert.equal(f1.steeringCenterToFullTimeSec,0.42,'F1 center-to-full rack time');
assert.equal(f1.yawResponseMultiplier,0.86,'F1 yaw response should be more willing than V21.21.24');

// Exact rack timing: 0 -> full in ~0.42 s; full left -> full right in ~0.84 s.
{
  const cmd=steeringCommand({vehicle:f1,speedAbs:30,input:1});
  const dt=1/240;
  let steer=0,t=0;
  while(t<0.21-1e-9){
    steer=advanceSteeringRack({current:steer,target:cmd.target,dt,inputSlewRate:cmd.inputSlewRate,returnSlewRate:cmd.returnSlewRate,inputRate:cmd.inputRate,returnRate:cmd.returnRate});
    t+=dt;
  }
  assert.ok(steer>.47&&steer<.53,`F1 half-time rack position should be ~0.5, got ${steer}`);
  while(t<0.42-1e-9){
    steer=advanceSteeringRack({current:steer,target:cmd.target,dt,inputSlewRate:cmd.inputSlewRate,returnSlewRate:cmd.returnSlewRate,inputRate:cmd.inputRate,returnRate:cmd.returnRate});
    t+=dt;
  }
  assert.ok(steer>.99,`F1 must reach full request in ~0.42 s, got ${steer}`);
  let reversal=steer,rt=0;
  const left=steeringCommand({vehicle:f1,speedAbs:30,input:-1});
  while(rt<0.42-1e-9){
    reversal=advanceSteeringRack({current:reversal,target:left.target,dt,inputSlewRate:left.inputSlewRate,returnSlewRate:left.returnSlewRate,inputRate:left.inputRate,returnRate:left.returnRate});
    rt+=dt;
  }
  assert.ok(Math.abs(reversal)<.03,`halfway through lock-to-lock reversal should cross center, got ${reversal}`);
  while(rt<0.84-1e-9){
    reversal=advanceSteeringRack({current:reversal,target:left.target,dt,inputSlewRate:left.inputSlewRate,returnSlewRate:left.returnSlewRate,inputRate:left.inputRate,returnRate:left.returnRate});
    rt+=dt;
  }
  assert.ok(reversal<-.99,`F1 lock-to-lock reversal should finish in ~0.84 s, got ${reversal}`);
}

const contacts=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
];
const surfaceMu=f1.longitudinalAccelLimit/GRAVITY;
const table=[];
for(const kph of [80,100,120,150,200,250,300]){
  const speed=kph/3.6;
  const cmd=steeringCommand({vehicle:f1,speedAbs:speed,input:1});
  const env=lateralDynamicsEnvelope({vehicle:f1,speed,steerAngle:cmd.maxRoadWheelAngle,steerInput:1,driveThrottle:0,onPavement:true,surfaceGrip:1,rearSlipAmount:0,airborne:false});
  const ratio=env.requestedLatAccel/env.latLimit;
  assert.ok(ratio<=.825,`${kph}: F1 full steering must retain a small tire reserve`);
  assert.ok(ratio>=.79,`${kph}: F1 high-speed steering should use substantially more envelope than V21.21.24`);
  const grip=estimateWheelGripUsage({
    requestedLatAccel:Math.min(env.requestedLatAccel,env.latLimit),
    signedLatAccel:Math.min(env.requestedLatAccel,env.latLimit),
    latLimit:env.latLimit,longitudinalAccel:0,propulsionAccel:0,serviceBrakeAccel:0,
    surfaceMu,throttle:0,handbrake:false,airborne:false,vehicle:f1,speedAbs:speed,
    dt:.05,contacts,previousUsage:[0,0,0,0]
  });
  assert.equal(Math.max(...grip.slip),0,`${kph}: steering alone should still not initiate F1 tire breakaway`);
  table.push({kph,angleDeg:cmd.maxRoadWheelAngle*180/Math.PI,requestedG:env.requestedLatAccel/GRAVITY,limitG:env.latLimit/GRAVITY,ratio,maxRaw:Math.max(...grip.raw)});
}
assert.ok(table.find(r=>r.kph===200).requestedG>3.4,'F1 should now be able to generate >3.4 g steering demand at 200 km/h');
assert.ok(table.find(r=>r.kph===250).requestedG>4.4,'F1 should now be able to generate >4.4 g steering demand at 250 km/h');

// Abrupt joystick reversals must be rate-limited at the rack, avoiding single-frame G shocks.
{
  const speed=100/3.6,dt=1/120;
  let steer=0,dynamicYaw=0,previousG=0,maxFrameDeltaG=0,maxAbsG=0;
  for(let frame=0;frame<360;frame++){
    const input=(Math.floor(frame/(.30*120))%2===0)?1:-1;
    const cmd=steeringCommand({vehicle:f1,speedAbs:speed,input});
    steer=advanceSteeringRack({current:steer,target:cmd.target,dt,inputSlewRate:cmd.inputSlewRate,returnSlewRate:cmd.returnSlewRate,inputRate:cmd.inputRate,returnRate:cmd.returnRate});
    const env=lateralDynamicsEnvelope({vehicle:f1,speed,steerAngle:steer*cmd.maxRoadWheelAngle,steerInput:steer,driveThrottle:0,onPavement:true,surfaceGrip:1,rearSlipAmount:0,airborne:false});
    dynamicYaw+=(env.yawRate-dynamicYaw)*(1-Math.exp(-dt*yawResponseRate({vehicle:f1,speedAbs:speed})));
    const g=speed*dynamicYaw/GRAVITY;
    maxFrameDeltaG=Math.max(maxFrameDeltaG,Math.abs(g-previousG));
    maxAbsG=Math.max(maxAbsG,Math.abs(g));
    previousG=g;
  }
  assert.ok(maxFrameDeltaG<.08,`100 km/h joystick reversal G spike too large: ${maxFrameDeltaG}`);
  assert.ok(maxAbsG<2.5,`100 km/h abusive reversal exceeded expected transient envelope: ${maxAbsG}`);
}

console.log('V21.21.25 STEERING RACK QA: PASS');
console.log(JSON.stringify(table,null,2));
