import assert from 'node:assert/strict';
import {crestLaunchDecision} from '../src/physics/airborne-dynamics.js';

const G=9.80665;
const ACCEL_TOLERANCE=.18;
const T=.075;

function crestDecision({radiusM,speedMps}){
  // Local crest y(x)=-x²/(2R) at x=0. Its required downward support
  // acceleration is exactly -v²/R, so contact is lost when the terrain falls
  // away faster than gravity/aero can keep the chassis attached.
  const current=0;
  const futureTravel=Math.abs(speedMps)*T;
  const future=-(futureTravel*futureTravel)/(2*radiusM);
  return crestLaunchDecision({
    speedAbs:Math.abs(speedMps),
    supportOriginY:current,
    futureSupportY:future,
    supportVerticalVelocity:0,
    predictionTime:T,
    downwardAccel:G
  });
}

for(const radiusM of [35,50,100,150,250]){
  const threshold=Math.sqrt((G+ACCEL_TOLERANCE)*radiusM);
  const below=crestDecision({radiusM,speedMps:threshold*.985});
  const above=crestDecision({radiusM,speedMps:threshold*1.015});
  assert.equal(below.canLaunch,false,`crest R=${radiusM}m launches below gravity threshold`);
  assert.equal(above.canLaunch,true,`crest R=${radiusM}m fails to launch above gravity threshold`);
  assert.ok(Math.abs(above.requiredSupportAccel+Math.pow(threshold*1.015,2)/radiusM)<1e-9,
    'crest acceleration estimate drifted from v^2/R');
}

// Regression for the removed 7.5 m/s gameplay gate: a sufficiently sharp
// edge can cause real contact loss below 27 km/h.
{
  const speedMps=5;
  const radiusM=2;
  const result=crestDecision({radiusM,speedMps});
  assert.equal(result.canLaunch,true,`low-speed sharp crest should physically separate: ${JSON.stringify(result)}`);
}

console.log('V21.27 / GRIP R6 CREST LAUNCH QA: PASS');
console.log('crest separation now tests the production gravity/contact helper directly');
