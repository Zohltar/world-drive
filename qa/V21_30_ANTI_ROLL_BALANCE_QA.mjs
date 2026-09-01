import assert from 'node:assert/strict';
import {antiRollCalibration,antiRollAxleGripScales} from '../src/physics/vehicle-dynamics.js';

const WRX={drivetrain:'AWD',vehicleClass:'passenger',frontWeightBias:.58,suspensionResponse:18,cgHeight:.50,wheelbase:2.65,trackWidth:1.56,massKg:1510};
const CIVIC={drivetrain:'FWD',vehicleClass:'passenger',frontWeightBias:.61,suspensionResponse:15,cgHeight:.50,wheelbase:2.70,trackWidth:1.55,massKg:1345};
const ID4={drivetrain:'AWD',vehicleClass:'passenger',frontWeightBias:.48,suspensionResponse:14,cgHeight:.56,wheelbase:2.77,trackWidth:1.59,massKg:2226};
const F1={drivetrain:'RWD',vehicleClass:'racecar',frontWeightBias:.46,suspensionResponse:22,cgHeight:.30,wheelbase:3.15,trackWidth:1.80,massKg:740};

for(const vehicle of [WRX,CIVIC,ID4,F1]){
  const gentle=antiRollAxleGripScales({vehicle,signedLatAccel:2.0});
  assert.ok(Math.abs(gentle.front-1)<1e-6,'gentle driving must leave front grip unchanged');
  assert.ok(Math.abs(gentle.rear-1)<1e-6,'gentle driving must leave rear grip unchanged');
}

const civic=antiRollAxleGripScales({vehicle:CIVIC,signedLatAccel:8.53});
assert.ok(civic.front<.985,'Civic front-biased roll couple should reduce front axle capacity near limit');
assert.ok(civic.rear>1,'Civic rear axle should gain a small relative capacity relief');
assert.ok(civic.front>.96,'Civic anti-roll effect must remain subtle rather than replacing tire grip');

const wrx=antiRollAxleGripScales({vehicle:WRX,signedLatAccel:9.32});
assert.ok(wrx.rear<.99,'sport AWD calibration should put slightly more roll work on the rear axle');
assert.ok(wrx.front>1,'WRX front axle should receive a small relative relief');
assert.ok(wrx.rear>.96,'WRX rear penalty must remain progressive and recoverable');

const id4=antiRollAxleGripScales({vehicle:ID4,signedLatAccel:8.43});
assert.ok(id4.front<1&&id4.front>.975,'heavy AWD crossover should remain mildly front-biased');

const f1=antiRollAxleGripScales({vehicle:F1,signedLatAccel:20.5});
assert.ok(f1.front<1&&f1.front>.97,'racecar roll balance should be present but small versus aero/tire grip');

const cCivic=antiRollCalibration(CIVIC);
const cWrx=antiRollCalibration(WRX);
assert.ok(cCivic.frontBalance>CIVIC.frontWeightBias,'FWD calibration must be front roll-stiffness biased');
assert.ok(cWrx.frontBalance<WRX.frontWeightBias,'sport AWD calibration should be slightly rear roll-stiffness biased');

console.log('V21.30 anti-roll balance QA OK',{
  civic:{front:civic.front,rear:civic.rear,balance:civic.frontBalance},
  wrx:{front:wrx.front,rear:wrx.rear,balance:wrx.frontBalance},
  id4:{front:id4.front,rear:id4.rear,balance:id4.frontBalance},
  f1:{front:f1.front,rear:f1.rear,balance:f1.frontBalance}
});
