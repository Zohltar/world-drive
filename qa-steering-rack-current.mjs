import assert from 'node:assert/strict';
import {createVehicleSystem} from './src/vehicles/vehicle-system.js';
import {steeringCommand,advanceSteeringRack,yawResponseRate} from './src/physics/vehicle-dynamics.js';

const ids=['id4','wrx','civic','sonata','f1_2010','countach_80','i3_2017'];
for(const id of ids){
  const sys=createVehicleSystem({initialId:id});
  const v=sys.physics;
  assert.ok(v.steeringCenterToFullTimeSec>0,`${id}: missing finite steering travel time`);
  assert.ok(v.steeringReturnToCenterTimeSec>0,`${id}: missing steering return time`);
  const cmd=steeringCommand({vehicle:v,speedAbs:20,input:1},{});
  assert.ok(cmd.inputSlewRate>0,`${id}: missing input slew rate`);
  assert.ok(cmd.returnSlewRate>0,`${id}: missing return slew rate`);
  assert.ok(Math.abs(cmd.target-1)<1e-12,`${id}: full stick must retain full target authority`);
}

const f1=createVehicleSystem({initialId:'f1_2010'}).physics;
assert.equal(f1.steeringCenterToFullTimeSec,0.42,'F1 center-to-full rack time');
assert.equal(f1.steeringReturnToCenterTimeSec,0.30,'F1 return-to-center rack time');
assert.equal(f1.yawResponseMultiplier,0.86,'F1 yaw response calibration');
assert.equal(f1.legacyDriftAssist,false,'F1 rack QA must exercise physical-only drift profile');

// Exact active rack timing at a speed below the R22.1 ultra-high-speed stage.
{
  const speed=30,dt=1/240;
  const right=steeringCommand({vehicle:f1,speedAbs:speed,input:1},{});
  let steer=0,t=0;
  while(t<0.21-1e-9){
    steer=advanceSteeringRack({current:steer,target:right.target,dt,inputSlewRate:right.inputSlewRate,returnSlewRate:right.returnSlewRate,inputRate:right.inputRate,returnRate:right.returnRate});
    t+=dt;
  }
  assert.ok(steer>.47&&steer<.53,`F1 half-time rack position should be ~0.5, got ${steer}`);
  while(t<0.42-1e-9){
    steer=advanceSteeringRack({current:steer,target:right.target,dt,inputSlewRate:right.inputSlewRate,returnSlewRate:right.returnSlewRate,inputRate:right.inputRate,returnRate:right.returnRate});
    t+=dt;
  }
  assert.ok(steer>.99,`F1 must reach full request in ~0.42 s, got ${steer}`);

  const left=steeringCommand({vehicle:f1,speedAbs:speed,input:-1},{});
  let reversal=steer,rt=0;
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

// Input shaping is symmetric at representative speeds and remains monotonic.
for(const kmh of [40,100,150,180,220,260,300]){
  let previous=0;
  for(const input of [.15,.25,.5,.7,.85,1]){
    const right=steeringCommand({vehicle:f1,speedAbs:kmh/3.6,input},{});
    const left=steeringCommand({vehicle:f1,speedAbs:kmh/3.6,input:-input},{});
    assert.ok(Math.abs(right.target+left.target)<1e-12,`${kmh}: F1 steering shaping must stay symmetric`);
    assert.ok(Math.abs(right.target)>previous,`${kmh}: F1 steering shaping must remain monotonic at ${input}`);
    previous=Math.abs(right.target);
  }
}

// Yaw response remains finite and positive across the full F1 speed range.
for(const kmh of [0,50,150,220,300]){
  const rate=yawResponseRate({vehicle:f1,speedAbs:kmh/3.6});
  assert.ok(Number.isFinite(rate)&&rate>0,`${kmh}: invalid F1 yaw response rate ${rate}`);
}

console.log('CURRENT STEERING RACK QA: PASS');
