import { antiRollCalibration } from '../src/vehicle-dynamics.js';

function assert(cond,msg){ if(!cond)throw new Error(msg); }

const vehicles=[
  ['civic',{drivetrain:'FWD',vehicleClass:'passenger',frontWeightBias:.61,suspensionResponse:15,cgHeight:.50,trackWidth:1.55,wheelbase:2.70,massKg:1345}],
  ['wrx',{drivetrain:'AWD',vehicleClass:'passenger',frontWeightBias:.58,suspensionResponse:18,cgHeight:.50,trackWidth:1.56,wheelbase:2.65,massKg:1510}],
  ['f1',{drivetrain:'RWD',vehicleClass:'racecar',frontWeightBias:.46,suspensionResponse:22,cgHeight:.30,trackWidth:1.80,wheelbase:3.15,massKg:740}],
  ['truck',{drivetrain:'RWD',vehicleClass:'tractor',frontWeightBias:.33,suspensionResponse:11,cgHeight:1.05,trackWidth:2.05,wheelbase:4.0,massKg:8500}],
];
for(const [name,v] of vehicles){
  const c=antiRollCalibration(v);
  assert(c.strength>0,`${name}: anti-roll strength must be positive`);
  assert(c.frontBalance>0&&c.frontBalance<1,`${name}: front balance invalid`);
}
console.log('V21.30 anti-roll visual calibration QA passed');
