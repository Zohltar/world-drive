import assert from 'node:assert/strict';
import {createVehicleSystem,validateVehicleProfiles} from '../src/vehicle-system.js';
import {
  aerodynamicLoad,
  lateralDynamicsEnvelope,
  longitudinalTractionLimit,
  vehicleLayout
} from '../src/vehicle-dynamics.js';

const expectedMasses={
  id4:2226,
  wrx:1510,
  civic:1345,
  sonata:1584,
  f1_2010:740,
  countach_80:1490,
  i3_2017:1343
};

const sys=createVehicleSystem({initialId:'wrx'});
assert.equal(validateVehicleProfiles().ok,true,'vehicle registry must validate');

for(const [id,massKg] of Object.entries(expectedMasses)){
  if(sys.activeId!==id)sys.select(id);
  assert.equal(sys.physics.massKg,massKg,`${id}: mass`);
  assert.equal(vehicleLayout(sys.physics).massKg,massKg,`${id}: layout mass`);
  const aero=aerodynamicLoad({vehicle:sys.physics,speedAbs:200/3.6});
  if(id==='f1_2010'){
    assert.ok(aero.downforceN>8500&&aero.downforceN<8750,'F1 downforce at 200 km/h ~8.62 kN');
    assert.ok(aero.gripScale>1.95&&aero.gripScale<2.05,'F1 grip multiplier at 200 km/h ~2.0x');
  }else{
    assert.equal(aero.downforceN,0,`${id}: no synthetic downforce`);
    assert.equal(aero.gripScale,1,`${id}: no aero grip multiplier`);
  }
}

sys.select('f1_2010');
const f1=sys.physics;
const speeds=[0,50,100,150,200,250,300];
let prevDownforce=-1,prevGrip=-1;
for(const kmh of speeds){
  const speed=kmh/3.6;
  const aero=aerodynamicLoad({vehicle:f1,speedAbs:speed});
  assert.ok(aero.downforceN>=prevDownforce-1e-9,`downforce monotonic at ${kmh}`);
  assert.ok(aero.gripScale>=prevGrip-1e-9,`grip monotonic at ${kmh}`);
  prevDownforce=aero.downforceN;prevGrip=aero.gripScale;
}

const aero200=aerodynamicLoad({vehicle:f1,speedAbs:200/3.6});
const aero300=aerodynamicLoad({vehicle:f1,speedAbs:300/3.6});
assert.ok(Math.abs(aero300.downforceN/aero200.downforceN-2.25)<1e-9,'downforce follows v^2');
assert.equal(aero300.gripScale,3,'F1 aero grip cap at 300 km/h');
assert.equal(aerodynamicLoad({vehicle:f1,speedAbs:200/3.6,airborne:true}).downforceN,0,'airborne tires get no aero normal load');

const lat0=lateralDynamicsEnvelope({vehicle:f1,speed:0,steerAngle:.1,steerInput:.5,onPavement:true});
const lat100=lateralDynamicsEnvelope({vehicle:f1,speed:100/3.6,steerAngle:.1,steerInput:.5,onPavement:true});
const lat200=lateralDynamicsEnvelope({vehicle:f1,speed:200/3.6,steerAngle:.1,steerInput:.5,onPavement:true});
assert.equal(lat0.aeroGripScale,1);
assert.ok(lat100.latLimit>lat0.latLimit,'F1 lateral limit grows with speed');
assert.ok(lat200.latLimit>lat100.latLimit,'F1 lateral limit continues to grow');

const brake0=longitudinalTractionLimit({vehicle:f1,requestedAccel:-50,surfaceMu:2.0,mode:'brake',speedAbs:0});
const brake200=longitudinalTractionLimit({vehicle:f1,requestedAccel:-50,surfaceMu:2.0,mode:'brake',speedAbs:200/3.6});
assert.ok(Math.abs(brake200.acceleration)>Math.abs(brake0.acceleration)*2,'downforce increases high-speed braking capacity');

// Road-car behavior should be unchanged by speed when no aero metadata exists.
sys.select('wrx');
const wrx0=longitudinalTractionLimit({vehicle:sys.physics,requestedAccel:20,surfaceMu:1.1,mode:'drive',speedAbs:0});
const wrx200=longitudinalTractionLimit({vehicle:sys.physics,requestedAccel:20,surfaceMu:1.1,mode:'drive',speedAbs:200/3.6});
assert.ok(Math.abs(wrx0.limit-wrx200.limit)<1e-12,'road-car traction unchanged by aero model');

console.log('V21.21.21 real-mass/aero QA PASS');
console.log(JSON.stringify({
  masses:expectedMasses,
  f1At200Kmh:{downforceN:aero200.downforceN,downforceKgEquivalent:aero200.downforceN/9.80665,gripScale:aero200.gripScale},
  f1At300Kmh:{downforceN:aero300.downforceN,downforceKgEquivalent:aero300.downforceN/9.80665,gripScale:aero300.gripScale},
  f1LatLimit:{at100:lat100.latLimit,at200:lat200.latLimit},
  f1BrakeLimit:{at0:brake0.limit,at200:brake200.limit}
},null,2));
