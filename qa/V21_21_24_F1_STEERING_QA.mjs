import assert from 'node:assert/strict';
import {createVehicleSystem} from '../src/vehicle-system.js';
import {
  steeringCommand,
  advanceSteeringRack,
  lateralDynamicsEnvelope,
  estimateWheelGripUsage,
  longitudinalTractionLimit,
  yawResponseRate,
  GRAVITY
} from '../src/vehicle-dynamics.js';

const sys=createVehicleSystem({initialId:'f1_2010'});
const f1=sys.physics;
assert.equal(f1.roadGripMultiplier,1.00,'F1 grip must not multiply geometric yaw');
assert.ok(f1.steeringGripEnvelopeFraction>=0.66&&f1.steeringGripEnvelopeFraction<=0.82,'F1 steering reserve/envelope');
assert.ok(f1.maxSteerLow<=.34+1e-12,'F1 low-speed lock should be progressive');
assert.ok(f1.steeringResponseLow<=2.55+1e-12,'F1 low-speed rack attack should be softened');
assert.ok(f1.yawResponseMultiplier<1,'F1 transient yaw buildup should be damped');

const contacts=[
  {front:false,side:'left',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'left',axleIndex:0,contact:true,contactFactor:1},
  {front:false,side:'right',axleIndex:1,contact:true,contactFactor:1},
  {front:true,side:'right',axleIndex:0,contact:true,contactFactor:1}
];
const surfaceMu=f1.longitudinalAccelLimit/GRAVITY;
const table=[];
for(const kph of [20,40,60,80,100,120,150,200,250,300]){
  const speed=kph/3.6;
  const right=steeringCommand({vehicle:f1,speedAbs:speed,input:1});
  const left=steeringCommand({vehicle:f1,speedAbs:speed,input:-1});
  assert.ok(Math.abs(right.maxRoadWheelAngle-left.maxRoadWheelAngle)<1e-12,`${kph}: steering must be symmetric`);
  assert.ok(Math.abs(right.target+left.target)<1e-12,`${kph}: shaped input must be symmetric`);
  const env=lateralDynamicsEnvelope({
    vehicle:f1,speed,steerAngle:right.maxRoadWheelAngle,steerInput:1,driveThrottle:0,
    onPavement:true,surfaceGrip:1,rearSlipAmount:0,airborne:false
  });
  const ratio=env.requestedLatAccel/env.latLimit;
  if(kph>=60)assert.ok(ratio<=f1.steeringGripEnvelopeFraction+.005,`${kph}: full steering should remain inside configured lateral envelope`);
  const grip=estimateWheelGripUsage({
    requestedLatAccel:Math.min(env.requestedLatAccel,env.latLimit),
    signedLatAccel:Math.min(env.requestedLatAccel,env.latLimit),
    latLimit:env.latLimit,longitudinalAccel:0,propulsionAccel:0,serviceBrakeAccel:0,
    surfaceMu,throttle:0,handbrake:false,airborne:false,vehicle:f1,speedAbs:speed,
    dt:.05,contacts,previousUsage:[0,0,0,0]
  });
  assert.equal(Math.max(...grip.slip),0,`${kph}: steering alone must not break F1 traction`);
  table.push({kph,angleDeg:right.maxRoadWheelAngle*180/Math.PI,requestedG:env.requestedLatAccel/GRAVITY,limitG:env.latLimit/GRAVITY,ratio,maxRaw:Math.max(...grip.raw)});
}

// Full throttle + full steering at representative low/medium speeds should use
// much of the circle without immediately throwing the car into a four-wheel slide.
for(const kph of [20,40,60,80,100]){
  const speed=kph/3.6;
  const cmd=steeringCommand({vehicle:f1,speedAbs:speed,input:1});
  const env=lateralDynamicsEnvelope({vehicle:f1,speed,steerAngle:cmd.maxRoadWheelAngle,steerInput:1,driveThrottle:1,onPavement:true,surfaceGrip:1,rearSlipAmount:0,airborne:false});
  const requestedDrive=f1.accel*(1-.38*Math.min(1,speed/(360/3.6)));
  const drive=longitudinalTractionLimit({vehicle:f1,requestedAccel:requestedDrive,surfaceMu,mode:'drive',airborne:false,speedAbs:speed});
  const grip=estimateWheelGripUsage({
    requestedLatAccel:Math.min(env.requestedLatAccel,env.latLimit),signedLatAccel:Math.min(env.requestedLatAccel,env.latLimit),latLimit:env.latLimit,
    longitudinalAccel:drive.acceleration,propulsionAccel:drive.acceleration,serviceBrakeAccel:0,surfaceMu,
    throttle:1,handbrake:false,airborne:false,vehicle:f1,speedAbs:speed,dt:.05,contacts,previousUsage:[0,0,0,0]
  });
  assert.equal(Math.max(...grip.slip),0,`${kph}: full throttle + steering should not instantly four-wheel slide`);
}

// Digital left/right hammering at 40 km/h: verify the rack/yaw filters remove
// single-frame G shocks even under deliberately abusive control input.
{
  const speed=40/3.6,dt=1/60;
  let steer=0,dynamicYaw=0,previousG=0,maxFrameDeltaG=0,maxAbsG=0;
  for(let frame=0;frame<180;frame++){
    const input=(Math.floor(frame/(.35*60))%2===0)?1:-1;
    const cmd=steeringCommand({vehicle:f1,speedAbs:speed,input});
    steer=advanceSteeringRack({current:steer,target:cmd.target,dt,inputSlewRate:cmd.inputSlewRate,returnSlewRate:cmd.returnSlewRate,inputRate:cmd.inputRate,returnRate:cmd.returnRate});
    const env=lateralDynamicsEnvelope({vehicle:f1,speed,steerAngle:steer*cmd.maxRoadWheelAngle,steerInput:steer,driveThrottle:0,onPavement:true,surfaceGrip:1,rearSlipAmount:0,airborne:false});
    dynamicYaw+=(env.yawRate-dynamicYaw)*(1-Math.exp(-dt*yawResponseRate({vehicle:f1,speedAbs:speed})));
    const g=speed*dynamicYaw/GRAVITY;
    maxFrameDeltaG=Math.max(maxFrameDeltaG,Math.abs(g-previousG));
    maxAbsG=Math.max(maxAbsG,Math.abs(g));
    previousG=g;
  }
  assert.ok(maxFrameDeltaG<.08,`40 km/h steering reversal G spike too large: ${maxFrameDeltaG}`);
  assert.ok(maxAbsG<1.30,`40 km/h abusive zig-zag too violent: ${maxAbsG} g`);
}

console.log('V21.21.24 F1 STEERING QA: PASS');
console.log(JSON.stringify(table,null,2));
